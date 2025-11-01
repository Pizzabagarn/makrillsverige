import { ungzip } from 'pako';

export type SvarFile = { name: string; relPath: string; size: number };
export type SvarItem = {
  sjoid: string;
  svarId: string;
  waterId: string;
  lakeName: string;
  displayTitle: string;
  name?: string;
  lat?: number;
  lon?: number;
  area_km2?: number;
  dir: string;
  files: SvarFile[];
  has: { tif: boolean; png: boolean; jpg: boolean; pdf: boolean };
};

export type SvarIndex = {
  generatedAt: string;
  counts: { items: number };
  items: SvarItem[];
  bySjoid: Record<string, number>;
  byName: Record<string, string[]>; // normalized name -> list of sjoid
};

export function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000; // meters
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function loadSvarIndex(): Promise<SvarIndex> {
  // Works in browser or server: fetch the gzipped index from public folder
  const res = await fetch('/data/svar/index.json.gz');
  if (!res.ok) throw new Error('Failed to load SVAR index');
  const buf = new Uint8Array(await res.arrayBuffer());
  const json = ungzip(buf, { to: 'string' }) as string;
  return JSON.parse(json) as SvarIndex;
}

export function resolveSvarByName(
  index: SvarIndex,
  name: string,
  hint?: { lat: number; lon: number }
): SvarItem | null {
  const key = normalizeName(name);
  const candidates = index.byName[key]?.map((id) => index.items[index.bySjoid[id]]) ?? [];
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Prefer nearest to hint if provided and valid
  if (hint) {
    let best: SvarItem | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const it of candidates) {
      if (typeof it.lat === 'number' && typeof it.lon === 'number') {
        const d = haversineMeters(hint, { lat: it.lat!, lon: it.lon! });
        if (d < bestD) { bestD = d; best = it; }
      }
    }
    if (best) return best;
  }

  // Otherwise pick the largest by area as a stable heuristic
  let largest: SvarItem = candidates[0];
  for (const it of candidates) {
    if ((it.area_km2 ?? 0) > (largest.area_km2 ?? 0)) largest = it;
  }
  return largest;
}



