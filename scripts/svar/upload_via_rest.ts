import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
// Optional keep-alive tuning; works if 'undici' is available at runtime
async function configureKeepAlive(connections: number) {
  try {
    const undici = await import('undici');
    const agent = new undici.Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connections: connections * 2,
    });
    undici.setGlobalDispatcher(agent);
  } catch {
    // undici not installed; skip tuning
  }
}

function getArg(name: string): string | undefined {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}

const SUPABASE_URL = getArg('url') || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = getArg('key') || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = getArg('bucket') || 'Charts';
const CONCURRENCY = Number(getArg('concurrency') || '16');
const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const SEARCH_ROOT = path.resolve(getArg('root') || path.join(PUBLIC_ROOT, 'data', 'svar'));
const FILTER_PREFIX = getArg('prefix'); // e.g. "A" or "A,B,C" (relative to svar/zips/<prefix>)
const RESUME_FILE = getArg('resume') || path.join(process.cwd(), 'temp', 'upload_rest_done.txt');

// Best-effort enable keep-alive tuning
await configureKeepAlive(CONCURRENCY);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing --url or --key');
  process.exit(1);
}
if (!fs.existsSync(SEARCH_ROOT)) {
  console.error('Search root not found:', SEARCH_ROOT);
  process.exit(1);
}

function contentTypeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.dzi' || ext === '.xml') return 'application/xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

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

function startsWithAny(hay: string, prefixes: string[]): boolean {
  for (const p of prefixes) if (hay.startsWith(p)) return true;
  return false;
}

async function listUploads(): Promise<Array<{ abs: string; key: string }>> {
  const uploads: Array<{ abs: string; key: string }> = [];
  const prefixes = FILTER_PREFIX ? FILTER_PREFIX.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  for await (const abs of walk(SEARCH_ROOT)) {
    const up = abs.replace(/\\/g, '/');
    const relFromPublic = path.relative(PUBLIC_ROOT, abs).split(path.sep).join('/');
    // Expect relFromPublic like: data/svar/zips/.../web/tiles-...(.dzi or _files/...)
    if (!/\/svar\//.test(relFromPublic)) continue; // skip anything not under data/svar
    const relNoData = relFromPublic.replace(/^data\//, ''); // keep 'svar/...'
    if (prefixes) {
      // Filter relative to 'svar/zips/<prefix>'
      const afterSvar = relNoData.replace(/^svar\//, ''); // zips/...
      const afterZips = afterSvar.replace(/^zips\//, ''); // <prefix>/...
      const firstSeg = afterZips.split('/')[0];
      if (!startsWithAny(firstSeg, prefixes)) continue;
    }
    if (/\/web\/tiles-.*\.dzi$/i.test(up) || /\/web\/tiles-.*_files\//i.test(up)) {
      const key = storageSafePath(relNoData);
      uploads.push({ abs, key });
    }
  }
  return uploads;
}

async function uploadOne(abs: string, key: string): Promise<{ ok: boolean; status: number; text?: string }> {
  const url = `${SUPABASE_URL!.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(BUCKET)}/${key}`;
  // Use buffered reads to avoid EMFILE (too many open files) on Windows
  const body = await fsp.readFile(abs);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'x-upsert': 'true',
      'Content-Type': contentTypeFor(abs),
    },
    body,
  } as RequestInit);
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function run() {
  const all = await listUploads();
  console.log(`Planned uploads: ${all.length}`);
  // Load resume set
  let resumeSet = new Set<string>();
  if (RESUME_FILE && fs.existsSync(RESUME_FILE)) {
    try {
      const content = await fsp.readFile(RESUME_FILE, 'utf8');
      resumeSet = new Set(content.split(/\r?\n/).filter(Boolean));
      console.log(`Resume: loaded ${resumeSet.size} completed keys`);
    } catch {}
  }
  let i = 0; let okCount = 0; let failCount = 0;
  const queue = all.slice();
  const workers: Promise<void>[] = [];
  for (let c = 0; c < CONCURRENCY; c++) {
    workers.push((async () => {
      while (true) {
        const next = queue.shift();
        if (!next) break;
        if (resumeSet.has(next.key)) { continue; }
        const idx = ++i;
        if (idx % 200 === 0) console.log(`[${idx}/${all.length}] ${next.key}`);
        try {
          const r = await uploadOne(next.abs, next.key);
          if (r.ok) {
            okCount++;
            if (RESUME_FILE) {
              await fsp.mkdir(path.dirname(RESUME_FILE), { recursive: true });
              await fsp.appendFile(RESUME_FILE, next.key + '\n');
            }
          }
          else { failCount++; if (failCount < 50) console.error('upload failed', r.status, next.key, r.text?.slice(0, 200)); }
        } catch (e: any) {
          failCount++; if (failCount < 50) console.error('upload error', next.key, e.message || e);
        }
      }
    })());
  }
  await Promise.all(workers);
  console.log(`Done. ok=${okCount}, failed=${failCount}`);
}

run().catch((e) => { console.error(e); process.exit(1); });


