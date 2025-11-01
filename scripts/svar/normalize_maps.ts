/*
  Normalize SVAR map assets for reliable, fast web display.

  - For JPG/PNG: generate preview JPEG/PNG (max 2048px) under web/preview-<basename>.jpg
  - For TIFF/GeoTIFF: if gdal_translate is available, rasterize to PNG preview
  - For PDF: if pdftoppm (Poppler) is available, rasterize first page to PNG preview

  NOTE: This script only prepares previews. It does NOT run automatically.
  Run manually when you want to normalize newly downloaded maps.
*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.join(process.cwd(), 'public', 'data', 'svar', 'zips');
const OUT_ROOT = path.join(process.cwd(), 'public', 'data', 'svar', 'dzi');
const LOG_DIR = path.join(process.cwd(), 'temp');
const LOG_FILE = path.join(LOG_DIR, 'normalize_maps.log');

function out(message: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}`;
  console.log(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

function isFile(p: string): boolean { try { return fs.statSync(p).isFile(); } catch { return false; } }
function isDir(p: string): boolean { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

function detectCmd(cmd: string): boolean {
  const isWin = process.platform === 'win32';
  const which = isWin ? spawnSync('where', [cmd], { stdio: 'ignore' }) : spawnSync('which', [cmd], { stdio: 'ignore' });
  return which.status === 0;
}

const HAS_GDAL = detectCmd('gdal_translate');
const HAS_POPPLER = detectCmd('pdftoppm');

function extLower(name: string): string { return path.extname(name).toLowerCase(); }

async function ensureDir(p: string) { await fsp.mkdir(p, { recursive: true }); }

async function generatePreviewForImage(absSrc: string, outDir: string, base: string) {
  const outJpg = path.join(outDir, `preview-${base}.jpg`);
  const outPng = path.join(outDir, `preview-${base}.png`);
  if (isFile(outJpg) || isFile(outPng)) { out(`skip preview (exists) ${path.relative(process.cwd(), outJpg)}`); return; }
  await ensureDir(outDir);
  // Use JPEG for photographic content by default; fallback to PNG if needed later
  await sharp(absSrc).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(outJpg);
  out(`✓ preview ${path.relative(process.cwd(), outJpg)}`);
}

function run(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status === 0;
}

async function generatePreviewForTiff(absSrc: string, outDir: string, base: string) {
  const outPng = path.join(outDir, `preview-${base}.png`);
  if (isFile(outPng)) { out(`skip preview (exists) ${path.relative(process.cwd(), outPng)}`); return; }
  await ensureDir(outDir);
  if (!HAS_GDAL) {
    // Fallback: use sharp to rasterize a downscaled preview
    try {
      await sharp(absSrc, { limitInputPixels: 10000000000 })
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .png()
        .toFile(outPng);
      out(`✓ preview ${path.relative(process.cwd(), outPng)} (sharp fallback)`);
    } catch (err) {
      out(`WARN TIFF preview fallback failed for ${absSrc}: ${(err as Error).message}`);
    }
    return;
  }
  // Prefer gdal_translate to rasterize to PNG, scale down to max 2048px (preserve aspect)
  const args = ['-of', 'PNG', '-outsize', '2048', '0', absSrc, outPng];
  if (!run('gdal_translate', args)) {
    out(`WARN gdal_translate failed for ${absSrc}`);
  } else {
    out(`✓ preview ${path.relative(process.cwd(), outPng)}`);
  }
}

async function generatePreviewForPdf(absSrc: string, outDir: string, base: string) {
  const outPng = path.join(outDir, `preview-${base}.png`);
  if (isFile(outPng)) { out(`skip preview (exists) ${path.relative(process.cwd(), outPng)}`); return; }
  await ensureDir(outDir);
  if (!HAS_POPPLER) { out(`WARN pdftoppm not found, skip PDF -> PNG preview: ${absSrc}`); return; }
  // Rasterize first page to PNG, scale longest side to 2048
  const tmpOut = path.join(outDir, `preview-${base}`);
  const args = ['-png', '-singlefile', '-scale-to', '2048', absSrc, tmpOut];
  if (!run('pdftoppm', args)) {
    out(`WARN pdftoppm failed for ${absSrc}`);
  } else {
    out(`✓ preview ${path.relative(process.cwd(), outPng)}`);
  }
}

async function generateDeepZoom(absSrc: string, outDir: string, base: string, opts?: { forceRgb?: boolean }) {
  const dziPath = path.join(outDir, `tiles-${base}.dzi`);
  const tilesDir = path.join(outDir, `tiles-${base}_files`);
  if (isFile(dziPath) && isDir(tilesDir)) { out(`skip deepzoom (exists) ${path.relative(process.cwd(), dziPath)}`); return; }
  await ensureDir(outDir);
  try {
    let image = sharp(absSrc, { limitInputPixels: 10000000000 });
    // Detect grayscale and only force RGB when source is not grayscale
    try {
      const meta = await image.metadata();
      const space = meta.space as unknown as string | undefined;
      const channels = (typeof meta.channels === 'number') ? meta.channels : undefined;
      const isGray = (space === 'bw' || space === 'b-w' || Number(channels) === 1);
      if (opts?.forceRgb && !isGray) {
        image = image.toColourspace('srgb');
      }
    } catch {}
    await image
      .jpeg({ quality: 82 })
      .tile({ size: 512, overlap: 1, container: 'fs', layout: 'dz', basename: `tiles-${base}` })
      .toFile(dziPath);
    if (!isDir(tilesDir)) {
      out(`WARN deepzoom wrote DZI but tiles directory missing: ${path.relative(process.cwd(), tilesDir)}`);
    } else {
      out(`✓ deepzoom ${path.relative(process.cwd(), dziPath)} (+ tiles)`);
    }
  } catch (err) {
    out(`WARN DeepZoom tiling failed for ${absSrc}: ${(err as Error).message}`);
  }
}

type WorkItem = { kartorDir: string; name: string; absSrc: string; base: string; ext: string };

function isProcessableExt(ext: string): boolean {
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.tif' || ext === '.tiff' || ext === '.pdf';
}

const ONLY: string | undefined = (() => {
  // Prefer --onlyDir, fallback to --only, then env SVAR_ONLY
  let val: string | undefined;
  let idx = process.argv.indexOf('--onlyDir');
  if (idx !== -1 && process.argv[idx + 1]) val = process.argv[idx + 1];
  if (!val) {
    idx = process.argv.indexOf('--only');
    if (idx !== -1 && process.argv[idx + 1]) val = process.argv[idx + 1];
  }
  return (val || process.env.SVAR_ONLY || undefined) as string | undefined;
})();

async function collectWorkItems(): Promise<WorkItem[]> {
  const items: WorkItem[] = [];
  const rootEntries = await fsp.readdir(ROOT, { withFileTypes: true });

  async function addFromKartorDir(kartorDir: string) {
    if (ONLY && !kartorDir.toLowerCase().includes(ONLY.toLowerCase())) return;
    const entries = await fsp.readdir(kartorDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const name = e.name;
      const ext = extLower(name);
      if (!isProcessableExt(ext)) continue;
      const absSrc = path.join(kartorDir, name);
      const base = name.replace(/\.[^.]+$/, '');
      items.push({ kartorDir, name, absSrc, base, ext });
    }
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(ROOT, entry.name);
    if (/-kartor$/i.test(entry.name)) {
      // Top-level <...-kartor> directory directly under zips
      await addFromKartorDir(entryPath);
      continue;
    }
    // Backward-compatible: nested layout <water>/<...-kartor>/
    const sub = await fsp.readdir(entryPath, { withFileTypes: true });
    for (const d of sub) {
      if (!d.isDirectory()) continue;
      if (!/-kartor$/i.test(d.name)) continue;
      const kartorDir = path.join(entryPath, d.name);
      await addFromKartorDir(kartorDir);
    }
  }
  return items;
}

async function processItem(item: WorkItem) {
  const { kartorDir, name, absSrc, base, ext } = item;
  const relativeDir = path.relative(ROOT, kartorDir);
  const outDir = path.join(OUT_ROOT, relativeDir);
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    await generatePreviewForImage(absSrc, outDir, base);
    await generateDeepZoom(absSrc, outDir, base);
  } else if (ext === '.tif' || ext === '.tiff') {
    await generatePreviewForTiff(absSrc, outDir, base);
    try {
      await generateDeepZoom(absSrc, outDir, base, { forceRgb: true });
    } catch {
      const tmpPng = path.join(outDir, `tmp-${base}.png`);
      if (HAS_GDAL) {
        const ok = run('gdal_translate', ['-of', 'PNG', absSrc, tmpPng]);
        if (ok && isFile(tmpPng)) {
          try {
            await generateDeepZoom(tmpPng, outDir, base, { forceRgb: true });
          } finally {
            try { await fsp.unlink(tmpPng); } catch {}
          }
        }
      }
    }
  } else if (ext === '.pdf') {
    await generatePreviewForPdf(absSrc, outDir, base);
    if (HAS_POPPLER) {
      const png = path.join(outDir, `preview-${base}.png`);
      if (isFile(png)) {
        await generateDeepZoom(png, outDir, base, { forceRgb: true });
      }
    }
  }
}

async function main() {
  if (!isDir(ROOT)) {
    out(`ERROR Missing directory: ${ROOT}`);
    process.exitCode = 2;
    return;
  }

  // Pre-scan to compute total and enable ETA
  out('Scanning for files to normalize...');
  const items = await collectWorkItems();
  out(`Found ${items.length} files to normalize under ${path.relative(process.cwd(), ROOT)}`);
  const start = Date.now();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rel = path.relative(process.cwd(), item.absSrc);
    const pct = ((i + 1) / items.length * 100).toFixed(1);
    out(`[${i + 1}/${items.length}] (${pct}%) ${rel}`);
    const t0 = Date.now();
    try {
      await processItem(item);
    } catch (err) {
      out(`WARN processing failed for ${rel}: ${(err as Error).message}`);
    }
    const dt = Date.now() - t0;
    const elapsed = Date.now() - start;
    const avg = elapsed / (i + 1);
    const remaining = items.length - (i + 1);
    const etaMs = Math.round(remaining * avg);
    const etaMin = Math.floor(etaMs / 60000);
    const etaSec = Math.floor((etaMs % 60000) / 1000);
    out(`done ${rel} (${dt} ms) • ETA ~ ${etaMin}m ${etaSec}s`);
  }
  out('All done');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


