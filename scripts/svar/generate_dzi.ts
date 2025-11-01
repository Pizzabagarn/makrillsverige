import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function getArg(name: string): string | undefined {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : undefined;
}

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const DEFAULT_SEARCH_ROOT = path.join(PUBLIC_ROOT, 'data', 'svar', 'zips');
const SEARCH_ROOT = getArg('root') ? path.resolve(getArg('root')!) : DEFAULT_SEARCH_ROOT;
const OVERWRITE = (getArg('overwrite') || 'false').toLowerCase() === 'true';

function parseVipsPropsXml(xml: string): { width?: number; height?: number } {
  const widthMatch = xml.match(/<name>width<\/name>\s*<value[^>]*>(\d+)<\/value>/i);
  const heightMatch = xml.match(/<name>height<\/name>\s*<value[^>]*>(\d+)<\/value>/i);
  return {
    width: widthMatch ? Number(widthMatch[1]) : undefined,
    height: heightMatch ? Number(heightMatch[1]) : undefined,
  };
}

async function detectTileFormat(folder: string): Promise<'jpeg' | 'png'> {
  const queue: string[] = [folder];
  while (queue.length) {
    const d = queue.pop()!;
    const entries = await fsp.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) queue.push(p);
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
  // Our tiler (sharp .tile with layout 'dz') uses 512px tiles with 1px overlap.
  // Generate manifests consistent with that so viewers fetch the correct tiles.
  const { width, height, tileSize = 512, overlap = 1, format } = params;
  const w = width ?? 0;
  const h = height ?? 0;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="${format}" Overlap="${overlap}" TileSize="${tileSize}">\n` +
    `  <Size Width="${w}" Height="${h}"/>\n` +
    `</Image>\n`
  );
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function findTileFolders(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fsp.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (e.name.endsWith('_files')) out.push(p);
      const nested = await findTileFolders(p);
      out.push(...nested);
    }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(SEARCH_ROOT)) {
    console.error('Search root not found:', SEARCH_ROOT);
    process.exit(1);
  }

  const folders = await findTileFolders(SEARCH_ROOT);
  console.log(`Found ${folders.length} tile folders under ${path.relative(process.cwd(), SEARCH_ROOT)}`);

  let created = 0; let skipped = 0; let errors = 0;
  let i = 0;
  for (const folder of folders) {
    i++;
    const baseName = path.basename(folder).replace(/_files$/i, '');
    const dziPath = path.join(path.dirname(folder), `${baseName}.dzi`);
    if (!OVERWRITE && fs.existsSync(dziPath)) {
      skipped++;
      if (i % 250 === 0) console.log(`[${i}/${folders.length}] skipped existing .dzi`);
      continue;
    }
    try {
      // Parse vips-properties for dimensions if present
      let width: number | undefined; let height: number | undefined;
      const propsPath = path.join(folder, 'vips-properties.xml');
      if (fs.existsSync(propsPath)) {
        const xml = await fsp.readFile(propsPath, 'utf8');
        const props = parseVipsPropsXml(xml);
        width = props.width; height = props.height;
      }
      const format = await detectTileFormat(folder);
      const xmlContent = buildDziXml({ width, height, format, tileSize: 512, overlap: 1 });
      await fsp.writeFile(dziPath, xmlContent, 'utf8');
      created++;
      if (i % 50 === 0) console.log(`[${i}/${folders.length}] wrote ${path.relative(SEARCH_ROOT, dziPath)}`);
    } catch (e: any) {
      errors++;
      console.error('error writing dzi for', folder, '-', e.message || e);
    }
  }
  console.log(`Done. created=${created}, skipped=${skipped}, errors=${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });


