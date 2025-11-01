import { NextResponse } from 'next/server';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

type SvarIndex = {
  items: any[];
  bySjoid: Record<string, number>;
};

async function loadIndex(): Promise<SvarIndex> {
  const gzPath = path.join(process.cwd(), 'public', 'data', 'svar', 'index.json.gz');
  const src = fs.createReadStream(gzPath);
  const chunks: Buffer[] = [];
  const gunzip = createGunzip();
  gunzip.on('data', (c) => chunks.push(c));
  await pipeline(src, gunzip as any, async function* () {})
    .catch(() => {});
  if (chunks.length === 0) {
    const jsonPath = path.join(process.cwd(), 'public', 'data', 'svar', 'index.json');
    const raw = await fsp.readFile(jsonPath, 'utf8');
    return JSON.parse(raw);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function mapTypeFromName(name: string): 'tif' | 'jpg' | 'png' | 'pdf' | 'other' {
  const n = name.toLowerCase();
  if (n.endsWith('.tif') || n.endsWith('.tiff')) return 'tif';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
  if (n.endsWith('.png')) return 'png';
  if (n.endsWith('.pdf')) return 'pdf';
  return 'other';
}

function extractYearFromFilename(name: string): number | null {
  // Heuristic: look for _YYYY_ or -YYYY_ where YYYY in [1900,2100)
  const m = /(?:_|-)(19\d{2}|20\d{2})(?:_|-)/.exec(name);
  if (!m) return null;
  const y = Number(m[1]);
  if (y >= 1900 && y < 2100) return y;
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sjoid = searchParams.get('sjoid') || '';
    if (!sjoid) return NextResponse.json({ error: 'missing sjoid' }, { status: 400 });

    const index = await loadIndex();
    const idx = index.bySjoid[sjoid];
    if (typeof idx !== 'number') return NextResponse.json({ sjoid, maps: [], cached: true });
    const it = index.items[idx];
    // Try to enrich each file with any pre-generated preview/tiles on disk
    const files = it.files as Array<{ name: string; relPath: string }>;
    const maps = [] as Array<{
      name: string;
      path: string; // best display path (preview if exists)
      type: 'tif' | 'jpg' | 'png' | 'pdf';
      year: number | null;
      originalPath: string; // original file for download
      previewPath?: string; // normalized web preview if available
      tilesUrl?: string;    // XYZ template if available
    }>;

    for (const f of files) {
      const type = mapTypeFromName(f.name);
      if (type === 'other') continue;
      const originalPath = '/' + f.relPath.replace(/\\/g, '/');
      const absDir = path.join(process.cwd(), 'public', path.dirname(f.relPath));
      const baseNoExt = f.name.replace(/\.[^.]+$/,'');

      // Candidate preview locations (in priority order)
      const previewCandidates = [
        path.join(absDir, 'web', `preview-${baseNoExt}.jpg`),
        path.join(absDir, 'web', `preview-${baseNoExt}.png`),
        path.join(absDir, 'web', `${baseNoExt}.preview.jpg`),
        path.join(absDir, 'web', `${baseNoExt}.preview.png`),
        path.join(absDir, 'web', 'preview.jpg'),
        path.join(absDir, 'web', 'preview.png'),
      ];

      let previewPath: string | undefined;
      for (const p of previewCandidates) {
        if (fs.existsSync(p)) {
          previewPath = '/' + path.relative(path.join(process.cwd(), 'public'), p).split(path.sep).join('/');
          break;
        }
      }

      // Candidate tiles location: Deep Zoom (DZI) or XYZ folder
      let tilesUrl: string | undefined;
      let dziUrl: string | undefined;
      // Prefer explicit tiles base; otherwise derive from Supabase env + public bucket name
      let remoteBase = process.env.NEXT_PUBLIC_SVAR_TILES_BASE_URL || process.env.SVAR_TILES_BASE_URL;
      if (!remoteBase) {
        const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const publicBucket = process.env.NEXT_PUBLIC_SVAR_TILES_BUCKET || 'Charts';
        if (supaUrl) {
          remoteBase = `${supaUrl.replace(/\/$/, '')}/storage/v1/object/public/${publicBucket}`;
        }
      }

      const slugifySegment = (seg: string) => seg
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/Å/g, 'A').replace(/Ä/g, 'A').replace(/Ö/g, 'O')
        .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
        .replace(/Æ/g, 'AE').replace(/æ/g, 'ae').replace(/Ø/g, 'O').replace(/ø/g, 'o')
        .replace(/ß/g, 'ss')
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9._-]/g, '_')
        .replace(/_+/g, '_');
      const storageSafePath = (relPath: string) => relPath
        .replace(/^\/+/, '')
        .split('/')
        .map((seg) => seg ? slugifySegment(seg) : seg)
        .join('/');
      // DZI first
      const dziCandidates = [
        path.join(absDir, 'web', `tiles-${baseNoExt}.dzi`),
        path.join(absDir, 'web', 'tiles.dzi'),
      ];
      for (const d of dziCandidates) {
        if (fs.existsSync(d) && fs.statSync(d).isFile()) {
          const rel = '/' + path.relative(path.join(process.cwd(), 'public'), d).split(path.sep).join('/');
          // Prefer remote base if configured (so tiles can live in Supabase)
          if (remoteBase) {
            // Strip leading '/data/' and slugify segments to match upload keys
            const relNoData = rel.replace(/^\/data\//, '');
            const safeRel = storageSafePath(relNoData);
            dziUrl = remoteBase.replace(/\/$/, '') + '/' + safeRel;
          } else {
            dziUrl = rel;
          }
          break;
        }
      }
      // If no local DZI file but a remote base is configured, construct the expected remote DZI URL
      if (!dziUrl && remoteBase) {
        // 1) Simple deterministic guess
        const relOrig = originalPath.startsWith('/') ? originalPath.slice(1) : originalPath;
        const dirRel = path.posix.dirname(relOrig);
        const guessRel = `${dirRel}/web/tiles-${baseNoExt}.dzi`;
        const relNoData = guessRel.replace(/^data\//, '');
        const safeRel = storageSafePath(relNoData);
        dziUrl = remoteBase.replace(/\/$/, '') + '/' + safeRel;
      }
      if (!dziUrl) {
        const tilesDir = path.join(absDir, 'web', 'tiles');
        if (fs.existsSync(tilesDir) && fs.statSync(tilesDir).isDirectory()) {
          const relTiles = '/' + path.relative(path.join(process.cwd(), 'public'), tilesDir).split(path.sep).join('/');
          tilesUrl = `${relTiles}/{z}/{x}/{y}.png`;
        }
      }

      maps.push({
        name: f.name,
        path: previewPath ?? originalPath,
        type,
        year: extractYearFromFilename(f.name),
        originalPath,
        previewPath,
        tilesUrl,
        // @ts-ignore - include extra field if present
        ...(dziUrl ? { dziUrl } : {}),
      });
    }

    // Sort: newest year first, otherwise by name desc for stability
    const sorted = maps.sort((a, b) => {
      const ay = a.year ?? -1, by = b.year ?? -1;
      if (ay !== by) return by - ay;
      return b.name.localeCompare(a.name);
    });

    return NextResponse.json({ sjoid, lakeName: it.name ?? it.lakeName, maps: sorted, cached: true });
  } catch (err) {
    console.error('SVAR get-maps failed', err);
    return NextResponse.json({ error: 'internal-error' }, { status: 500 });
  }
}
