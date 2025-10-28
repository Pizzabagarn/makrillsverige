/*
  SVAR bulk downloader (consent‑gated)

  Purpose
  - Download ZIP packages of lake maps from SMHI Vattenwebb SVAR per known svarId.
  - Save per waterId directory with a sidecar metadata JSON.
  - Optional extraction (off by default). On Windows, uses PowerShell Expand-Archive when --extract is set.

  Important
  - The robots.txt for the site disallows "/rest" for generic bots. This script WILL call
    /svarwebb/rest/downloadmap/{svarId}. It therefore requires the explicit flag --allow-rest.
  - If you do not pass --allow-rest, the script will abort without making any network calls.

  Usage examples
    pnpm ts-node scripts/svar/download_svar_maps.ts --input scripts/svar/water_svar_ids.sample.json --allow-rest
    pnpm ts-node scripts/svar/download_svar_maps.ts --input my_mapping.json --outdir public/data/svar/zips --concurrency 2 --extract --allow-rest

  Input schema (JSON array)
    EITHER array of objects
      [
        { "waterId": "vanern", "svarId": "647666-129906" },
        { "waterId": "yngen",  "svarId": "661971-141613" }
      ]
    OR array of strings (just svarIds). In that case waterId defaults to svarId
      [
        "647666-129906",
        "661971-141613"
      ]

  Output structure
    <outdir>/<waterId>/<svarId>-kartor.zip
    <outdir>/<waterId>/<svarId>-kartor.json  (metadata)
    (optional extraction) <outdir>/<waterId>/<svarId>-kartor/ ... files ...
*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { spawn } from 'node:child_process';

type WaterItem = {
  waterId: string;
  svarId: string;
};

type CliFlags = {
  input: string;
  outdir: string;
  concurrency: number;
  extract: boolean;
  allowRest: boolean;
  timeoutMs: number;
  retries: number;
};

const DEFAULTS: CliFlags = {
  input: 'scripts/svar/water_svar_ids.sample.json',
  outdir: 'public/data/svar/zips',
  concurrency: 2,
  extract: false,
  allowRest: false,
  timeoutMs: 120_000,
  retries: 2,
};

function parseFlags(argv: string[]): CliFlags {
  const flags: Partial<CliFlags> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--input' && next) { flags.input = next; i++; continue; }
    if (a === '--outdir' && next) { flags.outdir = next; i++; continue; }
    if (a === '--concurrency' && next) { flags.concurrency = Math.max(1, Number(next)); i++; continue; }
    if (a === '--extract') { flags.extract = true; continue; }
    if (a === '--allow-rest') { flags.allowRest = true; continue; }
    if (a === '--timeout' && next) { flags.timeoutMs = Math.max(10_000, Number(next)); i++; continue; }
    if (a === '--retries' && next) { flags.retries = Math.max(0, Number(next)); i++; continue; }
  }
  return { ...DEFAULTS, ...flags } as CliFlags;
}

function sha256FileSync(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true });
}

function sanitizeSegment(seg: string) {
  return seg.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

async function readInputList(filePath: string): Promise<WaterItem[]> {
  const raw = await fsp.readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Input must be a JSON array');
  return data.map((x) => {
    if (typeof x === 'string') {
      return { waterId: String(x), svarId: String(x) };
    }
    // Support both old format and WFS format
    const svarId = x.svarId ?? x.sjoid ?? x.id ?? x.SVAR_ID ?? x.SJOID ?? x.svarid;
    const waterId = x.waterId ?? x.name ?? x.WATER_ID ?? svarId;
    if (!svarId) throw new Error('Each item must include svarId or sjoid');
    return { waterId: String(waterId), svarId: String(svarId) };
  });
}

function downloadZip(url: string, destFile: string, timeoutMs: number): Promise<{ statusCode: number; headers: Record<string, string | string[]> }>{
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'MakrillSverige/1.0 (https://makrillsverige.se; alexander.westman3@gmail.com)',
        'Accept': 'application/zip, application/octet-stream;q=0.9, */*;q=0.8',
      },
    }, (res) => {
      const statusCode = res.statusCode || 0;
      const headers = res.headers as Record<string, string | string[]>;
      if (statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${statusCode} for ${url}`));
        return;
      }
      const file = fs.createWriteStream(destFile);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ statusCode, headers })));
      file.on('error', (err) => reject(err));
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });
  });
}

async function writeMetadata(metaPath: string, meta: unknown) {
  await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

async function extractZipIfEnabled(zipFile: string, targetDir: string): Promise<boolean> {
  // Only run when explicitly asked
  if (process.platform === 'win32') {
    // Use PowerShell Expand-Archive for zero extra deps
    await new Promise<void>((resolve, reject) => {
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Try { Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force; exit 0 } Catch { Write-Error $_; exit 1 }`,
      ], { stdio: 'inherit' });
      ps.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Expand-Archive failed: ${code}`)));
      ps.on('error', reject);
    });
    return true;
  }

  // Non-Windows: best-effort using `unzip` if available
  await new Promise<void>((resolve) => {
    const p = spawn('unzip', ['-o', zipFile, '-d', targetDir], { stdio: 'ignore' });
    p.on('exit', () => resolve());
    p.on('error', () => resolve());
  });
  return true;
}

async function main() {
  const flags = parseFlags(process.argv);

  if (!flags.allowRest) {
    console.error('\nRefusing to proceed: --allow-rest flag not provided.');
    console.error('robots.txt disallows /rest for general bots. Re-run with --allow-rest to confirm consent.');
    process.exitCode = 2;
    return;
  }

  const list = await readInputList(flags.input);
  if (list.length === 0) {
    console.error('Input list is empty. Nothing to do.');
    return;
  }

  await ensureDir(flags.outdir);

  const queue = list.slice();
  let active = 0;
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const waterId = sanitizeSegment(item.waterId);
      const svarId = sanitizeSegment(item.svarId);
      const baseDir = path.join(flags.outdir, waterId);
      const zipPath = path.join(baseDir, `${svarId}-kartor.zip`);
      const metaPath = path.join(baseDir, `${svarId}-kartor.json`);
      const extractDir = path.join(baseDir, `${svarId}-kartor`);

      await ensureDir(baseDir);

      if (fs.existsSync(zipPath) && fs.existsSync(metaPath)) {
        completed++;
        continue; // resume-friendly
      }

      const url = `https://vattenwebb.smhi.se/svarwebb/rest/downloadmap/${encodeURIComponent(item.svarId)}`;

      let attempt = 0;
      while (true) {
        try {
          const startedAt = new Date().toISOString();
          const { statusCode, headers } = await downloadZip(url, zipPath + '.tmp', flags.timeoutMs);
          await fsp.rename(zipPath + '.tmp', zipPath);
          const hash = sha256FileSync(zipPath);

          const meta = {
            waterId: item.waterId,
            svarId: item.svarId,
            url,
            statusCode,
            headers,
            savedAt: startedAt,
            sha256: hash,
            extractor: flags.extract ? (process.platform === 'win32' ? 'powershell Expand-Archive' : 'unzip') : null,
          };
          await writeMetadata(metaPath, meta);

          if (flags.extract) {
            await ensureDir(extractDir);
            await extractZipIfEnabled(zipPath, extractDir).catch(() => { /* non-fatal */ });
          }

          completed++;
          break;
        } catch (err) {
          attempt++;
          if (attempt > flags.retries) {
            console.error(`Failed for ${item.waterId}/${item.svarId}:`, (err as Error).message);
            break;
          }
          const backoff = Math.min(15_000, 1_000 * Math.pow(2, attempt));
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < flags.concurrency; i++) {
    active++;
    workers.push(worker().finally(() => { active--; }));
  }
  await Promise.all(workers);

  console.log(`Done. Saved ${completed} of ${list.length} items to: ${path.resolve(flags.outdir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


