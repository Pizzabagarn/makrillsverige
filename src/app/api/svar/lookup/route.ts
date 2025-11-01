import { NextResponse } from 'next/server';
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
  const R = 6371000; const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat); const la2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2); const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function loadIndex(): Promise<SvarIndex> {
  const gzPath = path.join(process.cwd(), 'public', 'data', 'svar', 'index.json.gz');
  // Decompress to memory
  const src = fs.createReadStream(gzPath);
  const chunks: Buffer[] = [];
  const gunzip = createGunzip();
  gunzip.on('data', (c) => chunks.push(c));
  await pipeline(src, gunzip as any, async function* () {}) // consume stream
    .catch(() => {});
  if (chunks.length === 0) {
    // Fallback: try plain json
    const jsonPath = path.join(process.cwd(), 'public', 'data', 'svar', 'index.json');
    const raw = await fsp.readFile(jsonPath, 'utf8');
    return JSON.parse(raw);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name') || '';
    const lat = Number(searchParams.get('lat'));
    const lon = Number(searchParams.get('lon'));

    if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: 'missing lat/lon' }, { status: 400 });

    const index = await loadIndex();
    const key = normalizeName(name);
    const candidates = (index.byName[key] || []).map((id) => index.items[index.bySjoid[id]]);
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ sjoid: null, reason: 'no-candidate' });
    }

    // Choose nearest by coordinates strictly; if multiple lack coords, drop them
    let best: any = null; let bestD = Number.POSITIVE_INFINITY;
    for (const it of candidates) {
      if (typeof it.lat === 'number' && typeof it.lon === 'number') {
        const d = haversineMeters({ lat, lon }, { lat: it.lat, lon: it.lon });
        if (d < bestD) { bestD = d; best = it; }
      }
    }
    if (!best) return NextResponse.json({ sjoid: null, reason: 'no-geocoded-candidate' });

    return NextResponse.json({ sjoid: best.sjoid, item: { name: best.name, lat: best.lat, lon: best.lon } });
  } catch (err) {
    console.error('SVAR lookup failed', err);
    return NextResponse.json({ error: 'internal-error' }, { status: 500 });
  }
}
