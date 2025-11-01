#!/usr/bin/env python3
"""
Polygonize depth bands between contour lines.

Inputs:
  - --contours: GeoJSON with LineString features (optionally with properties.depth_m)
  - --shoreline: GeoJSON with a shoreline Polygon (pixel or geo coordinates)
  - --out: Output GeoJSON of Polygon features representing depth bands
  - --clip-geojson: Optional GeoJSON polygon to clip the result so it
                    matches your database lake geometry exactly

Optional:
  - --step: Numeric step in meters between labeled contours. If omitted, the
            script tries to infer a typical step from labeled contour values.

Notes:
  - This script assumes isolinjerna är huvudsakligen slutna slingor.
  - Bandindex 0 är närmast strandlinjen; ökar inåt mot djupare vatten.
"""

from __future__ import annotations

import argparse
import json
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from shapely.geometry import LineString, Polygon, mapping, shape  # type: ignore
from shapely.ops import polygonize, unary_union  # type: ignore


def read_geojson(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_geojson(path: str, features: List[Dict[str, Any]]) -> None:
    obj = {"type": "FeatureCollection", "features": features}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def extract_lines(contours_obj: Dict[str, Any]) -> List[Tuple[LineString, Optional[float]]]:
    out: List[Tuple[LineString, Optional[float]]] = []
    feats = contours_obj["features"] if contours_obj.get("type") == "FeatureCollection" else [contours_obj]
    for feat in feats:
        geom = shape(feat["geometry"])  # type: ignore
        if not isinstance(geom, LineString):
            continue
        props = feat.get("properties", {}) or {}
        depth = props.get("depth_m")
        try:
            depth_val = float(depth) if depth is not None else None
        except Exception:
            depth_val = None
        out.append((geom, depth_val))
    return out


def infer_step(labeled_depths: List[float]) -> Optional[float]:
    if len(labeled_depths) < 2:
        return None
    vals = sorted(set(round(v, 3) for v in labeled_depths))
    diffs: List[float] = []
    for i in range(1, len(vals)):
        d = round(vals[i] - vals[i - 1], 3)
        if d > 0:
            diffs.append(d)
    if not diffs:
        return None
    # Pick the most frequent diff rounded to 0.5 cm precision
    hist: Dict[float, int] = {}
    for d in diffs:
        key = round(d, 2)
        hist[key] = hist.get(key, 0) + 1
    best = max(hist.items(), key=lambda kv: kv[1])[0]
    return best


def build_band_polygons(
    contour_lines: List[Tuple[LineString, Optional[float]]],
    shoreline_poly: Polygon,
    step_m: Optional[float],
) -> List[Dict[str, Any]]:
    # Combine all lines with shoreline exterior for polygonization
    all_lines: List[LineString] = [ls for (ls, _d) in contour_lines]
    all_lines.append(LineString(list(shoreline_poly.exterior.coords)))

    polys = list(polygonize(all_lines))

    # Build a list of closed loops (as Polygons) from contour lines for nesting count
    loop_polys: List[Tuple[Polygon, Optional[float]]] = []
    for ls, d in contour_lines:
        if ls.is_ring and len(ls.coords) >= 4:
            try:
                loop_polys.append((Polygon(ls.coords), d))
            except Exception:
                pass

    shoreline_bounds = shoreline_poly.bounds

    features: List[Dict[str, Any]] = []
    for poly in polys:
        # Skip outside shoreline or sliver artifacts
        if not poly.is_valid or poly.area <= 1e-6:
            continue
        if not shoreline_poly.contains(poly.buffer(0)):
            continue

        centroid = poly.representative_point()

        # Count how many contour loops enclose this polygon -> band index
        num_enclosing = 0
        for lp, _ld in loop_polys:
            try:
                if lp.contains(centroid):
                    num_enclosing += 1
            except Exception:
                continue

        depth_min: Optional[float] = None
        depth_max: Optional[float] = None
        if step_m is not None:
            depth_min = num_enclosing * step_m
            depth_max = (num_enclosing + 1) * step_m

        feat = {
            "type": "Feature",
            "geometry": mapping(poly),
            "properties": {
                "band_index": int(num_enclosing),
                "depth_min": depth_min,
                "depth_max": depth_max,
                "coordinate_space": "geo_or_pixel",  # updated by caller
            },
        }
        features.append(feat)

    return features


def main() -> None:
    p = argparse.ArgumentParser(description="Polygonize depth bands between contours")
    p.add_argument("--contours", required=True, help="Path to contours GeoJSON")
    p.add_argument("--shoreline", required=True, help="Path to shoreline GeoJSON (Polygon)")
    p.add_argument("--out", required=True, help="Output GeoJSON for depth bands")
    p.add_argument("--step", type=float, default=None, help="Depth step in meters; if omitted, infer from labels")
    p.add_argument("--coordinate-space", default=None, help="Override coordinate_space property value")
    p.add_argument("--clip-geojson", default=None, help="Optional GeoJSON to clip polygons for DB match")
    args = p.parse_args()

    contours_obj = read_geojson(args.contours)
    shoreline_obj = read_geojson(args.shoreline)

    # Accept FeatureCollection or single Feature for shoreline
    if shoreline_obj.get("type") == "FeatureCollection":
        geom = shape(shoreline_obj["features"][0]["geometry"])  # type: ignore
    else:
        geom = shape(shoreline_obj["geometry"])  # type: ignore
    shoreline_poly = geom if isinstance(geom, Polygon) else Polygon(geom)  # type: ignore

    lines = extract_lines(contours_obj)
    labeled_depths = [d for (_ls, d) in lines if d is not None]
    step_m = args.step if args.step is not None else infer_step(labeled_depths)

    features = build_band_polygons(lines, shoreline_poly, step_m)
    coord_space = args.coordinate_space or (
        (contours_obj.get("features", [{}])[0].get("properties", {}).get("coordinate_space"))
        if contours_obj.get("type") == "FeatureCollection" else None
    ) or "geo"
    for f in features:
        f.setdefault("properties", {})["coordinate_space"] = coord_space

    # Optional clip to DB lake geometry for exact match
    if args.clip_geojson:
        clip_obj = read_geojson(args.clip_geojson)
        if clip_obj.get("type") == "FeatureCollection":
            parts = [shape(feat["geometry"]) for feat in clip_obj.get("features", [])]
        else:
            parts = [shape(clip_obj["geometry"])]
        clip_geom = unary_union(parts)
        clipped: List[Dict[str, Any]] = []
        for f in features:
            geom = shape(f["geometry"])  # type: ignore
            inter = geom.intersection(clip_geom)
            if not inter.is_empty and inter.area > 1e-6:
                f2 = json.loads(json.dumps(f))
                f2["geometry"] = mapping(inter)
                clipped.append(f2)
        features = clipped

    write_geojson(args.out, features)
    print(f"Wrote {len(features)} depth-band polygons -> {args.out}")


if __name__ == "__main__":
    main()


