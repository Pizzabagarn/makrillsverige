import * as turf from '@turf/turf';
import { fetchWithRetry } from '../utils/retry';

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter'
];

export async function overpassQuery(ql: string, timeoutSec = 15): Promise<any | null> {
  const body = `data=${encodeURIComponent(ql)}`;
  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), (timeoutSec + 3) * 1000);
      const res = await fetchWithRetry(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: controller.signal });
      clearTimeout(to);
      if (!res.ok) continue;
      return res.json();
    } catch {
      continue;
    }
  }
  return null;
}

export async function findNearestHighway(point: [number, number], radiusKm: number, includeFootpaths = false): Promise<{ point: [number, number]; distance_m: number; wayType: string } | null> {
  const [lng, lat] = point;
  const latDegPerKm = 1 / 110.574;
  const lngDegPerKm = 1 / (111.320 * Math.cos(lat * Math.PI / 180));
  const bbox = {
    south: lat - radiusKm * latDegPerKm,
    north: lat + radiusKm * latDegPerKm,
    west: lng - radiusKm * lngDegPerKm,
    east: lng + radiusKm * lngDegPerKm
  };
  const vehicleSet = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track';
  const highwayTypes = includeFootpaths
    ? `${vehicleSet}|footway|path|cycleway|steps`
    : vehicleSet;
  const ql = `
    [out:json][timeout:12];
    (
      way["highway"~"^(${highwayTypes})$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out geom;
  `;
  const data = await overpassQuery(ql, 12);
  if (!data?.elements?.length) return null;
  const userPt = turf.point(point);
  let best: { p: [number, number]; d: number; type: string } | null = null;
  for (const el of data.elements) {
    if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;
    const line = turf.lineString(el.geometry.map((n: any) => [n.lon, n.lat]));
    const snapped: any = turf.nearestPointOnLine(line as any, userPt as any, { units: 'meters' } as any);
    const snappedCoord = snapped?.geometry?.coordinates as [number, number] | undefined;
    if (!snappedCoord) continue;
    const dist = turf.distance(userPt as any, turf.point(snappedCoord) as any, { units: 'meters' } as any) as number;
    if (!best || dist < best.d) best = { p: snappedCoord, d: dist, type: el.tags?.highway || 'unknown' };
  }
  if (!best) return null;
  return { point: best.p, distance_m: best.d, wayType: best.type };
}

export interface AccessCandidate { coord: [number, number]; source: 'parking' | 'trailhead' | 'path_sample'; }

export async function getAccessCandidates(center: [number, number], radiusKm = 10, maxCandidates = 20): Promise<AccessCandidate[]> {
  const [lng, lat] = center;
  const latDegPerKm = 1 / 110.574;
  const lngDegPerKm = 1 / (111.320 * Math.cos(lat * Math.PI / 180));
  const r = Math.min(Math.max(radiusKm, 2), 20);
  const bbox = { south: lat - r * latDegPerKm, north: lat + r * latDegPerKm, west: lng - r * lngDegPerKm, east: lng + r * lngDegPerKm };
  const ql = `
    [out:json][timeout:20];
    (
      node["amenity"~"^(parking|parking_entrance)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      node["highway"="trailhead"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["highway"~"^(path|footway|track|service)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out geom;
  `;
  const data = await overpassQuery(ql, 20);
  if (!data?.elements) return [];
  const results: AccessCandidate[] = [];
  for (const el of data.elements) {
    if (el.type === 'node') {
      if (typeof el.lat === 'number' && typeof el.lon === 'number') {
        if (el.tags?.amenity) results.push({ coord: [el.lon, el.lat], source: 'parking' });
        else if (el.tags?.highway === 'trailhead') results.push({ coord: [el.lon, el.lat], source: 'trailhead' });
      }
    } else if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      const geom = el.geometry as Array<{ lat: number; lon: number }>;
      const step = Math.max(1, Math.floor(geom.length / 10));
      for (let i = 0; i < geom.length; i += step) {
        const p = geom[i];
        results.push({ coord: [p.lon, p.lat], source: 'path_sample' });
        if (results.length >= maxCandidates) break;
      }
    }
    if (results.length >= maxCandidates) break;
  }
  // Deduplicate ~30m grid
  const seen = new Set<string>();
  const dedup: AccessCandidate[] = [];
  for (const c of results) {
    const k = `${(c.coord[0] * 1000) | 0},${(c.coord[1] * 1000) | 0}`;
    if (!seen.has(k)) { seen.add(k); dedup.push(c); }
  }
  return dedup.slice(0, maxCandidates);
}

export async function getMotorableWaysBBox(bbox: { south: number; west: number; north: number; east: number }): Promise<Array<[number, number][]>> {
  const vehicleSet = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track';
  const ql = `
    [out:json][timeout:20];
    (
      way["highway"~"^(${vehicleSet})$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out geom;
  `;
  const data = await overpassQuery(ql, 20);
  if (!data?.elements) return [];
  const lines: Array<[number, number][]> = [];
  for (const el of data.elements) {
    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      lines.push(el.geometry.map((n: any) => [n.lon, n.lat] as [number, number]));
    }
  }
  return lines;
}


