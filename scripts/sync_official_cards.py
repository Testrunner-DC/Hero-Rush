#!/usr/bin/env python3
"""Audit or apply a safe synchronization from the official Hero Rush card API.

Default mode is read-only apart from the ignored .tmp snapshot. Use --apply to
update the canonical JSON/XLSX, download only missing assets, normalize them,
and rebuild public/cards.json.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from card_image_pipeline import (
    DEFAULT_WEBP_QUALITY,
    TARGET_SIZE,
    inspect_bytes,
    normalize_bytes,
    write_atomic,
)


GAME_ID = 1997202442796032
API_URL = f"https://zhanshuang-prod-api.janime.cn/api/v1/app/card/{GAME_ID}/list"
PAGE_SIZE = 100
RARITY_CODES = {
    1: "PR",
    2: "TR",
    3: "C",
    4: "U",
    5: "R",
    6: "M",
    7: "SR",
    8: "GR",
    9: "UR",
    10: "MR",
    11: "SEC",
    12: "HRS",
    13: "HRG",
}
EXCEL_HEADERS = [
    "card_no",
    "name",
    "card_type",
    "rarity",
    "cost",
    "attribute",
    "pp_value",
    "dp_value",
    "signal_color",
    "feature",
    "effect",
    "package_id",
    "game_id",
]
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_DIR = (
    ROOT.parent / "source-library" / "workbuddy-herorush-bundle"
)
DEFAULT_STAGE_DIR = ROOT / ".tmp" / "official-card-sync" / "current"
HEADERS = {
    "User-Agent": "Hero-Rush-card-sync/1.0",
    "Referer": "https://zhanshuang-prod.janime.cn/",
}


def semantic_key(card: dict[str, Any]) -> tuple[str, int]:
    return str(card.get("card_no") or ""), int(card.get("rarity"))


def asset_stem(card: dict[str, Any]) -> str:
    number = str(card["card_no"])
    rarity = int(card["rarity"])
    try:
        code = RARITY_CODES[rarity]
    except KeyError as exc:
        raise ValueError(f"unsupported rarity {rarity} for {number}") from exc
    if "（金）" in number:
        return f"{number.replace('（金）', '')}-{code}(G)"
    if "（银）" in number:
        return f"{number.replace('（银）', '')}-{code}(S)"
    return f"{number}-{code}"


def request_bytes(url: str, timeout: int = 60) -> bytes:
    parts = urllib.parse.urlsplit(url)
    encoded_url = urllib.parse.urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            urllib.parse.quote(parts.path, safe="/%"),
            urllib.parse.quote_plus(parts.query, safe="=&%"),
            parts.fragment,
        )
    )
    request = urllib.request.Request(encoded_url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_official(stage_dir: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    stage_dir.mkdir(parents=True, exist_ok=True)
    first = json.loads(request_bytes(f"{API_URL}?page=1&size={PAGE_SIZE}"))
    if first.get("code") != 200:
        raise RuntimeError(f"official API returned code={first.get('code')}")
    first_data = first.get("data") or {}
    pages = int(first_data.get("pages") or 0)
    total = int(first_data.get("total") or 0)
    if pages < 1 or pages > 20 or total < 1:
        raise RuntimeError(f"invalid pagination metadata: total={total}, pages={pages}")

    items: list[dict[str, Any]] = []
    page_summaries: list[dict[str, int]] = []
    for page_number in range(1, pages + 1):
        payload = first if page_number == 1 else json.loads(
            request_bytes(f"{API_URL}?page={page_number}&size={PAGE_SIZE}")
        )
        data = payload.get("data") or {}
        page_items = data.get("items") or []
        if int(data.get("page") or 0) != page_number:
            raise RuntimeError(f"page mismatch for request {page_number}")
        if int(data.get("total") or 0) != total:
            raise RuntimeError(f"total changed while paging at page {page_number}")
        page_path = stage_dir / f"page-{page_number}.json"
        write_atomic(
            page_path,
            (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
        )
        items.extend(page_items)
        page_summaries.append(
            {"page": page_number, "items": len(page_items), "size": int(data["size"])}
        )

    ids = [str(card.get("id")) for card in items]
    variants = [semantic_key(card) for card in items]
    if len(items) != total:
        raise RuntimeError(f"expected {total} API records, received {len(items)}")
    if len(ids) != len(set(ids)):
        raise RuntimeError("official API contains duplicate numeric ids")
    if len(variants) != len(set(variants)):
        raise RuntimeError("official API contains duplicate (card_no, rarity) variants")

    return items, {
        "url": API_URL,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "pages": page_summaries,
    }


def apply_corrections(
    cards: list[dict[str, Any]],
    correction_file: Path,
) -> tuple[list[dict[str, Any]], int]:
    payload = json.loads(correction_file.read_text(encoding="utf-8"))
    patches = payload.get("patches") or {}
    applied = 0
    for card in cards:
        patch = patches.get(card.get("card_no"))
        if not patch:
            continue
        for field, value in patch.items():
            if card.get(field) != value:
                card[field] = value
                applied += 1
    return cards, applied


def merge_cards(
    official: list[dict[str, Any]],
    local: list[dict[str, Any]],
    correction_file: Path,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    official_ids = {str(card["id"]) for card in official}
    official_variants = {semantic_key(card) for card in official}

    # A changed upstream numeric id must not create a second copy of the same
    # card variant. Local-only cards are retained only when both identifiers
    # are absent upstream.
    local_only = [
        card
        for card in local
        if str(card.get("id")) not in official_ids
        and semantic_key(card) not in official_variants
    ]
    discarded_replacements = [
        card
        for card in local
        if str(card.get("id")) not in official_ids
        and semantic_key(card) in official_variants
    ]

    merged = [dict(card) for card in official] + [dict(card) for card in local_only]
    merged, patch_changes = apply_corrections(merged, correction_file)
    merged.sort(
        key=lambda card: (
            str(card.get("card_no") or ""),
            -int(card.get("rarity") or 0),
            str(card.get("id") or ""),
        )
    )

    ids = [str(card["id"]) for card in merged]
    variants = [semantic_key(card) for card in merged]
    unsupported = sorted({int(card["rarity"]) for card in merged} - set(RARITY_CODES))
    if unsupported:
        raise RuntimeError(f"unsupported rarity values: {unsupported}")
    if len(ids) != len(set(ids)):
        raise RuntimeError("merged data contains duplicate numeric ids")
    if len(variants) != len(set(variants)):
        duplicates = [key for key, count in Counter(variants).items() if count > 1]
        raise RuntimeError(f"merged data contains duplicate variants: {duplicates}")

    old_by_id = {str(card.get("id")): card for card in local}
    new_by_id = {str(card.get("id")): card for card in merged}
    added = sorted(set(new_by_id) - set(old_by_id))
    removed = sorted(set(old_by_id) - set(new_by_id))
    changed = sorted(
        card_id
        for card_id in set(old_by_id) & set(new_by_id)
        if old_by_id[card_id] != new_by_id[card_id]
    )
    return merged, {
        "added_ids": added,
        "removed_ids": removed,
        "changed_ids": changed,
        "retained_local_only": [str(card["id"]) for card in local_only],
        "discarded_replaced_local_ids": [
            str(card["id"]) for card in discarded_replacements
        ],
        "patch_field_changes": patch_changes,
    }


def save_json_atomic(path: Path, cards: list[dict[str, Any]]) -> None:
    encoded = (json.dumps(cards, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    write_atomic(path, encoded)


def save_excel_atomic(path: Path, cards: list[dict[str, Any]]) -> None:
    try:
        from openpyxl import Workbook
    except ImportError as exc:
        raise RuntimeError(
            "openpyxl is required for --apply; install requirements-card-sync.txt"
        ) from exc

    temporary = path.with_name(path.name + ".tmp.xlsx")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Sheet"
    sheet.append(EXCEL_HEADERS)
    for card in cards:
        sheet.append([card.get(header, "") for header in EXCEL_HEADERS])
    workbook.save(temporary)
    temporary.replace(path)


def locate_asset(image_dir: Path, stem: str) -> Path | None:
    for extension in (".webp", ".png"):
        candidate = image_dir / f"{stem}{extension}"
        if candidate.exists():
            return candidate
    return None


def sync_images(
    cards: list[dict[str, Any]],
    image_dir: Path,
    stage_dir: Path,
    *,
    apply: bool,
    output_format: str,
    quality: int,
    repair_existing: bool,
    max_downloads: int,
) -> dict[str, Any]:
    missing: list[dict[str, Any]] = []
    existing: list[tuple[dict[str, Any], Path]] = []
    for card in cards:
        stem = asset_stem(card)
        path = locate_asset(image_dir, stem)
        if path is None:
            missing.append(card)
        else:
            existing.append((card, path))

    if len(missing) > max_downloads:
        raise RuntimeError(
            f"{len(missing)} missing images exceeds --max-downloads={max_downloads}"
        )

    print(
        f"Assets: expected={len(cards)}, existing={len(existing)}, "
        f"missing={len(missing)}"
    )
    image_reports: list[dict[str, Any]] = []
    if not apply:
        return {
            "missing": [asset_stem(card) for card in missing],
            "repaired": [],
            "downloaded": [],
            "reports": [],
        }

    raw_dir = stage_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[str] = []
    for index, card in enumerate(missing, 1):
        stem = asset_stem(card)
        image_url = str(card.get("image_path") or "")
        if not image_url.startswith("https://"):
            raise RuntimeError(f"missing HTTPS image_path for {stem}")
        source = request_bytes(image_url)
        raw_path = raw_dir / f"{card['id']}--{stem}.png"
        write_atomic(raw_path, source)
        encoded, report = normalize_bytes(
            source,
            output_format=output_format,
            quality=quality,
        )
        destination = image_dir / f"{stem}.{output_format}"
        write_atomic(destination, encoded)
        raw_path.unlink(missing_ok=True)
        downloaded.append(destination.name)
        image_reports.append(
            {
                "card_id": str(card["id"]),
                "asset": destination.name,
                **report.__dict__,
            }
        )
        print(
            f"[{index}/{len(missing)}] {destination.name}: "
            f"{report.source_bytes / 1024:.0f} -> "
            f"{report.output_bytes / 1024:.0f} KiB, crop={report.crop_margins}"
        )

    repaired: list[str] = []
    if repair_existing:
        for card, path in existing:
            source = path.read_bytes()
            inspection = inspect_bytes(source)
            needs_repair = (
                tuple(inspection["source_size"]) != TARGET_SIZE
                or max(inspection["crop_margins"]) >= 3
            )
            if not needs_repair:
                continue
            extension = path.suffix.lower().lstrip(".")
            encoded, report = normalize_bytes(
                source,
                output_format=extension,
                quality=quality,
            )
            write_atomic(path, encoded)
            repaired.append(path.name)
            image_reports.append(
                {
                    "card_id": str(card["id"]),
                    "asset": path.name,
                    "repair": True,
                    **report.__dict__,
                }
            )
            print(
                f"[REPAIR] {path.name}: {report.source_bytes / 1024:.0f} -> "
                f"{report.output_bytes / 1024:.0f} KiB, crop={report.crop_margins}"
            )

    return {
        "missing": [],
        "downloaded": downloaded,
        "repaired": repaired,
        "reports": image_reports,
    }


def rebuild_app_data(source_dir: Path) -> None:
    environment = dict(os.environ)
    environment["ZHANSHUANG_DIR"] = str(source_dir)
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "process_cards.py")],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        timeout=120,
    )
    if result.stdout:
        print(result.stdout.rstrip())
    if result.returncode:
        if result.stderr:
            print(result.stderr.rstrip(), file=sys.stderr)
        raise RuntimeError("process_cards.py failed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--stage-dir", type=Path, default=DEFAULT_STAGE_DIR)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--repair-existing", action="store_true")
    parser.add_argument("--image-format", choices=("webp", "png"), default="webp")
    parser.add_argument("--quality", type=int, default=DEFAULT_WEBP_QUALITY)
    parser.add_argument("--max-downloads", type=int, default=100)
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    stage_dir = args.stage_dir.resolve()
    json_file = source_dir / "超英击战_卡牌数据.json"
    correction_file = source_dir / "超英击战_数据修正.json"
    excel_file = source_dir / "超英击战_卡牌数据.xlsx"
    image_dir = ROOT / "public" / "cards"

    for required in (json_file, correction_file):
        if not required.exists():
            raise FileNotFoundError(required)

    official, snapshot = fetch_official(stage_dir)
    local = json.loads(json_file.read_text(encoding="utf-8"))
    merged, changes = merge_cards(official, local, correction_file)

    print(
        f"Official={len(official)}, local={len(local)}, merged={len(merged)}, "
        f"unique card_no={len({card['card_no'] for card in merged})}"
    )
    print(
        "Data delta: "
        f"added={len(changes['added_ids'])}, "
        f"changed={len(changes['changed_ids'])}, "
        f"removed={len(changes['removed_ids'])}, "
        f"discarded replacements={len(changes['discarded_replaced_local_ids'])}, "
        f"patch fields={changes['patch_field_changes']}"
    )

    image_result: dict[str, Any] = {"skipped": True}
    if not args.skip_images:
        image_result = sync_images(
            merged,
            image_dir,
            stage_dir,
            apply=args.apply,
            output_format=args.image_format,
            quality=args.quality,
            repair_existing=args.repair_existing,
            max_downloads=args.max_downloads,
        )

    if args.apply:
        stage_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(json_file, stage_dir / "source-before.json")
        save_json_atomic(json_file, merged)
        save_excel_atomic(excel_file, merged)
        rebuild_app_data(source_dir)

    report = {
        "mode": "apply" if args.apply else "audit",
        "snapshot": snapshot,
        "source_dir": str(source_dir),
        "data": {
            "official_records": len(official),
            "merged_records": len(merged),
            "unique_card_numbers": len({card["card_no"] for card in merged}),
            **changes,
        },
        "images": image_result,
    }
    write_atomic(
        stage_dir / "report.json",
        (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )
    print(f"Report: {stage_dir / 'report.json'}")
    if not args.apply:
        print("AUDIT ONLY: re-run with --apply after reviewing the report.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
