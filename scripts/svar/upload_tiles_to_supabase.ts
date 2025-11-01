/*
  Upload DZI tiles and .dzi manifests to Supabase Storage, preserving paths.

  Requirements (do not edit .env.local):
  - Set env vars in your shell before running:
      SUPABASE_URL
      SUPABASE_SERVICE_ROLE_KEY
      SVAR_TILES_BUCKET (default: 'svar')

  Optional at runtime (for the app to point to remote tiles without moving previews):
  - NEXT_PUBLIC_SVAR_TILES_BASE_URL should be the public base URL to the bucket prefix, e.g.:
    https://<PROJECT>.supabase.co/storage/v1/object/public/svar

  Run:
    tsx scripts/svar/upload_tiles_to_supabase.ts
*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const SEARCH_ROOT = path.join(PUBLIC_ROOT, 'data', 'svar');
const MOVED_TILES_ROOT = (() => {
  const arg = process.argv.find(a => a.startsWith('--movedRoot='));
  return (arg ? arg.split('=')[1] : process.env.SVARTILES_DEST) || 'C:\\SvarTiles';
})();

function getArg(name: string): string | undefined {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}

function getParam(name: string, envName?: string): string {
  const cli = getArg(name);
  if (cli) return cli;
  const env = envName ? process.env[envName] : undefined;
  if (env) return env;
  throw new Error(`Missing parameter --${name}${envName ? ' or env ' + envName : ''}`);
}

function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.dzi' || ext === '.xml') return 'application/xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function slugifySegment(seg: string): string {
  const mapped = seg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Å/g, 'A').replace(/Ä/g, 'A').replace(/Ö/g, 'O')
    .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
    .replace(/Æ/g, 'AE').replace(/æ/g, 'ae').replace(/Ø/g, 'O').replace(/ø/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return mapped;
}

function storageSafePath(relPath: string): string {
  const noLeading = relPath.replace(/^\/+/, '');
  return noLeading
    .split('/')
    .map((seg) => seg ? slugifySegment(seg) : seg)
    .join('/');
}

async function listDziFiles(): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && /tiles-.*\.dzi$/i.test(e.name)) out.push(p);
    }
  };
  await walk(SEARCH_ROOT);
  return out;
}

async function listTileFoldersUnder(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    const entries = await fsp.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/.*_files$/i.test(e.name)) out.push(p);
        await walk(p);
      }
    }
  };
  await walk(dir);
  return out;
}

function isAsciiString(value: string): boolean {
  // Accept only ASCII characters (0x00-0x7F) in storage keys to avoid provider-specific InvalidKey errors
  return /^[\x00-\x7F]+$/.test(value);
}

async function uploadFile(supabase: ReturnType<typeof createClient>, bucket: string, absPath: string, relPublicPath: string) {
  const data = await fsp.readFile(absPath);
  const ct = contentTypeFor(absPath);
  // Slugify to ASCII-only storage keys for maximum compatibility across providers
  const key = storageSafePath(relPublicPath);
  const { error } = await (supabase.storage.from(bucket).upload(key, data, {
    contentType: ct,
    upsert: true,
  }));
  if (error) throw error;
}

function parseVipsPropsXml(xml: string): { width?: number; height?: number } {
  const widthMatch = xml.match(/<name>width<\/name>\s*<value[^>]*>(\d+)<\/value>/i);
  const heightMatch = xml.match(/<name>height<\/name>\s*<value[^>]*>(\d+)<\/value>/i);
  return {
    width: widthMatch ? Number(widthMatch[1]) : undefined,
    height: heightMatch ? Number(heightMatch[1]) : undefined,
  };
}

async function detectTileFormat(folder: string): Promise<'jpeg' | 'png'> {
  // Look for any file with .jpg/.jpeg/.png inside folder
  const stack: string[] = [folder];
  while (stack.length) {
    const d = stack.pop()!;
    const entries = await fsp.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        const ext = path.extname(p).toLowerCase();
        if (ext === '.png') return 'png';
        if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
      }
    }
  }
  return 'jpeg';
}

function buildDziXml(params: { width?: number; height?: number; tileSize?: number; overlap?: number; format: 'jpeg' | 'png' }): string {
  // Ensure DZI manifests match how tiles were generated (sharp.tile): 512px tiles, 1px overlap
  const { width, height, tileSize = 512, overlap = 1, format } = params;
  const w = width ?? 0;
  const h = height ?? 0;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="${format}" Overlap="${overlap}" TileSize="${tileSize}">\n` +
    `  <Size Width="${w}" Height="${h}"/>\n` +
    `</Image>\n`;
  return xml;
}

async function uploadDziContent(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  dziKeyRel: string,
  xmlContent: string,
) {
  const key = storageSafePath(dziKeyRel);
  const { error } = await supabase.storage.from(bucket).upload(key, Buffer.from(xmlContent, 'utf8'), {
    contentType: 'application/xml',
    upsert: true,
  });
  if (error) throw error;
}

async function main() {
  const SUPABASE_URL = getParam('url', 'SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = getParam('key', 'SUPABASE_SERVICE_ROLE_KEY');
  const BUCKET = getArg('bucket') || process.env.SVAR_TILES_BUCKET || 'svar';

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Ensure bucket exists and is public (best-effort)
  try {
    const { error: be } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '200MB' });
    if (!be) console.log(`Created bucket '${BUCKET}' as public`);
  } catch (e) {
    // Ignore errors like "Bucket already exists"; continue
    console.warn('Bucket create (best-effort):', (e as Error).message);
  }

  const dziFiles = await listDziFiles();
  console.log(`Found ${dziFiles.length} .dzi manifests`);
  const start = Date.now();
  for (let i = 0; i < dziFiles.length; i++) {
    const dziAbs = dziFiles[i];
    let relFromPublic = path.relative(PUBLIC_ROOT, dziAbs).split(path.sep).join('/');
    // Some storage backends may reject keys starting with 'data/' – strip it
    relFromPublic = relFromPublic.replace(/^data\//, '');
    const asciiOnly = getArg('asciiOnly') === 'true';
    if (asciiOnly && !isAsciiString(relFromPublic)) {
      process.stdout.write(`[${i + 1}/${dziFiles.length}] ${relFromPublic} ... skipped (non-ASCII key)\n`);
      continue;
    }
    process.stdout.write(`[${i + 1}/${dziFiles.length}] ${relFromPublic} ... `);
    try {
      await uploadFile(supabase, BUCKET, dziAbs, relFromPublic);
    } catch (e) {
      console.error(`upload error (manifest):`, (e as Error).message || e);
      continue; // continue with next file
    }

    // Upload tiles folder sibling
    const base = path.basename(dziAbs, '.dzi');
    let tilesDir = path.join(path.dirname(dziAbs), `${base}_files`);
    // Compute storage base key relative to SEARCH_ROOT (so we can always prefix with `svar/`)
    let storageBaseRel = path.relative(SEARCH_ROOT, tilesDir).split(path.sep).join('/'); // e.g. zips/.../web/tiles-..._files
    // If tiles were moved out of repo, look for them under MOVED_TILES_ROOT preserving relative from SEARCH_ROOT
    if (!(fs.existsSync(tilesDir) && fs.statSync(tilesDir).isDirectory())) {
      const relFromSvar = storageBaseRel; // already relative to SEARCH_ROOT
      const alt = path.join(MOVED_TILES_ROOT, relFromSvar);
      if (fs.existsSync(alt) && fs.statSync(alt).isDirectory()) {
        tilesDir = alt;
        storageBaseRel = relFromSvar; // unchanged; keys should still be under svar/<relFromSvar>
      }
    }
    if (fs.existsSync(tilesDir) && fs.statSync(tilesDir).isDirectory()) {
      const files: string[] = [];
      const walk = async (dir: string) => {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) await walk(p);
          else if (e.isFile()) files.push(p);
        }
      };
      await walk(tilesDir);
      for (const f of files) {
        // Build key as 'svar/<storageBaseRel>/<child>' where child is relative path inside tiles folder
        const childRel = path.relative(tilesDir, f).split(path.sep).join('/');
        let rel = `svar/${storageBaseRel}`;
        if (rel.endsWith('/')) rel = rel.slice(0, -1);
        rel = `${rel}/${childRel}`;
        if (asciiOnly && !isAsciiString(rel)) {
          console.warn(`skip tile (non-ASCII key): ${rel}`);
          continue;
        }
        try {
          await uploadFile(supabase, BUCKET, f, rel);
        } catch (e) {
          console.error(`upload error (tile):`, (e as Error).message || e);
          // continue uploading remaining tiles
        }
      }
    }
    const dt = Date.now() - start;
    const avg = dt / (i + 1);
    const remainingMs = (dziFiles.length - (i + 1)) * avg;
    const etaMin = Math.floor(remainingMs / 60000);
    const etaSec = Math.floor((remainingMs % 60000) / 1000);
    process.stdout.write(`done • ETA ~ ${etaMin}m ${etaSec}s\n`);
  }
  console.log('All uploads completed.');
}

async function uploadDziFromMovedRoot() {
  const SUPABASE_URL = getParam('url', 'SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = getParam('key', 'SUPABASE_SERVICE_ROLE_KEY');
  const BUCKET = getArg('bucket') || process.env.SVAR_TILES_BUCKET || 'svar';
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const asciiOnly = getArg('asciiOnly') === 'true';

  if (!fs.existsSync(MOVED_TILES_ROOT)) { return; }
  const dziList: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && /tiles-.*\.dzi$/i.test(e.name)) dziList.push(p);
    }
  };
  await walk(MOVED_TILES_ROOT);
  if (dziList.length === 0) return;
  console.log(`Found ${dziList.length} .dzi manifests under moved root`);
  let i = 0;
  for (const abs of dziList) {
    const baseRel = path.relative(MOVED_TILES_ROOT, abs).split(path.sep).join('/');
    let key = `svar/${baseRel}`;
    key = storageSafePath(key);
    if (asciiOnly && !isAsciiString(key)) { console.warn(`skip manifest (non-ASCII key): ${key}`); continue; }
    process.stdout.write(`[moved DZI ${++i}/${dziList.length}] ${key} ... `);
    try {
      await uploadFile(supabase, BUCKET, abs, key);
      process.stdout.write('ok\n');
    } catch (e) {
      console.error('upload error (moved manifest):', (e as Error).message || e);
    }
  }
}

async function uploadLooseTilesFromMovedRoot() {
  const SUPABASE_URL = getParam('url', 'SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = getParam('key', 'SUPABASE_SERVICE_ROLE_KEY');
  const BUCKET = getArg('bucket') || process.env.SVAR_TILES_BUCKET || 'svar';
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const asciiOnly = getArg('asciiOnly') === 'true';
  console.log(`Moved tiles root: ${MOVED_TILES_ROOT}`);
  if (!fs.existsSync(MOVED_TILES_ROOT)) { console.log('Moved tiles root does not exist, skipping.'); return; }
  const tilesFolders: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.endsWith('_files')) tilesFolders.push(p);
        await walk(p);
      }
    }
  };
  await walk(MOVED_TILES_ROOT);
  if (tilesFolders.length === 0) return;
  console.log(`Found ${tilesFolders.length} moved tiles folders`);
  for (const folder of tilesFolders) {
    // Generate and upload DZI manifest beside tiles folder
    try {
      const baseRel = path.relative(MOVED_TILES_ROOT, folder).split(path.sep).join('/'); // e.g. zips/.../web/tiles-..._files
      const dirRel = path.posix.dirname(baseRel); // e.g. zips/.../web
      const baseName = path.basename(folder).replace(/_files$/i, ''); // tiles-...
      const dziKeyRel = `svar/${dirRel}/${baseName}.dzi`;
      const propsPath = path.join(folder, 'vips-properties.xml');
      let width: number | undefined; let height: number | undefined;
      if (fs.existsSync(propsPath)) {
        const xml = await fsp.readFile(propsPath, 'utf8');
        const parsed = parseVipsPropsXml(xml);
        width = parsed.width; height = parsed.height;
      }
      const format = await detectTileFormat(folder);
      const dziXml = buildDziXml({ width, height, tileSize: 512, overlap: 1, format });
      await uploadDziContent(supabase, BUCKET, dziKeyRel, dziXml);
    } catch (e) {
      console.error('upload error (moved dzi synth):', (e as Error).message || e);
    }
    const files: string[] = [];
    const collect = async (d: string) => {
      const es = await fsp.readdir(d, { withFileTypes: true });
      for (const e of es) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await collect(p);
        else files.push(p);
      }
    };
    await collect(folder);
    const baseRel = path.relative(MOVED_TILES_ROOT, folder).split(path.sep).join('/'); // e.g. zips/.../tiles-..._files
    for (const f of files) {
      const childRel = path.relative(folder, f).split(path.sep).join('/');
      const key = storageSafePath(`svar/${baseRel}/${childRel}`);
      if (asciiOnly && !isAsciiString(key)) { console.warn(`skip (non-ASCII): ${key}`); continue; }
      try { await uploadFile(supabase, BUCKET, f, key); }
      catch (e) { console.error('upload error (loose tile):', (e as Error).message || e); }
    }
  }
}

async function uploadTileFoldersUnderSearchRoot() {
  const SUPABASE_URL = getParam('url', 'SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = getParam('key', 'SUPABASE_SERVICE_ROLE_KEY');
  const BUCKET = getArg('bucket') || process.env.SVAR_TILES_BUCKET || 'svar';
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const asciiOnly = getArg('asciiOnly') === 'true';

  const folders = await listTileFoldersUnder(SEARCH_ROOT);
  if (folders.length === 0) return;
  console.log(`Found ${folders.length} tile folders under public/data/svar`);
  for (const folder of folders) {
    // Generate and upload DZI manifest beside tiles folder
    try {
      const baseRel = path.relative(SEARCH_ROOT, folder).split(path.sep).join('/'); // e.g. zips/.../web/tiles-..._files
      const dirRel = path.posix.dirname(baseRel); // e.g. zips/.../web
      const baseName = path.basename(folder).replace(/_files$/i, '');
      const dziKeyRel = `svar/${dirRel}/${baseName}.dzi`;
      const propsPath = path.join(folder, 'vips-properties.xml');
      let width: number | undefined; let height: number | undefined;
      if (fs.existsSync(propsPath)) {
        const xml = await fsp.readFile(propsPath, 'utf8');
        const parsed = parseVipsPropsXml(xml);
        width = parsed.width; height = parsed.height;
      }
      const format = await detectTileFormat(folder);
      const dziXml = buildDziXml({ width, height, tileSize: 512, overlap: 1, format });
      await uploadDziContent(supabase, BUCKET, dziKeyRel, dziXml);
    } catch (e) {
      console.error('upload error (public dzi synth):', (e as Error).message || e);
    }
    const files: string[] = [];
    const collect = async (d: string) => {
      const es = await fsp.readdir(d, { withFileTypes: true });
      for (const e of es) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await collect(p);
        else files.push(p);
      }
    };
    await collect(folder);
    const baseRel = path.relative(SEARCH_ROOT, folder).split(path.sep).join('/');
    for (const f of files) {
      const childRel = path.relative(folder, f).split(path.sep).join('/');
      const key = storageSafePath(`svar/${baseRel}/${childRel}`);
      if (asciiOnly && !isAsciiString(key)) { console.warn(`skip (non-ASCII): ${key}`); continue; }
      try { await uploadFile(supabase, BUCKET, f, key); }
      catch (e) { console.error('upload error (public tile):', (e as Error).message || e); }
    }
  }
}

main()
  .then(() => uploadDziFromMovedRoot())
  .then(() => uploadLooseTilesFromMovedRoot())
  .then(() => uploadTileFoldersUnderSearchRoot())
  .catch((e) => {
  console.error(e);
  process.exitCode = 1;
});


