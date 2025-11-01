/*
  Upload ONLY DZI manifests to Supabase Storage (no tiles), preserving paths.

  Usage:
    set SUPABASE_URL=... && set SUPABASE_SERVICE_ROLE_KEY=... && tsx scripts/svar/upload_dzi_only.ts --bucket=Charts

  Notes:
  - Keys are slugified to ASCII to match existing uploads
  - Looks for files under public/data/svar/**/web/tiles-*.dzi
*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function getArg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const SEARCH_ROOT = path.join(PUBLIC_ROOT, 'data', 'svar');

function slugifySegment(seg: string): string {
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

function storageSafePath(relPath: string): string {
  const noLeading = relPath.replace(/^\/+/, '');
  return noLeading
    .split('/')
    .map((seg) => (seg ? slugifySegment(seg) : seg))
    .join('/');
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
  const SUPABASE_URL = getArg('url') || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = getArg('key') || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BUCKET = getArg('bucket') || 'Charts';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const uploads: Array<{ abs: string; key: string }> = [];
  for await (const abs of walk(SEARCH_ROOT)) {
    const rel = path.relative(PUBLIC_ROOT, abs).split(path.sep).join('/');
    if (/^data\/svar\/.+\/web\/tiles-.*\.dzi$/i.test(rel)) {
      const key = storageSafePath(rel.replace(/^data\//, ''));
      uploads.push({ abs, key });
    }
  }

  console.log(`Found ${uploads.length} DZI manifests to upload`);
  let ok = 0; let fail = 0; let i = 0;
  for (const u of uploads) {
    i += 1;
    if (i % 200 === 0) console.log(`[${i}/${uploads.length}] ${u.key}`);
    try {
      const buf = await fsp.readFile(u.abs);
      const { error } = await supabase.storage.from(BUCKET).upload(u.key, buf, {
        contentType: 'application/xml',
        upsert: true,
      });
      if (error) throw error;
      ok += 1;
    } catch (e: any) {
      fail += 1;
      if (fail < 50) console.error('upload failed', u.key, e.message || e);
    }
  }
  console.log(`Done. ok=${ok}, failed=${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });




