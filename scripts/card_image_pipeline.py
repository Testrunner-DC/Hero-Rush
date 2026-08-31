#!/usr/bin/env python3
"""Deterministic card-image normalization used by the official card sync.

The official source currently contains two image families: 744x1039 images and
1559x2150 images with transparent outer padding. Cropping the RGBA image with
Image.getbbox() is incorrect because fully transparent pixels can still carry
non-zero RGB values. This module derives the content rectangle from alpha only,
then normalizes every card to 746x1041.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from io import BytesIO
from pathlib import Path
from typing import Iterable

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - environment guidance
    raise SystemExit(
        "Pillow is required. Install scripts/requirements-card-sync.txt "
        "inside the project-local F-drive virtual environment."
    ) from exc


TARGET_SIZE = (746, 1041)
DEFAULT_ALPHA_THRESHOLD = 8
DEFAULT_WEBP_QUALITY = 92
MAX_ASPECT_DRIFT = 0.04


@dataclass(frozen=True)
class ImageReport:
    source_width: int
    source_height: int
    alpha_bbox: tuple[int, int, int, int]
    crop_margins: tuple[int, int, int, int]
    target_width: int
    target_height: int
    aspect_drift: float
    source_bytes: int
    output_bytes: int
    sha256: str
    output_format: str


def _alpha_bbox(image: Image.Image, threshold: int) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("image has no visible pixels after alpha threshold")
    return bbox


def _resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    # Premultiplication prevents the hidden white RGB in transparent padding
    # from creating bright halos around rounded card corners.
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def inspect_bytes(
    source: bytes,
    *,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
) -> dict[str, object]:
    with Image.open(BytesIO(source)) as image:
        rgba = image.convert("RGBA")
        bbox = _alpha_bbox(rgba, alpha_threshold)
        left, top, right, bottom = bbox
        margins = (left, top, rgba.width - right, rgba.height - bottom)
        return {
            "source_size": (rgba.width, rgba.height),
            "alpha_bbox": bbox,
            "crop_margins": margins,
        }


def normalize_image(
    image: Image.Image,
    *,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
    target_size: tuple[int, int] = TARGET_SIZE,
) -> tuple[Image.Image, dict[str, object]]:
    rgba = image.convert("RGBA")
    bbox = _alpha_bbox(rgba, alpha_threshold)
    left, top, right, bottom = bbox
    margins = (left, top, rgba.width - right, rgba.height - bottom)
    cropped = rgba.crop(bbox)

    target_ratio = target_size[0] / target_size[1]
    crop_ratio = cropped.width / cropped.height
    drift = abs(crop_ratio - target_ratio) / target_ratio
    if drift > MAX_ASPECT_DRIFT:
        raise ValueError(
            f"content aspect ratio drift {drift:.2%} exceeds "
            f"{MAX_ASPECT_DRIFT:.0%}; manual review required"
        )

    normalized = _resize_premultiplied(cropped, target_size)
    metadata = {
        "source_size": (rgba.width, rgba.height),
        "alpha_bbox": bbox,
        "crop_margins": margins,
        "aspect_drift": drift,
    }
    return normalized, metadata


def encode_image(
    image: Image.Image,
    *,
    output_format: str = "webp",
    quality: int = DEFAULT_WEBP_QUALITY,
) -> bytes:
    output = BytesIO()
    normalized_format = output_format.lower()
    if normalized_format == "webp":
        image.save(
            output,
            format="WEBP",
            quality=quality,
            method=6,
            exact=True,
        )
    elif normalized_format == "png":
        image.save(output, format="PNG", optimize=True, compress_level=9)
    else:
        raise ValueError(f"unsupported output format: {output_format}")
    return output.getvalue()


def normalize_bytes(
    source: bytes,
    *,
    output_format: str = "webp",
    quality: int = DEFAULT_WEBP_QUALITY,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
) -> tuple[bytes, ImageReport]:
    with Image.open(BytesIO(source)) as image:
        normalized, metadata = normalize_image(
            image,
            alpha_threshold=alpha_threshold,
        )

    encoded = encode_image(normalized, output_format=output_format, quality=quality)
    report = ImageReport(
        source_width=metadata["source_size"][0],
        source_height=metadata["source_size"][1],
        alpha_bbox=metadata["alpha_bbox"],
        crop_margins=metadata["crop_margins"],
        target_width=TARGET_SIZE[0],
        target_height=TARGET_SIZE[1],
        aspect_drift=round(metadata["aspect_drift"], 8),
        source_bytes=len(source),
        output_bytes=len(encoded),
        sha256=hashlib.sha256(encoded).hexdigest(),
        output_format=output_format.lower(),
    )
    return encoded, report


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def process_paths(
    sources: Iterable[Path],
    output_dir: Path,
    *,
    output_format: str,
    quality: int,
    alpha_threshold: int,
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    extension = ".webp" if output_format == "webp" else ".png"
    for source_path in sources:
        raw = source_path.read_bytes()
        encoded, report = normalize_bytes(
            raw,
            output_format=output_format,
            quality=quality,
            alpha_threshold=alpha_threshold,
        )
        destination = output_dir / (source_path.stem + extension)
        write_atomic(destination, encoded)
        result = {
            "source": str(source_path),
            "output": str(destination),
            **asdict(report),
        }
        results.append(result)
        saved = report.source_bytes - report.output_bytes
        print(
            f"[OK] {source_path.name} -> {destination.name} "
            f"({report.output_bytes / 1024:.0f} KiB, saved {saved / 1024:.0f} KiB, "
            f"crop={report.crop_margins})"
        )
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--format", choices=("webp", "png"), default="webp")
    parser.add_argument("--quality", type=int, default=DEFAULT_WEBP_QUALITY)
    parser.add_argument("--alpha-threshold", type=int, default=DEFAULT_ALPHA_THRESHOLD)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    results = process_paths(
        args.inputs,
        args.output_dir,
        output_format=args.format,
        quality=args.quality,
        alpha_threshold=args.alpha_threshold,
    )
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
