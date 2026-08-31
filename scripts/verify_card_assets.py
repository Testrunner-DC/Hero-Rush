#!/usr/bin/env python3
"""Read-only integrity audit for public/cards.json and public/cards assets."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CARDS_FILE = ROOT / "public" / "cards.json"
IMAGE_DIR = ROOT / "public" / "cards"
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".webp"}


def main() -> int:
    document = json.loads(CARDS_FILE.read_text(encoding="utf-8"))
    cards = document.get("cards", [])
    groups = document.get("card_groups", {})
    feature_map = document.get("feature_map", {})
    failures: list[str] = []

    def check(condition: bool, message: str) -> None:
        print(f"[{'PASS' if condition else 'FAIL'}] {message}")
        if not condition:
            failures.append(message)

    card_numbers = {card["card_no"] for card in cards}
    ids = [card["id"] for card in cards]
    pairs = [(card["card_no"], card["rarity"]) for card in cards]

    check(document.get("total_cards") == len(card_numbers), "total_cards matches unique card_no count")
    check(document.get("total_variants") == len(cards), "total_variants matches cards array length")
    check(not [item for item, count in Counter(ids).items() if count > 1], "card ids are unique")
    check(not [item for item, count in Counter(pairs).items() if count > 1], "(card_no, rarity) pairs are unique")

    expected_groups = {
        card_no: [card["id"] for card in cards if card["card_no"] == card_no]
        for card_no in card_numbers
    }
    check(set(groups) == card_numbers, "card_groups keys match all card numbers")
    check(
        all(
            Counter(groups.get(card_no, [])) == Counter(expected_ids)
            for card_no, expected_ids in expected_groups.items()
        ),
        "card_groups contains every variant exactly once",
    )

    missing_features: set[str] = set()
    feature_mismatches: list[str] = []
    for card in cards:
        tokens = [
            token.strip()
            for token in str(card.get("feature") or "").split(",")
            if token.strip()
        ]
        missing_features.update(token for token in tokens if token not in feature_map)
        expected_text = (
            "/".join(feature_map.get(token, token) for token in tokens)
            if tokens
            else None
        )
        if card.get("feature_text") != expected_text:
            feature_mismatches.append(card["id"])
    check(not missing_features, "all feature ids exist in feature_map")
    check(not feature_mismatches, "feature_text matches feature_map")
    if feature_mismatches:
        print("Feature text mismatches: " + ", ".join(feature_mismatches))

    image_paths = sorted(
        path
        for path in IMAGE_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS
    )
    image_names = {path.name for path in image_paths}
    referenced_images = {Path(card["image_url"]).name for card in cards}
    invalid_references = sorted(
        name
        for name in referenced_images
        if Path(name).suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS
    )
    missing_images = sorted(referenced_images - image_names)
    empty_images = sorted(path.name for path in image_paths if path.stat().st_size == 0)
    orphan_images = sorted(image_names - referenced_images)
    duplicate_stems = sorted(
        stem for stem, count in Counter(path.stem for path in image_paths).items() if count > 1
    )

    check(not invalid_references, "all image references use supported formats")
    check(not missing_images, "every card image exists")
    check(not empty_images, "card images are non-empty")
    check(not duplicate_stems, "no card variant has both PNG and WebP assets")
    check(not orphan_images, "no unreferenced card assets remain")

    format_counts = Counter(path.suffix.lower() for path in image_paths)
    print(
        f"Summary: {len(card_numbers)} cards, {len(cards)} variants, "
        f"{len(image_paths)} assets "
        f"({', '.join(f'{ext[1:].upper()}={count}' for ext, count in sorted(format_counts.items()))})"
    )
    if orphan_images:
        print("Unreferenced: " + ", ".join(orphan_images))

    if failures:
        print(f"RESULT: FAIL ({len(failures)})")
        return 1
    print("RESULT: ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
