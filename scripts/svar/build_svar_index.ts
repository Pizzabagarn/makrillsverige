/*
  SVAR downloads indexer

  Scans public/data/svar/zips/<waterId>/<svarId>-kartor/ (extracted) and builds a
  consolidated index mapping svarId -> parsed lake name and files.

  Usage:
    pnpm ts-node scripts/svar/build_svar_index.ts

  Output:
    public/data/svar/index.json
*/

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'public/data/svar/zips';
const OUT  = 'public/data/svar/index.json';

type FileEntry = { name: string; relPath: string; size: number };
type RecordEntry = {
  waterId: string;
  svarId: string;
  dir: string;
  lakeName: string;            // parsed main name
  displayTitle: string;        // full title from filename (no id)
  files: FileEntry[];
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
    out.push({ name: e.name, relPath: fp.replace(/^public\//, ''), size: st.size });
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
      result.push({
        waterId: path.basename(waterDir),
        svarId,
        dir: dir.replace(/^public\//, ''),
        lakeName,
        displayTitle,
        files,
      });
    }
  }

  await fsp.mkdir(path.dirname(OUT), { recursive: true });
  await fsp.writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items: result }, null, 2), 'utf8');
  console.log(`Wrote ${result.length} entries to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});



