#!/usr/bin/env python3
"""
All-in-one bathymetry extractor for a single scanned lake map (TIF/PNG/JPEG).

What it does (no image generation, data only):
  1) OCR numeric labels (depths) -> points.geojson (pixel coordinates)
  2) Extract depth contours (linework) and shoreline -> contours.geojson, shoreline.geojson (pixel)
  3) Optional: if a lake polygon GeoJSON is provided, estimate a similarity transform
     (scale+rotation+translation) to georeference all outputs -> *.geo.geojson

Default OCR engine is EasyOCR to avoid installing system binaries.

This script intentionally avoids reading environment variables (.env) or writing images.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
import fnmatch
import re
import pathlib

import cv2  # type: ignore
import numpy as np  # type: ignore
from shapely.geometry import LineString, Point, Polygon, mapping, shape  # type: ignore
from shapely.ops import unary_union  # type: ignore


# ---------------------------- Image loading & preprocessing ----------------------------

def read_image_bgr(image_path: str) -> np.ndarray:
    image = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if image is None:
        # Fallback 1: unicode-safe buffer
        try:
            try:
                data = np.fromfile(image_path, dtype=np.uint8)
            except Exception:
                with open(image_path, 'rb') as f:
                    data = np.frombuffer(f.read(), dtype=np.uint8)
            image = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
        except Exception:
            image = None
    if image is None:
        # Fallback 2: Pillow (handles BigTIFF/Unicode better), then convert to BGR
        try:
            from PIL import Image  # type: ignore
            with Image.open(image_path) as pil:
                pil = pil.convert("RGB")
                image = np.array(pil)[:, :, ::-1].copy()  # RGB -> BGR
        except Exception:
            image = None
    if image is None:
        # Fallback 3: tifffile (handle BigTIFF, multi-page). Downscale if enormous.
        try:
            import tifffile as tiff  # type: ignore
            with tiff.TiffFile(image_path) as tif:
                # Prefer a pyramid level with manageable size if available
                if len(tif.series) > 0 and len(tif.series[0].levels) > 0:
                    # Pick the smallest level with max dimension <= 8000, else the smallest level
                    levels = tif.series[0].levels
                    def maxdim(s):
                        sh = s.shape
                        return max(sh[0], sh[1]) if len(sh) >= 2 else 0
                    candidates = sorted(levels, key=lambda s: maxdim(s))
                    chosen = None
                    for s in candidates:
                        if maxdim(s) <= 8000:
                            chosen = s
                            break
                    if chosen is None:
                        chosen = candidates[0]
                    arr = chosen.asarray()
                else:
                    page = max(tif.pages, key=lambda p: (p.shape[0] if len(p.shape) >= 2 else 0) * (p.shape[1] if len(p.shape) >= 2 else 0))
                    arr = page.asarray()
                if arr.ndim == 2:
                    arr = np.stack([arr, arr, arr], axis=-1)
                elif arr.shape[2] == 4:
                    arr = arr[:, :, :3]
                image = arr.astype(np.uint8, copy=False)
                # Downscale very large images to keep memory bounded
                h, w = image.shape[:2]
                max_dim = max(h, w)
                if max_dim > 8000:
                    scale = 8000.0 / float(max_dim)
                    image = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        except Exception:
            image = None
    if image is None:
        # Fallback 4: pyvips streaming read with on-the-fly shrink
        try:
            import pyvips  # type: ignore
            vip = pyvips.Image.new_from_file(image_path, access="sequential")
            max_dim = max(vip.width, vip.height)
            if max_dim > 8000:
                scale = 8000.0 / float(max_dim)
                vip = vip.resize(scale)
            if vip.bands == 1:
                vip = vip.bandjoin([vip, vip, vip])
            elif vip.bands > 3:
                vip = vip.extract_band(0, n=3)
            mem = vip.write_to_memory()
            image = np.ndarray(buffer=mem, dtype=np.uint8, shape=[vip.height, vip.width, vip.bands])
            # Convert RGB -> BGR
            image = image[:, :, ::-1].copy()
        except Exception:
            image = None
    if image is None:
        raise FileNotFoundError(f"Failed to open image: {image_path}")
    if image.dtype != np.uint8:
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
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    return image


def binarize_for_lines(bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    den = cv2.medianBlur(gray, 3)
    # Adaptive threshold copes with paper texture
    bw = cv2.adaptiveThreshold(den, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 35, 12)
    # Invert so lines (~dark) become white strokes on black background
    bw_inv = cv2.bitwise_not(bw)
    return bw_inv


def binarize_for_text(bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    den = cv2.medianBlur(gray, 3)
    open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    opened = cv2.morphologyEx(den, cv2.MORPH_OPEN, open_kernel, iterations=1)
    thr = cv2.adaptiveThreshold(opened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 35, 10)
    return thr


def remove_text_blocks_mser(bgr: np.ndarray, line_mask: np.ndarray) -> np.ndarray:
    """Detect larger text blocks with MSER and inpaint them from the line mask.

    This targets report panels, legends, and titles so they don't influence
    shoreline and contour extraction. Works regardless of panel position.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    mser = cv2.MSER_create()
    try:
        mser.setMinArea(60)
        mser.setMaxArea(10000)
        # Some builds have setDelta
        if hasattr(mser, 'setDelta'):
            mser.setDelta(5)
    except Exception:
        pass
    regions, _ = mser.detectRegions(gray)

    mask = np.zeros_like(line_mask)
    h, w = mask.shape[:2]
    for pts in regions:
        x, y, ww, hh = cv2.boundingRect(pts)
        # Heuristics: prefer aspect ratios typical for text lines/blocks
        if hh < 8 or ww < 15:
            continue
        if ww / hh > 20 or hh / ww > 10:
            continue
        cv2.rectangle(mask, (x - 2, y - 2), (x + ww + 2, y + hh + 2), 255, thickness=-1)

    # Inpaint MSER-detected blocks from the line mask
    inpainted = cv2.inpaint(line_mask, mask, inpaintRadius=3, flags=cv2.INPAINT_NS)
    return inpainted


# ---------------------------- OCR (EasyOCR default) ----------------------------

def ocr_points_easyocr(binary_for_text: np.ndarray) -> List[Dict[str, Any]]:
    # Lazy import to speed cold start only when engine selected
    import easyocr  # type: ignore

    # Swedish + English improves robustness on old scans; EasyOCR uses model download on first run
    reader = easyocr.Reader(["sv", "en"], gpu=False, verbose=False)

    # EasyOCR expects RGB
    rgb = cv2.cvtColor(binary_for_text, cv2.COLOR_GRAY2RGB)
    results = reader.readtext(rgb, detail=1, paragraph=False)

    hits: List[Dict[str, Any]] = []
    import re
    for bbox, text, conf in results:
        if not text:
            continue
        # Strip any non-digit/decimal characters (units, words)
        cleaned = re.sub(r"[^0-9.,]", "", text)
        if not cleaned:
            continue
        # Skip tokens with multiple separators (likely not a depth label)
        if cleaned.count('.') + cleaned.count(',') > 1:
            continue
        # Avoid long integer tokens (likely years, page refs). Allow up to 3 digits
        if cleaned.replace('.', '').replace(',', '').isdigit() and len(cleaned.replace('.', '').replace(',', '')) > 3:
            continue
        norm = cleaned.replace(",", ".").strip()
        try:
            value = float(norm)
        except ValueError:
            continue
        # bbox is 4 points; compute center and width/height
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        left, right = float(min(xs)), float(max(xs))
        top, bottom = float(min(ys)), float(max(ys))
        cx, cy = (left + right) / 2.0, (top + bottom) / 2.0
        hits.append({
            "depth_m": value,
            "confidence": float(conf),  # already 0..1
            "bbox": [left, top, right - left, bottom - top],
            "center_xy": [cx, cy],
        })
    return hits


