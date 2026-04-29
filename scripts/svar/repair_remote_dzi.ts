/*
  Repair incorrect DZI manifests directly in Supabase Storage (no local tiles needed).

  What it does per tiles folder (…/tiles-*_files/):
  - Detect deepest zoom level and sample one tile to infer tileSize/overlap:
      ~513–514px => tileSize=512, overlap=1; ~256–257px => 256/0
  - Read vips-properties.xml (if present) to get original Width/Height
  - Write a correct tiles-*.dzi sibling beside the folder

  Usage (PowerShell on Windows):
    $env:SUPABASE_URL="https://<project>.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY="<service-role>"
    tsx scripts/svar/repair_remote_dzi.ts --bucket=Charts --prefix=svar

  Notes:
  - Requires: sharp, @supabase/supabase-js
  - Only updates manifests; tiles are untouched
*/

import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

function getArg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}

const SUPABASE_URL = process.env.SUPABASE_URL || getArg('url');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || getArg('key');
const BUCKET = getArg('bucket') || 'Charts';
const ROOT_PREFIX = (getArg('prefix') || 'svar').replace(/^\/+|\/+$/g, '');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type ListEntry = { name: string };

async function list(prefix: string): Promise<ListEntry[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  } as any);
  if (error) throw error;
  return (data || []).map((d: any) => ({ name: d.name }));
}

async function isFolder(prefix: string): Promise<boolean> {
  try {
    const children = await list(prefix);
    return children.length > 0;
  } catch {
    return false;
  }
}

async function* walk(prefix: string): AsyncGenerator<string> {
  const entries = await list(prefix);
  for (const e of entries) {
    const child = `${prefix}/${e.name}`.replace(/\/+/, '/');
    if (await isFolder(child)) {
      yield* walk(child);
    } else {
      // yield file keys as needed elsewhere
    }
  }
  // Also yield prefix itself so caller can inspect folder names
  yield prefix;
}

function buildDziXml(params: { width?: number; height?: number; format: 'jpeg' | 'png'; tileSize: 256 | 512; overlap: 0 | 1 }): string {
  const { width, height, format, tileSize, overlap } = params;
  const w = width ?? 0;
  const h = height ?? 0;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="${format}" Overlap="${overlap}" TileSize="${tileSize}">\n` +
    `  <Size Width="${w}" Height="${h}"/>\n` +
    `</Image>\n`
  );
}

async function readText(key: string): Promise<string | undefined> {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error) return undefined;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString('utf8');
}

async function readBuffer(key: string): Promise<Buffer | undefined> {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error) return undefined;
  return Buffer.from(await data.arrayBuffer());
}

async function uploadText(key: string, content: string, contentType = 'application/xml') {
  const { error } = await supabase.storage.from(BUCKET).upload(key, Buffer.from(content, 'utf8'), {
    contentType,
    upsert: true,
  });
  if (error) throw error;
}

function parseVipsProps(xml: string): { width?: number; height?: number } {
  const w = /<name>width<\/name>\s*<value[^>]*>(\d+)<\/value>/i.exec(xml)?.[1];
  const h = /<name>height<\/name>\s*<value[^>]*>(\d+)<\/value>/i.exec(xml)?.[1];
  return { width: w ? Number(w) : undefined, height: h ? Number(h) : undefined };
}

async function detectTileParams(tilesFolderKey: string): Promise<{ tileSize: 256 | 512; overlap: 0 | 1; format: 'jpeg' | 'png' }> {
  // Find deepest zoom level (numeric folder name max)
  const children = await list(tilesFolderKey);
  const zooms = children
    .map((c) => Number(c.name))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  const deepest = zooms[0];
  if (deepest === undefined) {
    // no numeric subfolders; fallback
    return { tileSize: 512, overlap: 1, format: 'jpeg' };
  }
  // List files in deepest
  const levelKey = `${tilesFolderKey}/${deepest}`;
  const files = await list(levelKey);
  // pick first tile
  const candidate = files.find((f) => /\.(png|jpg|jpeg)$/i.test(f.name));
  if (!candidate) return { tileSize: 512, overlap: 1, format: 'jpeg' };
  const ext = path.extname(candidate.name).toLowerCase();
  const format: 'jpeg' | 'png' = ext === '.png' ? 'png' : 'jpeg';
  const tileBuf = await readBuffer(`${levelKey}/${candidate.name}`);
  if (!tileBuf) return { tileSize: 512, overlap: 1, format };
  const meta = await sharp(tileBuf).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  // Heuristics
  if (w >= 513 || h >= 513) return { tileSize: 512, overlap: 1, format };
  return { tileSize: 256, overlap: 0, format };
}

async function run() {
  console.log(`Scanning '${BUCKET}/${ROOT_PREFIX}' for tiles folders…`);
  const repaired: string[] = [];
  for await (const prefix of walk(ROOT_PREFIX)) {
    const base = path.posix.basename(prefix);
    if (!/_files$/i.test(base)) continue;
    const parent = path.posix.dirname(prefix);
    const tilesBase = base.replace(/_files$/i, '');
    const dziKey = `${parent}/${tilesBase}.dzi`;

    // Detect params
    const { tileSize, overlap, format } = await detectTileParams(prefix);

    // Try read vips-properties for size
    const vipsXml = await readText(`${prefix}/vips-properties.xml`);
    const { width, height } = vipsXml ? parseVipsProps(vipsXml) : { width: undefined, height: undefined };

    const dzi = buildDziXml({ width, height, format, tileSize, overlap });
    await uploadText(dziKey, dzi);
    repaired.push(dziKey);
    if (repaired.length % 50 === 0) console.log(`Repaired ${repaired.length} manifests…`);
  }
  console.log(`Done. Repaired ${repaired.length} DZI manifests.`);
}

run().catch((e) => { console.error(e); process.exit(1); });






