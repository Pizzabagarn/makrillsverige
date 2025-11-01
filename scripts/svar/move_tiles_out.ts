import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const SRC_ROOT = path.join(process.cwd(), 'public', 'data', 'svar');
const DEST_ROOT = process.env.SVARTILES_DEST || 'C:\\SvarTiles';

async function ensureDir(p: string) { await fsp.mkdir(p, { recursive: true }); }

async function main() {
  console.log('Source:', SRC_ROOT);
  console.log('Dest  :', DEST_ROOT);
  await ensureDir(DEST_ROOT);

  let moved = 0;
  const todo: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/^tiles-.*_files$/i.test(e.name)) todo.push(p);
        else await walk(p);
      }
    }
  };
  await walk(SRC_ROOT);
  console.log(`Found ${todo.length} tiles folders to move.`);
  for (let i = 0; i < todo.length; i++) {
    const src = todo[i];
    const rel = path.relative(SRC_ROOT, src);
    const dest = path.join(DEST_ROOT, rel);
    await ensureDir(path.dirname(dest));
    process.stdout.write(`[${i + 1}/${todo.length}] ${rel} ... `);
    await fsp.rename(src, dest);
    moved++;
    process.stdout.write('moved\n');
  }
  console.log(`Moved ${moved} folders.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });



