import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function arg(name: string): string | undefined {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const SEARCH_ROOT = path.join(PUBLIC_ROOT, 'data', 'svar', 'zips');

function contentTypeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.dzi' || ext === '.xml') return 'application/xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function slugify(seg: string): string {
  return seg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Å/g, 'A').replace(/Ä/g, 'A').replace(/Ö/g, 'O')
    .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
    .replace(/Æ/g, 'AE').replace(/æ/g, 'ae').replace(/Ø/g, 'O').replace(/ø/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function storageKey(rel: string): string {
  return rel.replace(/^\/+/, '').split('/').map(slugify).join('/');
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function main() {
  const url = arg('url') || process.env.SUPABASE_URL;
  const key = arg('key') || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = arg('bucket') || 'Charts';
  if (!url || !key) throw new Error('Missing --url or --key');
  if (!fs.existsSync(SEARCH_ROOT)) { console.log('No zips folder:', SEARCH_ROOT); return; }

  const supabase = createClient(url, key);

  // Upload all .dzi files under web/
  const dziList: string[] = [];
  const fileList: string[] = [];
  for await (const p of walk(SEARCH_ROOT)) {
    if (/\/web\/tiles-.*\.dzi$/i.test(p.replace(/\\/g, '/'))) dziList.push(p);
    if (/\/web\/tiles-.*_files\//i.test(path.dirname(p).replace(/\\/g, '/'))) fileList.push(p);
  }

  console.log(`Found ${dziList.length} dzi files, ${fileList.length} tile files`);

  let i = 0;
  for (const abs of dziList) {
    const relFromPublic = path.relative(PUBLIC_ROOT, abs).split(path.sep).join('/');
    const keyRel = storageKey(relFromPublic.replace(/^data\//, ''));
    process.stdout.write(`[DZI ${++i}/${dziList.length}] ${keyRel} ... `);
    try {
      const data = await fsp.readFile(abs);
      const { error } = await supabase.storage.from(bucket).upload(keyRel, data, { contentType: contentTypeFor(abs), upsert: true });
      if (error) throw error;
      process.stdout.write('ok\n');
    } catch (e:any) {
      console.error('error:', e.message || e);
    }
  }

  // Upload tile jpeg/png files
  i = 0;
  const total = fileList.length;
  for (const abs of fileList) {
    const relFromPublic = path.relative(PUBLIC_ROOT, abs).split(path.sep).join('/');
    const keyRel = storageKey(relFromPublic.replace(/^data\//, ''));
    if ((i % 500) === 0) console.log(`[tiles] ${i}/${total} ...`);
    try {
      const data = await fsp.readFile(abs);
      const { error } = await supabase.storage.from(bucket).upload(keyRel, data, { contentType: contentTypeFor(abs), upsert: true });
      if (error) throw error;
    } catch (e:any) {
      console.error('upload error (tile):', e.message || e);
    }
    i++;
  }
  console.log('Done');
}

main().catch((e) => { console.error(e); process.exit(1); });