def ocr_points_tesseract(binary_for_text: np.ndarray) -> List[Dict[str, Any]]:
    import pytesseract  # type: ignore
    import re

    config = "--psm 6 -c tessedit_char_whitelist=0123456789.,"
    data = pytesseract.image_to_data(binary_for_text, config=config, output_type=pytesseract.Output.DICT)
    hits: List[Dict[str, Any]] = []
    n = len(data.get("text", []))
    for i in range(n):
        raw = (data["text"][i] or "").strip()
        txt = re.sub(r"[^0-9.,]", "", raw)
        if not txt:
            continue
        if txt.count('.') + txt.count(',') > 1:
            continue
        if txt.replace('.', '').replace(',', '').isdigit() and len(txt.replace('.', '').replace(',', '')) > 3:
            continue
        norm = txt.replace(",", ".")
        try:
            value = float(norm)
        except ValueError:
            continue
        conf_str = data.get("conf", ["-1"])[i]
        try:
            conf = float(conf_str) / 100.0 if conf_str != "-1" else 0.0
        except Exception:
            conf = 0.0
        x = int(data.get("left", [0])[i])
        y = int(data.get("top", [0])[i])
        w = int(data.get("width", [0])[i])
        h = int(data.get("height", [0])[i])
        hits.append({
            "depth_m": value,
            "confidence": conf,
            "bbox": [float(x), float(y), float(w), float(h)],
            "center_xy": [float(x + w / 2.0), float(y + h / 2.0)],
        })
    return hits


# ---------------------------- Linework extraction ----------------------------

def inpaint_text_from_lines(lines_bw: np.ndarray, ocr_hits: List[Dict[str, Any]]) -> np.ndarray:
    mask = np.zeros_like(lines_bw)
    for hit in ocr_hits:
        x, y, w, h = hit["bbox"]
        x0 = max(0, int(math.floor(x - 2)))
        y0 = max(0, int(math.floor(y - 2)))
        x1 = min(lines_bw.shape[1] - 1, int(math.ceil(x + w + 2)))
        y1 = min(lines_bw.shape[0] - 1, int(math.ceil(y + h + 2)))
        cv2.rectangle(mask, (x0, y0), (x1, y1), 255, thickness=-1)
    # Use Navier-Stokes inpainting to reconstruct lines below text regions
    inpainted = cv2.inpaint(lines_bw, mask, inpaintRadius=3, flags=cv2.INPAINT_NS)
    return inpainted


