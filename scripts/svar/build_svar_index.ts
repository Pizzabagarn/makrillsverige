/*
  SVAR downloads indexer

  Scans public/data/svar/zips/<waterId>/<svarId>-kartor/ (extracted) and builds a
  consolidated index so we can always resolve the right water by unique svarId/sjoid,
  regardless of name collisions.

  Usage:
    pnpm ts-node scripts/svar/build_svar_index.ts

  Output:
    public/data/svar/index.json
    public/data/svar/index.json.gz (compressed)
*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const ROOT = 'public/data/svar/zips';
const OUT_JSON  = 'public/data/svar/index.json';
const OUT_GZ    = 'public/data/svar/index.json.gz';
const SVAR_IDS  = 'scripts/svar/all_svar_ids.json';
const FULL_SVAR_IDS = 'scripts/svar/all_svar_ids_all_lakes.json';

type FileEntry = { name: string; relPath: string; size: number };
type RecordEntry = {
  // Stable identifiers
  sjoid: string;               // same as svarId from SMHI WFS
  svarId: string;              // kept for clarity

  // Friendly naming + grouping
  waterId: string;             // top-level folder name (sanitized group)
  lakeName: string;            // parsed main name from first filename
  displayTitle: string;        // full title from filename (no id)

  // Location (from all_svar_ids.json, if available)
  name?: string;               // official name from WFS (UTF-8)
  lat?: number;
  lon?: number;
  area_km2?: number;

  // Storage
  dir: string;                 // relative directory for extracted files
  files: FileEntry[];          // files in the svarId-kartor folder
  has: { tif: boolean; png: boolean; jpg: boolean; pdf: boolean }; // quick format flags
};

function parseTitleFromFilename(filename: string): { lakeName: string; displayTitle: string } {
  // Examples:
  // 2-0204_Vänern_(SV_Skoghall)_647666-129906.tif
  // 3-1098_Vänern_647666-129906.tif
  // 2-0211_Yngen_661971-141613.tif
  const base = filename.replace(/\.[^.]+$/, '');
  const noId = base.replace(/_[0-9]{6,}-[0-9]{5,}$/i, '');
  const noPrefix = noId.replace(/^[0-9]+-[0-9]+_/, '');
  const title = noPrefix.replace(/_/g, ' ').trim();
  // lakeName = remove parenthetical suffix
  const lakeName = title.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { lakeName, displayTitle: title };
}

async function listDirs(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
}

async function listFiles(dir: string): Promise<FileEntry[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const out: FileEntry[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const fp = path.join(dir, e.name);
    const st = await fsp.stat(fp);
    const rel = path.relative('public', fp).split(path.sep).join('/');
    out.push({ name: e.name, relPath: rel, size: st.size });
  }
  return out;
}

async function main() {
  const result: RecordEntry[] = [];

  if (!fs.existsSync(ROOT)) {
    console.error(`Missing directory: ${ROOT}. Run the downloader with --extract first.`);
    process.exitCode = 2;
    return;
  }

  // Optional enrichment from SMHI WFS export (prefer full-all-lakes file when present)
  let wfsIndex: Map<string, { name?: string; lat?: number; lon?: number; area_km2?: number } > = new Map();
  try {
    const loadIntoMap = (arr: Array<{ sjoid?: string; name?: string; lat?: number; lon?: number; area_km2?: number }>) => {
      for (const it of arr) {
        const key = String(it.sjoid ?? '');
        if (!key) continue;
        const prev = wfsIndex.get(key) ?? {};
        wfsIndex.set(key, {
          name: it.name ?? prev.name,
          lat: typeof it.lat === 'number' ? it.lat : prev.lat,
          lon: typeof it.lon === 'number' ? it.lon : prev.lon,
          area_km2: typeof it.area_km2 === 'number' ? it.area_km2 : prev.area_km2,
        });
      }
    };

    let loadedAny = false;
    if (fs.existsSync(FULL_SVAR_IDS)) {
      const rawFull = await fsp.readFile(FULL_SVAR_IDS, 'utf8');
      const arrFull = JSON.parse(rawFull) as Array<{ sjoid?: string; name?: string; lat?: number; lon?: number; area_km2?: number }>;
      loadIntoMap(arrFull);
      loadedAny = true;
      console.log(`Loaded FULL WFS index for ${wfsIndex.size} sjoid entries from ${FULL_SVAR_IDS}.`);
    }
    if (fs.existsSync(SVAR_IDS)) {
      const raw = await fsp.readFile(SVAR_IDS, 'utf8');
      const arr = JSON.parse(raw) as Array<{ sjoid?: string; name?: string; lat?: number; lon?: number; area_km2?: number }>;  
      loadIntoMap(arr);
      loadedAny = true;
      console.log(`Merged base WFS index; total ${wfsIndex.size} sjoid entries.`);
    }
    if (!loadedAny) {
      console.warn(`No enrichment files found: ${FULL_SVAR_IDS} nor ${SVAR_IDS} (continuing without enrichment)`);
    }
  } catch (err) {
    console.warn('Failed to read enrichment files, continuing without them:', (err as Error).message);
  }

  const waterDirs = await listDirs(ROOT);
  for (const waterDir of waterDirs) {
    const entries = await fsp.readdir(waterDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const svarDirName = e.name; // e.g., 647666-129906-kartor
      const m = /^([0-9]{6,}-[0-9]{5,})-kartor$/i.exec(svarDirName);
      if (!m) continue;
      const svarId = m[1];
      const dir = path.join(waterDir, e.name);
      const files = await listFiles(dir);
      let lakeName = '';
      let displayTitle = '';
      if (files.length > 0) {
        const parsed = parseTitleFromFilename(files[0].name);
        lakeName = parsed.lakeName;
        displayTitle = parsed.displayTitle;
      }
      const sjoid = svarId; // alias for clarity
      const enrich = wfsIndex.get(sjoid) ?? {};
      const has = {
        tif: files.some(f => /\.tif$/i.test(f.name)),
        png: files.some(f => /\.png$/i.test(f.name)),
        jpg: files.some(f => /\.jpe?g$/i.test(f.name)),
        pdf: files.some(f => /\.pdf$/i.test(f.name)),
      };
      result.push({
        sjoid,
        svarId,
        waterId: path.basename(waterDir),
        lakeName,
        displayTitle,
        name: enrich.name,
        lat: enrich.lat,
        lon: enrich.lon,
        area_km2: enrich.area_km2,
        dir: path.relative('public', dir).split(path.sep).join('/'),
        files,
        has,
      });
    }
  }

  // Also support svar directories directly under ROOT (no waterId folder)
  const rootEntries = await fsp.readdir(ROOT, { withFileTypes: true });
  for (const e of rootEntries) {
    if (!e.isDirectory()) continue;
    const svarDirName = e.name; // e.g., 647666-129906-kartor
    const m = /^([0-9]{6,}-[0-9]{5,})-kartor$/i.exec(svarDirName);
    if (!m) continue;
    const svarId = m[1];
    const dir = path.join(ROOT, e.name);
    const files = await listFiles(dir);
    let lakeName = '';
    let displayTitle = '';
    if (files.length > 0) {
      const parsed = parseTitleFromFilename(files[0].name);
      lakeName = parsed.lakeName;
      displayTitle = parsed.displayTitle;
    }
    const sjoid = svarId;
    const enrich = wfsIndex.get(sjoid) ?? {};
    const has = {
      tif: files.some(f => /\.tif$/i.test(f.name)),
      png: files.some(f => /\.png$/i.test(f.name)),
      jpg: files.some(f => /\.jpe?g$/i.test(f.name)),
      pdf: files.some(f => /\.pdf$/i.test(f.name)),
    };
    result.push({
      sjoid,
      svarId,
      waterId: svarId, // fallback grouping by sjoid
      lakeName,
      displayTitle,
      name: enrich.name,
      lat: enrich.lat,
      lon: enrich.lon,
      area_km2: enrich.area_km2,
      dir: path.relative('public', dir).split(path.sep).join('/'),
      files,
      has,
    });
  }

  // Derived maps to make lookups trivial
  const bySjoid: Record<string, number> = {};
  const byName: Record<string, string[]> = {};
  for (let i = 0; i < result.length; i++) {
    const it = result[i];
    bySjoid[it.sjoid] = i;
    const pushKey = (s?: string) => {
      if (!s) return;
      const key = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      (byName[key] ??= []).push(it.sjoid);
    };
    // Index official name if present, and also derived titles to enable name searches without enrichment
    pushKey(it.name);
    pushKey(it.lakeName);
    pushKey(it.displayTitle);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    counts: { items: result.length },
    items: result,
    bySjoid,
    byName,
  };

  await fsp.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fsp.writeFile(OUT_JSON, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${result.length} entries to ${OUT_JSON}`);

  // Also write compressed version for production serving
  const src = fs.createReadStream(OUT_JSON);
  const gz = createGzip({ level: 6 });
  const dst = fs.createWriteStream(OUT_GZ);
  await pipeline(src, gz, dst);
  console.log(`Compressed index -> ${OUT_GZ}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});



