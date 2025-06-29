//src/lib/extractWaterPoints.ts

import type { FeatureCollection, Polygon } from 'geojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

export function generateSamplePointsFromWaterMask(
    geojson: FeatureCollection,
    step = 0.1
): { lat: number; lon: number }[] {
    const bbox = getBoundingBox(geojson);
    const points: { lat: number; lon: number }[] = [];

      // console.log("🧭 Bounding Box:");
  // console.log("  Lat:", bbox.minLat, "→", bbox.maxLat);
  // console.log("  Lon:", bbox.minLon, "→", bbox.maxLon);

    let attempts = 0;
    for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += step) {
        for (let lon = bbox.minLon; lon <= bbox.maxLon; lon += step) {
            attempts++;

            const pt = turfPoint([lon, lat]);
            const inside = geojson.features.some((f) =>
                (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") &&
                booleanPointInPolygon(pt, f as any)
            );

            if (inside) {
                points.push({ lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)) });
            }
        }
    }

      // console.log(`💧 Antal punkter inuti masken: ${points.length}`);
  // console.log(`🔎 Totalt testade punkter: ${attempts}`);

    return points;
}

function getBoundingBox(fc: FeatureCollection) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;

    for (const f of fc.features) {
        if (f.geometry.type === "Polygon") {
            const coords = (f.geometry as Polygon).coordinates[0];
            coords.forEach(([lon, lat]) => {
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
            });
        }
    }

    return { minLat, maxLat, minLon, maxLon };
}