def extract_contours_and_shoreline(lines_bw_no_text: np.ndarray) -> Tuple[List[np.ndarray], Optional[np.ndarray]]:
    # Smooth a bit, then close gaps so contours are more continuous
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(lines_bw_no_text, cv2.MORPH_CLOSE, kernel, iterations=1)

    h, w = closed.shape[:2]
    contours, _ = cv2.findContours(closed, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return [], None

    # Score closed contours by (a) interior line density and (b) relative area,
    # and prefer contours that do not touch the page border. This avoids assuming
    # a fixed panel position (right/left/middle).
    def is_near_border(bbox, margin=0.01):
        x, y, ww, hh = bbox
        return (x < w * margin) or (y < h * margin) or ((x + ww) > w * (1 - margin)) or ((y + hh) > h * (1 - margin))

    shoreline = None
    best_score = -1.0
    for c in contours:
        if len(c) < 50:
            continue
        area = float(cv2.contourArea(c))
        if area <= 0:
            continue
        x, y, ww, hh = cv2.boundingRect(c)
        if is_near_border((x, y, ww, hh)):
            continue
        # Penalize very rectangular shapes (likely frames)
        approx = cv2.approxPolyDP(c, epsilon=0.02 * cv2.arcLength(c, True), closed=True)
        rect_penalty = 1.0 if len(approx) <= 6 else 0.0

        # Interior line density: count white pixels of 'closed' within contour
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(mask, [c], -1, 255, thickness=cv2.FILLED)
        line_pixels = int(np.sum((closed > 0) & (mask > 0)))
        density = line_pixels / max(area, 1.0)

        # Nested-contour ratio: proportion of other contours whose centroid lies inside
        nested = 0
        total = 0
        for d in contours:
            if d is c or len(d) < 10:
                continue
            M = cv2.moments(d)
            if M.get('m00', 0) == 0:
                continue
            cx = M['m10'] / M['m00']
            cy = M['m01'] / M['m00']
            if mask[int(min(max(cy, 0), h - 1)), int(min(max(cx, 0), w - 1))] > 0:
                nested += 1
            total += 1
        nested_ratio = (nested / total) if total > 0 else 0.0

        score = (area / (w * h)) * 6.0 + density * 20.0 + nested_ratio * 10.0 - rect_penalty * 5.0
        if score > best_score:
            best_score = score
            shoreline = c

    filtered = [c for c in contours if len(c) >= 25]
    return filtered, shoreline


def contour_to_linestring(c: np.ndarray) -> LineString:
    pts = [(float(p[0][0]), float(p[0][1])) for p in c]
    # Simplify slightly to reduce noise
    line = LineString(pts).simplify(1.0, preserve_topology=False)
    return line


def assign_depth_to_contours(lines: List[LineString], ocr_hits: List[Dict[str, Any]], max_px: float = 25.0) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    label_points = [Point(hit["center_xy"][0], hit["center_xy"][1]) for hit in ocr_hits]
    for line in lines:
        if line.length < 30:
            continue
        # nearest label
        best_idx = None
        best_dist = float("inf")
        for i, lp in enumerate(label_points):
            d = line.distance(lp)
            if d < best_dist:
                best_dist = d
                best_idx = i
        if best_idx is not None and best_dist <= max_px:
            hit = ocr_hits[best_idx]
            results.append({
                "type": "Feature",
                "geometry": mapping(line),
                "properties": {
                    "depth_m": hit["depth_m"],
                    "confidence": hit["confidence"],
                    "coordinate_space": "pixel",
                },
            })
        else:
            results.append({
                "type": "Feature",
                "geometry": mapping(line),
                "properties": {
                    "depth_m": None,
                    "confidence": 0.0,
                    "coordinate_space": "pixel",
                },
            })
    return results


# ---------------------------- Optional georeferencing ----------------------------

def sample_ring(ring: Sequence[Tuple[float, float]], k: int) -> np.ndarray:
    line = LineString(ring)
    length = line.length
    if length == 0:
        return np.array(ring, dtype=np.float64)
    samples = [line.interpolate((i / k) * length) for i in range(k)]
    return np.array([[p.x, p.y] for p in samples], dtype=np.float64)


def umeyama_similarity(src: np.ndarray, dst: np.ndarray) -> Tuple[float, np.ndarray, np.ndarray]:
    """Compute similarity transform (scale, rotation matrix 2x2, translation) using Umeyama."""
    assert src.shape == dst.shape and src.shape[1] == 2
    n = src.shape[0]
    mu_src = src.mean(axis=0)
    mu_dst = dst.mean(axis=0)
    src_c = src - mu_src
    dst_c = dst - mu_dst
    cov = (dst_c.T @ src_c) / n
    U, D, Vt = np.linalg.svd(cov)
    S = np.eye(2)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        S[-1, -1] = -1
    R = U @ S @ Vt
    var_src = (src_c ** 2).sum() / n
    scale = np.trace(np.diag(D) @ S) / var_src
    t = mu_dst - scale * (R @ mu_src)
    return float(scale), R, t


def try_georeference(shoreline_px: Optional[np.ndarray], lake_polygon: Optional[Polygon]) -> Optional[Tuple[float, np.ndarray, np.ndarray]]:
    if shoreline_px is None or lake_polygon is None:
        return None

    # Convert shoreline contour to simple ring
    ring = [(float(p[0][0]), float(p[0][1])) for p in shoreline_px]
    if len(ring) < 50:
        return None
    # Sample both shapes to the same number of points
    k = 200
    px_pts = sample_ring(ring, k)
    lake_ring = list(lake_polygon.exterior.coords)
    geo_pts = sample_ring(lake_ring, k)

    # Try both directions to reduce orientation ambiguity
    geo_pts_rev = geo_pts[::-1].copy()
    def rmse(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.sqrt(np.mean(np.sum((a - b) ** 2, axis=1))))

    s1, R1, t1 = umeyama_similarity(px_pts, geo_pts)
    err1 = rmse((px_pts @ R1.T) * s1 + t1, geo_pts)

    s2, R2, t2 = umeyama_similarity(px_pts, geo_pts_rev)
    err2 = rmse((px_pts @ R2.T) * s2 + t2, geo_pts_rev)

    if min(err1, err2) > 1000:  # heuristic guard; images can be very large
        return None
    return (s1, R1, t1) if err1 <= err2 else (s2, R2, t2)


def apply_similarity(coords: Iterable[Tuple[float, float]], scale: float, R: np.ndarray, t: np.ndarray) -> List[Tuple[float, float]]:
    out: List[Tuple[float, float]] = []
    for x, y in coords:
        vec = np.array([x, y], dtype=np.float64)
        mapped = (scale * (R @ vec)) + t
        out.append((float(mapped[0]), float(mapped[1])))
    return out


# ---------------------------- IO helpers ----------------------------

def write_geojson(path: str, features: List[Dict[str, Any]]) -> None:
    obj = {"type": "FeatureCollection", "features": features}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def ensure_outdir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


# ---------------------------- Main pipeline ----------------------------

def parse_lake_id_from_path(p: str) -> Optional[str]:
    # Look for 6 digits - 6 digits anywhere in the path
    m = re.search(r"(\d{6}-\d{6})", p)
    return m.group(1) if m else None


def process_one(image_path: str, out_dir: str, lake_id: Optional[str], engine: str, min_conf: float, lake_geojson: Optional[str]) -> None:
    bgr = read_image_bgr(image_path)
    bw_lines = binarize_for_lines(bgr)
    bw_text = binarize_for_text(bgr)

    if engine == "easyocr":
        ocr_hits = ocr_points_easyocr(bw_text)
    else:
        ocr_hits = ocr_points_tesseract(bw_text)

    filtered_hits = []
    for h in ocr_hits:
        conf = float(h.get("confidence", 0.0))
        if conf >= min_conf:
            filtered_hits.append(h)
    ocr_hits = filtered_hits

    # Remove MSER text blocks before lines, then inpaint OCR boxes
    bw_lines = remove_text_blocks_mser(bgr, bw_lines)
    lines_no_text = inpaint_text_from_lines(bw_lines, ocr_hits)
    raw_contours, shoreline_contour = extract_contours_and_shoreline(lines_no_text)

    # Distance transform on line mask to keep OCR close to any linework
    line_mask = (lines_no_text > 0).astype(np.uint8) * 255
    inv = 255 - line_mask
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, 5)

    line_strings: List[LineString] = [contour_to_linestring(c) for c in raw_contours]
    contour_features = assign_depth_to_contours(line_strings, ocr_hits)

    shoreline_features: List[Dict[str, Any]] = []
    shoreline_poly: Optional[Polygon] = None
    if shoreline_contour is not None:
        ring = [(float(p[0][0]), float(p[0][1])) for p in shoreline_contour]
        shoreline_poly = Polygon(ring)
        shoreline_features.append({
            "type": "Feature",
            "geometry": mapping(shoreline_poly),
            "properties": {"coordinate_space": "pixel"},
        })

    # If shoreline polygon exists, refine OCR hits by (a) inside shoreline,
    # (b) near linework, (c) consistent text size, and (d) value outlier filter.
    if shoreline_poly is not None and len(ocr_hits) > 0:
        kept: List[Dict[str, Any]] = []
        heights: List[float] = []
        for h in ocr_hits:
            cx, cy = h["center_xy"]
            if shoreline_poly.contains(Point(cx, cy)):
                ix, iy = int(round(cx)), int(round(cy))
                if 0 <= iy < dist.shape[0] and 0 <= ix < dist.shape[1] and dist[iy, ix] <= 25.0:
                    kept.append(h)
                    heights.append(float(h["bbox"][3]))
        if len(kept) >= 6:
            p10 = float(np.percentile(heights, 10))
            p90 = float(np.percentile(heights, 90))
            lower, upper = max(5.0, p10 * 0.6), p90 * 1.4
            kept = [h for h in kept if lower <= float(h["bbox"][3]) <= upper]
        # Value outlier filter via IQR
        if len(kept) >= 6:
            vals = np.array([float(h["depth_m"]) for h in kept], dtype=np.float64)
            q1, q3 = np.percentile(vals, [25, 75])
            iqr = max(1e-6, q3 - q1)
            lo, hi = q1 - 3 * iqr, q3 + 3 * iqr
            kept = [h for h in kept if lo <= float(h["depth_m"]) <= hi]
        ocr_hits = kept

    point_features: List[Dict[str, Any]] = []
    for hit in ocr_hits:
        cx, cy = hit["center_xy"]
        point_features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(cx), float(cy)]},
            "properties": {
                "lake_id": lake_id,
                "depth_m": float(hit["depth_m"]),
                "confidence": float(hit["confidence"]),
                "ocr_bbox": [float(v) for v in hit["bbox"]],
                "source_image": image_path,
                "coordinate_space": "pixel",
            },
        })

    base = os.path.splitext(os.path.basename(image_path))[0]
    points_out = os.path.join(out_dir, f"{base}.points.geojson")
    contours_out = os.path.join(out_dir, f"{base}.contours.geojson")
    shoreline_out = os.path.join(out_dir, f"{base}.shoreline.geojson")
    write_geojson(points_out, point_features)
    write_geojson(contours_out, contour_features)
    write_geojson(shoreline_out, shoreline_features)
    print(f"Wrote {len(point_features)} OCR points -> {points_out}")
    print(f"Wrote {len(contour_features)} contours -> {contours_out}")
    print(f"Wrote {len(shoreline_features)} shoreline -> {shoreline_out}")

    # Optional georef per-file using provided polygon file
    if lake_geojson and shoreline_contour is not None:
        with open(lake_geojson, "r", encoding="utf-8") as f:
            lake_obj = json.load(f)
        geom = shape(lake_obj["features"][0]["geometry"]) if lake_obj.get("type") == "FeatureCollection" else shape(lake_obj["geometry"])  # type: ignore
        lake_poly = geom if isinstance(geom, Polygon) else None
        transform = try_georeference(shoreline_contour, lake_poly)
        if transform is not None:
            scale, R, t = transform

            def map_coords(coords):
                return apply_similarity(coords, scale, R, t)

            points_geo: List[Dict[str, Any]] = []
            for feat in point_features:
                x, y = feat["geometry"]["coordinates"]
                mapped = apply_similarity([(x, y)], scale, R, t)[0]
                f2 = json.loads(json.dumps(feat))
                f2["geometry"]["coordinates"] = [mapped[0], mapped[1]]
                f2["properties"]["coordinate_space"] = "geo"
                points_geo.append(f2)

            contours_geo: List[Dict[str, Any]] = []
            for feat in contour_features:
                coords = feat["geometry"]["coordinates"]
                mapped = map_coords(coords)
                f2 = json.loads(json.dumps(feat))
                f2["geometry"]["coordinates"] = mapped
                f2["properties"]["coordinate_space"] = "geo"
                contours_geo.append(f2)

            shoreline_geo: List[Dict[str, Any]] = []
            for feat in shoreline_features:
                coords = feat["geometry"]["coordinates"][0]
                mapped = map_coords(coords)
                f2 = json.loads(json.dumps(feat))
                f2["geometry"]["coordinates"][0] = mapped
                f2["properties"]["coordinate_space"] = "geo"
                shoreline_geo.append(f2)

            base = os.path.splitext(os.path.basename(image_path))[0]
            write_geojson(os.path.join(out_dir, f"{base}.points.geo.geojson"), points_geo)
            write_geojson(os.path.join(out_dir, f"{base}.contours.geo.geojson"), contours_geo)
            write_geojson(os.path.join(out_dir, f"{base}.shoreline.geo.geojson"), shoreline_geo)
            print("Georeferenced outputs written.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract OCR depth points, contours and shoreline from a scanned lake map.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--image", help="Path to a single input TIF/PNG/JPEG")
    group.add_argument("--input-root", help="Process all images under this directory recursively")
    parser.add_argument("--pattern", default="*.tif;*.tiff;*.png;*.jpg;*.jpeg", help="Semicolon-separated glob(s) when using --input-root")
    parser.add_argument("--out-dir", default=None, help="Directory for outputs; defaults to alongside each input image")
    parser.add_argument("--out-root", default=None, help="If set, write per-lake into <out-root>/<lake_id || basename>/")
    parser.add_argument("--write-combined", action="store_true", help="Also write a combined bathymetry.geojson per lake")
    parser.add_argument("--lake-id", default=None, help="Optional lake id to embed in properties")
    parser.add_argument("--engine", choices=["easyocr", "tesseract"], default="easyocr", help="OCR engine (default easyocr)")
    parser.add_argument("--min-confidence", type=float, default=0.45, help="Minimum OCR confidence to keep a hit")
    parser.add_argument("--lake-geojson", default=None, help="Optional lake polygon GeoJSON for georeferencing")
    args = parser.parse_args()

    if args.image:
        image_path = os.path.abspath(args.image)
        lake_id = args.lake_id or parse_lake_id_from_path(image_path)
        if args.out_root:
            out_dir = os.path.join(os.path.abspath(args.out_root), (lake_id or os.path.splitext(os.path.basename(image_path))[0]))
        else:
            out_dir = os.path.abspath(args.out_dir) if args.out_dir else os.path.dirname(image_path)
        ensure_outdir(out_dir)
        process_one(image_path, out_dir, lake_id, args.engine, args.min_confidence, args.lake_geojson)
        if args.write_combined:
            base = os.path.splitext(os.path.basename(image_path))[0]
            combined = []
            for name in (f"{base}.points.geojson", f"{base}.contours.geojson", f"{base}.shoreline.geojson"):
                p = os.path.join(out_dir, name)
                if os.path.exists(p):
                    with open(p, "r", encoding="utf-8") as f:
                        fc = json.load(f)
                    for feat in fc.get("features", []):
                        if name.endswith("points.geojson"): feat.setdefault("properties", {}).update({"layer": "points"})
                        elif name.endswith("contours.geojson"): feat.setdefault("properties", {}).update({"layer": "contours"})
                        else: feat.setdefault("properties", {}).update({"layer": "shoreline"})
                        combined.append(feat)
            write_geojson(os.path.join(out_dir, "bathymetry.geojson"), combined)
    else:
        root = os.path.abspath(args.input_root)
        patterns = [p.strip() for p in args.pattern.split(";") if p.strip()]
        for dirpath, _, filenames in os.walk(root):
            for fname in filenames:
                if any(fnmatch.fnmatch(fname.lower(), pat.lower()) for pat in patterns):
                    img_path = os.path.join(dirpath, fname)
                    lake_id = args.lake_id or parse_lake_id_from_path(img_path)
                    if args.out_root:
                        out_dir = os.path.join(os.path.abspath(args.out_root), (lake_id or os.path.splitext(os.path.basename(img_path))[0]))
                    else:
                        out_dir = os.path.abspath(args.out_dir) if args.out_dir else dirpath
                    ensure_outdir(out_dir)
                    try:
                        process_one(img_path, out_dir, lake_id, args.engine, args.min_confidence, args.lake_geojson)
                        if args.write_combined:
                            base = os.path.splitext(os.path.basename(img_path))[0]
                            combined = []
                            for name in (f"{base}.points.geojson", f"{base}.contours.geojson", f"{base}.shoreline.geojson"):
                                p = os.path.join(out_dir, name)
                                if os.path.exists(p):
                                    with open(p, "r", encoding="utf-8") as f:
                                        fc = json.load(f)
                                    for feat in fc.get("features", []):
                                        if name.endswith("points.geojson"): feat.setdefault("properties", {}).update({"layer": "points"})
                                        elif name.endswith("contours.geojson"): feat.setdefault("properties", {}).update({"layer": "contours"})
                                        else: feat.setdefault("properties", {}).update({"layer": "shoreline"})
                                        combined.append(feat)
                            write_geojson(os.path.join(out_dir, "bathymetry.geojson"), combined)
                    except Exception as e:
                        print(f"[WARN] Failed {img_path}: {e}")


if __name__ == "__main__":
    main()


