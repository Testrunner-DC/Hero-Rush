#!/usr/bin/env python3
"""Build and govern Hero Rush card assets outside Git.

The repository keeps card metadata and compatibility images for the transition
period.  The long-term asset source and all derived variants live beside the
repository (``../assets`` by default), so new card sets do not keep expanding
Git history.  Derived objects are addressed by the SHA-256 of their source and
shared by every release that references the same image.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - environment guidance
    raise SystemExit(
        "Pillow is required. Install scripts/requirements-card-sync.txt "
        "inside the project-local virtual environment."
    ) from exc


ROOT = Path(__file__).resolve().parent.parent
CARDS_FILE = ROOT / "public" / "cards.json"
LEGACY_IMAGE_DIR = ROOT / "public" / "cards"
DEFAULT_ASSET_ROOT = ROOT.parent / "assets"
SCHEMA_VERSION = 1
VARIANTS = {
    "thumbWebp": {"filename": "thumb-240.webp", "width": 240, "quality": 76, "max_bytes": 300_000},
    "boardWebp": {"filename": "board-480.webp", "width": 480, "quality": 82, "max_bytes": 900_000},
    "detailWebp": {"filename": "detail-960.webp", "width": 960, "quality": 88, "max_bytes": 2_500_000},
}
MAX_TOTAL_BYTES = 300 * 1024 * 1024
SUPPORTED_SOURCE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_database() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    document = json.loads(CARDS_FILE.read_text(encoding="utf-8"))
    cards = document.get("cards")
    if not isinstance(cards, list) or not cards:
        raise RuntimeError("public/cards.json has no cards array")
    ids = [str(card.get("id") or "") for card in cards]
    if "" in ids or len(ids) != len(set(ids)):
        raise RuntimeError("card ids must be present and unique")
    return document, cards


def assert_external_root(asset_root: Path, allow_c_drive: bool) -> Path:
    resolved = asset_root.resolve()
    if not allow_c_drive and resolved.drive.upper() == "C:":
        raise RuntimeError("card asset root must not be on C drive")
    if resolved == ROOT.resolve() or ROOT.resolve() in resolved.parents:
        raise RuntimeError("card asset root must be outside the Git working tree")
    return resolved


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{os.getpid()}.partial")
    temporary.write_bytes(data)
    temporary.replace(path)


def atomic_json(path: Path, value: Any) -> None:
    atomic_write(
        path,
        (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )


def referenced_filename(card: dict[str, Any]) -> str:
    image_url = str(card.get("image_url") or "")
    filename = Path(image_url.split("?", 1)[0]).name
    if not filename or Path(filename).suffix.lower() not in SUPPORTED_SOURCE_EXTENSIONS:
        raise RuntimeError(f"unsupported image_url for {card.get('id')}: {image_url}")
    return filename


def locate_source(source_dir: Path, card: dict[str, Any]) -> Path:
    filename = referenced_filename(card)
    exact = source_dir / filename
    if exact.is_file():
        return exact
    stem = Path(filename).stem
    matches = [
        source_dir / f"{stem}{extension}"
        for extension in sorted(SUPPORTED_SOURCE_EXTENSIONS)
        if (source_dir / f"{stem}{extension}").is_file()
    ]
    if len(matches) != 1:
        raise RuntimeError(
            f"expected one archived source for {card['id']}, found {len(matches)}"
        )
    return matches[0]


def archive_sources(asset_root: Path) -> dict[str, int]:
    _, cards = read_database()
    archive_dir = asset_root / "original"
    archive_dir.mkdir(parents=True, exist_ok=True)
    copied = retained = 0
    referenced: set[str] = set()
    for card in cards:
        filename = referenced_filename(card)
        referenced.add(filename.lower())
        source = LEGACY_IMAGE_DIR / filename
        if not source.is_file():
            raise RuntimeError(f"legacy source is missing: {source}")
        destination = archive_dir / filename
        source_bytes = source.read_bytes()
        if destination.is_file() and sha256_bytes(destination.read_bytes()) == sha256_bytes(source_bytes):
            retained += 1
            continue
        atomic_write(destination, source_bytes)
        copied += 1

    archived = [
        path for path in archive_dir.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SOURCE_EXTENSIONS
    ]
    unreferenced = [path.name for path in archived if path.name.lower() not in referenced]
    result = {
        "referenced": len(cards),
        "copied": copied,
        "retained": retained,
        "unreferenced": len(unreferenced),
    }
    print(
        "Archive complete: "
        f"referenced={len(cards)} copied={copied} retained={retained} "
        f"unreferenced={len(unreferenced)} root={archive_dir}"
    )
    if unreferenced:
        print("Archive-only files retained (never auto-deleted): " + ", ".join(unreferenced[:20]))
    return result


def encode_variant(source: bytes, width: int, quality: int) -> bytes:
    with Image.open(BytesIO(source)) as image:
        rgba = image.convert("RGBA")
        target_width = min(width, rgba.width)
        target_height = max(1, round(rgba.height * target_width / rgba.width))
        if (target_width, target_height) != rgba.size:
            rgba = rgba.convert("RGBa").resize(
                (target_width, target_height), Image.Resampling.LANCZOS
            ).convert("RGBA")
        output = BytesIO()
        rgba.save(
            output,
            format="WEBP",
            quality=quality,
            method=6,
            exact=True,
        )
        return output.getvalue()


def inspect_source(source: bytes, card_id: str) -> tuple[int, int]:
    with Image.open(BytesIO(source)) as image:
        image.verify()
    with Image.open(BytesIO(source)) as image:
        if not image.width or not image.height:
            raise RuntimeError(f"invalid dimensions for {card_id}")
        return image.width, image.height


def object_relative(hash_value: str, filename: str) -> str:
    return f"objects/{hash_value[:2]}/{hash_value}/{filename}"


def ensure_object(store_root: Path, source: bytes, source_hash: str) -> dict[str, int]:
    object_dir = store_root / "objects" / source_hash[:2] / source_hash
    sizes: dict[str, int] = {}
    complete = True
    for name, config in VARIANTS.items():
        path = object_dir / str(config["filename"])
        if not path.is_file() or path.stat().st_size <= 0:
            complete = False
            break
        sizes[name] = path.stat().st_size
    if complete:
        return sizes

    object_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(prefix=f".{source_hash[:12]}-", dir=object_dir.parent)
    )
    try:
        sizes = {}
        for name, config in VARIANTS.items():
            encoded = encode_variant(source, int(config["width"]), int(config["quality"]))
            if len(encoded) > int(config["max_bytes"]):
                raise RuntimeError(
                    f"{source_hash}:{name} is {len(encoded)} bytes, "
                    f"above {config['max_bytes']}"
                )
            (temporary / str(config["filename"])).write_bytes(encoded)
            sizes[name] = len(encoded)
        if object_dir.exists():
            shutil.rmtree(temporary)
        else:
            temporary.replace(object_dir)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return sizes


def build_release(asset_root: Path, max_total_bytes: int, concurrency: int) -> dict[str, Any]:
    document, cards = read_database()
    source_dir = asset_root / "original"
    store_root = asset_root / "store"
    releases_root = asset_root / "releases"
    current_root = asset_root / "current"
    prepared: list[dict[str, Any]] = []
    object_sources: dict[str, Path] = {}
    for card in cards:
        source_path = locate_source(source_dir, card)
        source = source_path.read_bytes()
        source_hash = sha256_bytes(source)
        width, height = inspect_source(source, str(card["id"]))
        object_sources.setdefault(source_hash, source_path)
        prepared.append(
            {
                "card": card,
                "sourceHash": source_hash,
                "width": width,
                "height": height,
            }
        )

    sizes_by_hash: dict[str, dict[str, int]] = {}
    completed = 0

    def build_object(item: tuple[str, Path]) -> tuple[str, dict[str, int]]:
        source_hash, source_path = item
        return source_hash, ensure_object(store_root, source_path.read_bytes(), source_hash)

    with ThreadPoolExecutor(max_workers=max(1, min(12, concurrency))) as executor:
        futures = [executor.submit(build_object, item) for item in object_sources.items()]
        for future in as_completed(futures):
            source_hash, sizes = future.result()
            sizes_by_hash[source_hash] = sizes
            completed += 1
            if completed % 25 == 0 or completed == len(futures):
                print(f"Built {completed}/{len(futures)} unique image objects", flush=True)

    entries: dict[str, Any] = {}
    objects: dict[str, dict[str, Any]] = {}
    for item in prepared:
        card = item["card"]
        source_hash = item["sourceHash"]
        width = item["width"]
        height = item["height"]
        sizes = sizes_by_hash[source_hash]
        variants = {
            name: object_relative(source_hash, str(config["filename"]))
            for name, config in VARIANTS.items()
        }
        objects[source_hash] = {"bytes": sizes, "variants": variants}
        entries[str(card["id"])] = {
            "cardId": str(card["id"]),
            "cardNo": str(card.get("card_no") or ""),
            "contentHash": source_hash,
            "width": width,
            "height": height,
            "legacyUrl": str(card.get("image_url") or ""),
            "variants": variants,
            "bytes": sizes,
        }

    total_bytes = sum(
        sum(int(size) for size in item["bytes"].values()) for item in objects.values()
    )
    if total_bytes > max_total_bytes:
        raise RuntimeError(
            f"derived object total {total_bytes} exceeds gate {max_total_bytes}"
        )
    version_rows = [f"{card_id}:{entry['contentHash']}" for card_id, entry in entries.items()]
    asset_version = sha256_bytes("\n".join(sorted(version_rows)).encode("utf-8"))
    catalog_version = str(document.get("generated_at") or utc_now())[:10].replace("-", "")
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "catalogVersion": catalog_version,
        "assetVersion": asset_version,
        "generatedAt": utc_now(),
        "basePath": "/card-assets",
        "cdnBaseUrl": "",
        "complete": True,
        "cardCount": len(entries),
        "objectCount": len(objects),
        "totalBytes": total_bytes,
        "immutableCacheControl": "public, max-age=31536000, immutable",
        "manifestCacheControl": "public, max-age=300, must-revalidate",
        "cards": entries,
        "missing": [],
    }
    preload = {
        "assetVersion": asset_version,
        "generatedAt": manifest["generatedAt"],
        "entries": [
            {"cardId": card_id, "url": f"/card-assets/{entry['variants']['thumbWebp']}"}
            for card_id, entry in list(entries.items())[:30]
        ],
    }

    release_root = releases_root / asset_version
    release_root.mkdir(parents=True, exist_ok=True)
    atomic_json(release_root / "card-assets.manifest.json", manifest)
    atomic_json(release_root / "card-assets.preload.json", preload)
    current_root.mkdir(parents=True, exist_ok=True)
    atomic_json(current_root / "card-assets.manifest.json", manifest)
    atomic_json(current_root / "card-assets.preload.json", preload)
    atomic_json(
        asset_root / "current.json",
        {"schemaVersion": 1, "assetVersion": asset_version, "release": str(release_root)},
    )
    print(
        f"Release built: cards={len(entries)} objects={len(objects)} "
        f"bytes={total_bytes} version={asset_version}"
    )
    return manifest


def safe_object_path(store_root: Path, relative: str) -> Path:
    normalized = relative.replace("\\", "/")
    if normalized.startswith("/") or ".." in normalized.split("/"):
        raise RuntimeError(f"unsafe asset path: {relative}")
    full = (store_root / normalized).resolve()
    if store_root.resolve() not in full.parents:
        raise RuntimeError(f"asset path escapes store root: {relative}")
    return full


def audit_release(asset_root: Path, manifest_path: Path | None = None) -> dict[str, Any]:
    _, cards = read_database()
    path = manifest_path or asset_root / "current" / "card-assets.manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    failures: list[str] = []
    expected_ids = {str(card["id"]) for card in cards}
    entries = manifest.get("cards") or {}
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        failures.append("schemaVersion mismatch")
    if manifest.get("complete") is not True:
        failures.append("manifest is not complete")
    if set(entries) != expected_ids:
        failures.append("manifest card ids do not match public/cards.json")

    unique_objects: dict[str, dict[str, int]] = {}
    version_rows: list[str] = []
    for card_id, entry in entries.items():
        content_hash = str(entry.get("contentHash") or "")
        if len(content_hash) != 64 or any(ch not in "0123456789abcdef" for ch in content_hash):
            failures.append(f"{card_id}: invalid content hash")
            continue
        version_rows.append(f"{card_id}:{content_hash}")
        measured: dict[str, int] = {}
        for name, config in VARIANTS.items():
            expected = object_relative(content_hash, str(config["filename"]))
            relative = (entry.get("variants") or {}).get(name)
            if relative != expected:
                failures.append(f"{card_id}:{name}: non-canonical path")
                continue
            full = safe_object_path(asset_root / "store", relative)
            if not full.is_file() or full.stat().st_size <= 0:
                failures.append(f"{card_id}:{name}: missing or empty")
                continue
            size = full.stat().st_size
            if size != (entry.get("bytes") or {}).get(name):
                failures.append(f"{card_id}:{name}: size mismatch")
            if size > int(config["max_bytes"]):
                failures.append(f"{card_id}:{name}: size gate exceeded")
            try:
                with Image.open(full) as image:
                    image.verify()
                with Image.open(full) as image:
                    if image.format != "WEBP" or image.width > int(config["width"]):
                        failures.append(f"{card_id}:{name}: invalid format or width")
            except Exception as exc:  # noqa: BLE001 - audit should aggregate failures
                failures.append(f"{card_id}:{name}: decode failed ({exc})")
            measured[name] = size
        unique_objects[content_hash] = measured

    calculated_version = sha256_bytes("\n".join(sorted(version_rows)).encode("utf-8"))
    if calculated_version != manifest.get("assetVersion"):
        failures.append("assetVersion does not match card content hashes")
    total_bytes = sum(sum(sizes.values()) for sizes in unique_objects.values())
    if total_bytes != manifest.get("totalBytes"):
        failures.append("totalBytes does not match unique derived objects")
    if total_bytes > MAX_TOTAL_BYTES:
        failures.append("derived object total exceeds global gate")
    if manifest.get("objectCount") != len(unique_objects):
        failures.append("objectCount mismatch")

    if failures:
        print("Asset release audit failed:")
        for failure in failures[:100]:
            print(f"- {failure}")
        raise RuntimeError(f"asset release audit failed with {len(failures)} issue(s)")
    result = {
        "cards": len(entries),
        "objects": len(unique_objects),
        "bytes": total_bytes,
        "assetVersion": calculated_version,
    }
    print(
        f"Asset release audit passed: cards={len(entries)} objects={len(unique_objects)} "
        f"bytes={total_bytes} version={calculated_version}"
    )
    return result


def referenced_hashes(manifest_paths: Iterable[Path]) -> set[str]:
    hashes: set[str] = set()
    for path in manifest_paths:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        hashes.update(
            str(entry.get("contentHash"))
            for entry in (manifest.get("cards") or {}).values()
            if entry.get("contentHash")
        )
    return hashes


def prune_releases(asset_root: Path, keep: int, apply: bool) -> dict[str, int]:
    releases_root = asset_root / "releases"
    releases = sorted(
        [path for path in releases_root.iterdir() if path.is_dir()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    ) if releases_root.is_dir() else []
    kept = releases[: max(1, keep)]
    removed_releases = releases[max(1, keep):]
    manifests = [path / "card-assets.manifest.json" for path in kept]
    manifests.append(asset_root / "current" / "card-assets.manifest.json")
    live_hashes = referenced_hashes(path for path in manifests if path.is_file())
    object_root = asset_root / "store" / "objects"
    stale_objects = [
        path
        for prefix in object_root.iterdir() if prefix.is_dir()
        for path in prefix.iterdir() if path.is_dir() and path.name not in live_hashes
    ] if object_root.is_dir() else []
    stale_bytes = sum(
        file.stat().st_size for directory in stale_objects for file in directory.rglob("*") if file.is_file()
    )
    print(
        f"Prune {'apply' if apply else 'dry-run'}: keep_releases={len(kept)} "
        f"remove_releases={len(removed_releases)} stale_objects={len(stale_objects)} "
        f"reclaim_bytes={stale_bytes}"
    )
    if apply:
        for path in removed_releases:
            shutil.rmtree(path)
        for path in stale_objects:
            shutil.rmtree(path)
        for prefix in object_root.iterdir() if object_root.is_dir() else []:
            if prefix.is_dir() and not any(prefix.iterdir()):
                prefix.rmdir()
    return {
        "kept_releases": len(kept),
        "removed_releases": len(removed_releases),
        "stale_objects": len(stale_objects),
        "reclaim_bytes": stale_bytes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--asset-root",
        type=Path,
        default=Path(os.environ.get("HERO_RUSH_ASSET_ROOT", DEFAULT_ASSET_ROOT)),
    )
    parser.add_argument("--allow-c-drive", action="store_true", help=argparse.SUPPRESS)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("archive", help="copy currently referenced compatibility images into the external archive")
    build_parser = subparsers.add_parser("build", help="build a content-addressed derived release")
    build_parser.add_argument("--max-total-bytes", type=int, default=MAX_TOTAL_BYTES)
    build_parser.add_argument("--concurrency", type=int, default=min(8, os.cpu_count() or 4))
    audit_parser = subparsers.add_parser("audit", help="audit the current or selected release")
    audit_parser.add_argument("--manifest", type=Path)
    prune_parser = subparsers.add_parser("prune", help="remove unreferenced derived objects, never originals")
    prune_parser.add_argument("--keep", type=int, default=3)
    prune_parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    asset_root = assert_external_root(args.asset_root, args.allow_c_drive)
    if args.command == "archive":
        archive_sources(asset_root)
    elif args.command == "build":
        build_release(asset_root, args.max_total_bytes, args.concurrency)
    elif args.command == "audit":
        audit_release(asset_root, args.manifest)
    elif args.command == "prune":
        prune_releases(asset_root, args.keep, args.apply)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - CLI must provide a concise failure
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
