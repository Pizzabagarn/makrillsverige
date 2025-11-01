#!/usr/bin/env python3
"""
Extract numeric depth labels from a single scanned lake map (TIF/PNG) using OCR.

This MVP produces a GeoJSON FeatureCollection where each feature is a point in
image pixel coordinates (no georeferencing). It does NOT generate any images.

Usage (PowerShell):
  python scripts/svar/ocr_extract_depth_points.py \
    --image "C:\\Users\\Super\\Documents\\GitHub\\makrillsverige\\public\\data\\svar\\dzi\\615365-134524-kartor\\preview-2-0170_Havgårdssjön_615365-134524.png" \
    --out "C:\\Users\\Super\\Documents\\GitHub\\makrillsverige\\public\\data\\svar\\dzi\\615365-134524-kartor\\preview-2-0170_Havgårdssjön_615365-134524.depth_points.geojson"

Prereqs:
  - Python 3.9+
  - pip install -r scripts/svar/requirements-ocr.txt
  - Tesseract OCR installed and on PATH (Windows installer: https://github.com/UB-Mannheim/tesseract/wiki)

Notes:
  - This script only reads an image and writes a small GeoJSON file (text). It
    does not create any images or tiles.
  - Output points are in image pixel coordinates so they can be overlayed on
    the exact same image (e.g. DZI/preview) once a pixel->view transform is known.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List, Tuple

import cv2  # type: ignore
import numpy as np  # type: ignore
import pytesseract  # type: ignore


def read_image_bgr(image_path: str) -> np.ndarray:
    """Read image as BGR uint8 array. Supports PNG/JPEG/TIF as handled by OpenCV.

    Returns a 3-channel BGR image. If the image is single-channel, it is replicated
    across three channels to provide a stable pipeline downstream.
    """
    image = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise FileNotFoundError(f"Failed to open image: {image_path}")

    # Normalize to 8-bit if needed
    if image.dtype != np.uint8:
        # Scale to 0..255 based on min/max in the image to preserve contrast
        min_val = float(np.min(image))
        max_val = float(np.max(image))
        if max_val <= min_val:
            image = np.zeros_like(image, dtype=np.uint8)
        else:
            scaled = (image.astype(np.float32) - min_val) * (255.0 / (max_val - min_val))
            image = np.clip(scaled, 0, 255).astype(np.uint8)

    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif image.shape[2] == 4:
        # Convert BGRA to BGR (drop alpha)
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    return image


def preprocess_for_ocr(input_bgr: np.ndarray) -> np.ndarray:
    """Preprocess map scan to make numeric labels easier to read by OCR.

    Steps:
      - Convert to grayscale
      - Gentle denoise (median blur) to reduce speckle in scans
      - Morphological opening to thin/diminish hairline contours/lines
      - Adaptive thresholding to binarize text against paper background
    """
    grayscale = cv2.cvtColor(input_bgr, cv2.COLOR_BGR2GRAY)
    denoised = cv2.medianBlur(grayscale, 3)

    # This helps reduce thin contour lines around the lake so digits stand out more.
    morph_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    opened = cv2.morphologyEx(denoised, cv2.MORPH_OPEN, morph_kernel, iterations=1)

    # Adaptive threshold copes well with uneven illumination common in scans
    binary = cv2.adaptiveThreshold(
        opened,
        maxValue=255,
        adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        thresholdType=cv2.THRESH_BINARY,
        blockSize=35,
        C=10,
    )
    return binary


def run_tesseract_digits(binary_image: np.ndarray) -> List[Dict[str, Any]]:
    """Run OCR in digit-only mode and return boxes with center coordinates.

    Returns a list of dicts with keys: depth_m (float), confidence (0..1),
    bbox [x, y, w, h], and center_xy [cx, cy] in pixel coordinates.
    """
    # PSM 6 = Assume a block of text with variable line layout, works for scattered labels
    # Whitelist numeric characters and decimal separators used on Swedish maps
    config = "--psm 6 -c tessedit_char_whitelist=0123456789.,"
    data = pytesseract.image_to_data(binary_image, config=config, output_type=pytesseract.Output.DICT)

    results: List[Dict[str, Any]] = []
    n = len(data.get("text", []))
    for i in range(n):
        raw_text = (data["text"][i] or "").strip()
        if not raw_text:
            continue

        normalized_text = raw_text.replace(",", ".")
        try:
            value = float(normalized_text)
        except ValueError:
            # Skip tokens that are not purely numeric
            continue

        conf_str = data.get("conf", ["-1"][i])
        try:
            confidence = float(conf_str) / 100.0 if conf_str != "-1" else 0.0
        except Exception:
            confidence = 0.0

        left = int(data.get("left", [0])[i])
        top = int(data.get("top", [0])[i])
        width = int(data.get("width", [0])[i])
        height = int(data.get("height", [0])[i])

        center_x = float(left + width / 2.0)
        center_y = float(top + height / 2.0)

        results.append(
            {
                "depth_m": value,
                "confidence": confidence,
                "bbox": [left, top, width, height],
                "center_xy": [center_x, center_y],
            }
        )

    return results


def to_geojson_pixel_points(
    hits: List[Dict[str, Any]],
    source_path: str,
    min_confidence: float,
    lake_id: str | None,
) -> Dict[str, Any]:
    """Convert OCR hits to a simple GeoJSON FeatureCollection in pixel space."""
    features: List[Dict[str, Any]] = []
    for hit in hits:
        if hit["confidence"] < min_confidence:
            continue
        cx, cy = hit["center_xy"]
        features.append(
            {
                "type": "Feature",
                # We intentionally use pixel coordinates as geometry for MVP.
                "geometry": {"type": "Point", "coordinates": [cx, cy]},
                "properties": {
                    "lake_id": lake_id,
                    "depth_m": hit["depth_m"],
                    "confidence": hit["confidence"],
                    "ocr_bbox": hit["bbox"],
                    "source_image": source_path,
                    "coordinate_space": "pixel",
                    "method": "ocr_extract_depth_points_v1",
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract numeric labels (depths) from a scanned lake map using OCR.")
    parser.add_argument("--image", required=True, help="Path to input image (TIF/PNG/JPEG).")
    parser.add_argument("--out", required=False, help="Output GeoJSON path. Defaults to <image>.depth_points.geojson")
    parser.add_argument("--min-confidence", type=float, default=0.45, help="Minimum OCR confidence (0..1) to keep a hit. Default 0.45.")
    parser.add_argument("--lake-id", type=str, default=None, help="Optional lake id to embed in properties.")
    args = parser.parse_args()

    image_path = os.path.abspath(args.image)
    output_path = os.path.abspath(args.out) if args.out else f"{image_path}.depth_points.geojson"

    image_bgr = read_image_bgr(image_path)
    binary = preprocess_for_ocr(image_bgr)
    ocr_hits = run_tesseract_digits(binary)

    geojson_obj = to_geojson_pixel_points(
        hits=ocr_hits,
        source_path=image_path,
        min_confidence=args.min_confidence,
        lake_id=args.lake_id,
    )

    # Ensure deterministic, readable JSON for diffs
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson_obj, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(geojson_obj['features'])} points -> {output_path}")


if __name__ == "__main__":
    main()




