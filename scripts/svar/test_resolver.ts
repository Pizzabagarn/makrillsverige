import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

type SvarIndex = {
  items: any[];
  bySjoid: Record<string, number>;
  byName: Record<string, string[]>;
};

function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
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

async function loadIndexGz(): Promise<SvarIndex> {
  const src = fs.createReadStream(path.join('public', 'data', 'svar', 'index.json.gz'));
  const dstPath = path.join('temp', 'svar_index_tmp.json');
  await fsp.mkdir('temp', { recursive: true });
  const dst = fs.createWriteStream(dstPath);
  const gunzip = createGunzip();
  await pipeline(src, gunzip, dst);
  const raw = await fsp.readFile(dstPath, 'utf8');
  return JSON.parse(raw);
}

function resolveByName(index: SvarIndex, name: string, hint?: { lat: number; lon: number }) {
  const key = normalizeName(name);
  const candidates = (index.byName[key] || []).map((id) => index.items[index.bySjoid[id]]);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (hint) {
    let best: any = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const it of candidates) {
      if (typeof it.lat === 'number' && typeof it.lon === 'number') {
        const d = haversineMeters(hint, { lat: it.lat, lon: it.lon });
        if (d < bestD) { bestD = d; best = it; }
      }
    }
    if (best) return best;
  }
  return candidates.sort((a, b) => (b.area_km2 ?? 0) - (a.area_km2 ?? 0))[0];
}

async function main() {
  const index = await loadIndexGz();
  console.log(`Index has ${index.items.length} items.`);

  // Example: Börringesjön (should exist)
  const b = resolveByName(index, 'Börringesjön', { lat: 55.48576535801484, lon: 13.314536762077871 });
  console.log('Börringesjön ->', b ? `${b.sjoid} ${b.name}` : 'not found');

  // Ambiguous example without hint
  const o = resolveByName(index, 'Örsjön');
  console.log('Örsjön candidates:', (index.byName[normalizeName('Örsjön')] || []).length, 'picked ->', o?.sjoid);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});



