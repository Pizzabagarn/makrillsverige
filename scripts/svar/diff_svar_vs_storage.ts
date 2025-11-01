import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createClient } from '@supabase/supabase-js';

type IndexItem = { name?: string; lakeName?: string; files: Array<{ name: string; relPath: string }>; };
type SvarIndex = { items: IndexItem[]; bySjoid: Record<string, number> };

function getArg(name: string): string | undefined {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}

async function loadIndex(): Promise<SvarIndex> {
  const gzPath = path.join(process.cwd(), 'public', 'data', 'svar', 'index.json.gz');
  if (fs.existsSync(gzPath)) {
    const src = fs.createReadStream(gzPath);
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    gunzip.on('data', (c) => chunks.push(c));
    await pipeline(src, gunzip as any, async function* () {})
      .catch(() => {});
    if (chunks.length) {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  }
  const jsonPath = path.join(process.cwd(), 'public', 'data', 'svar', 'index.json');
  const raw = await fsp.readFile(jsonPath, 'utf8');
  return JSON.parse(raw);
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
  const noData = relPath.replace(/^\/?data\//, '');
  return noData
    .split('/')
    .map((seg) => seg ? slugifySegment(seg) : seg)
    .join('/');
}

async function existsDzi(supabase: ReturnType<typeof createClient>, bucket: string, storageKey: string): Promise<boolean> {
  // Split into directory and filename for list+search
  const dir = path.posix.dirname(storageKey);
  const filename = path.posix.basename(storageKey);
  const { data, error } = await supabase.storage.from(bucket).list(dir, { search: filename, limit: 1 });
  if (error) return false;
  return Array.isArray(data) && data.some((o: any) => o.name === filename);
}

async function main() {
  const SUPABASE_URL = getArg('url') || process.env.SUPABASE_URL!;
  const SUPABASE_KEY = getArg('key') || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const BUCKET = getArg('bucket') || process.env.SVAR_TILES_BUCKET || 'Charts';
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing --url or --key');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const index = await loadIndex();

  type Row = { sjoid: string; lake: string; file: string; expectedKey: string; exists: boolean };
  const rows: Row[] = [];

  const entries = Object.entries(index.bySjoid);
  let done = 0;
  const start = Date.now();

  const concurrency = 8;
  let i = 0;
  async function worker() {
    while (i < entries.length) {
      const my = i++;
      const [sjoid, idx] = entries[my];
      const item = index.items[idx];
      for (const f of item.files) {
        const baseNoExt = f.name.replace(/\.[^.]+$/, '');
        const rel = `${path.posix.dirname(f.relPath)}/web/tiles-${baseNoExt}.dzi`;
        const key = storageSafePath(rel);
        const ok = await existsDzi(supabase, BUCKET, key);
        rows.push({ sjoid, lake: item.name || item.lakeName || '', file: f.name, expectedKey: key, exists: ok });
      }
      done++;
      const dt = Date.now() - start;
      const eta = ((entries.length - done) * (dt / done)) / 1000;
      process.stdout.write(`\rProcessed ${done}/${entries.length} lakes • ETA ~ ${Math.max(0, Math.round(eta))}s`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  process.stdout.write('\n');

  const uploaded = rows.filter(r => r.exists);
  const missing = rows.filter(r => !r.exists);
  await fsp.mkdir('temp', { recursive: true });
  await fsp.writeFile('temp/svar_upload_status.json', JSON.stringify({ uploadedCount: uploaded.length, missingCount: missing.length, uploaded, missing }, null, 2), 'utf8');
  await fsp.writeFile('temp/svar_missing.csv', ['sjoid,lake,file,expectedKey'].concat(missing.map(r => `${r.sjoid},"${r.lake.replaceAll('"','""')}",${r.file},${r.expectedKey}`)).join('\n'), 'utf8');
  console.log(`Wrote temp/svar_upload_status.json and temp/svar_missing.csv`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});



