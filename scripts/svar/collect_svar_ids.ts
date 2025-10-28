/*
  SVAR ID collector (Playwright)

  Navigates to the register view on https://vattenwebb.smhi.se/svarwebb/ and scrolls
  through the list to collect all "Ladda ner sjökartor för <ID>" links. Produces
  a JSON array of svarIds, suitable to feed the downloader.

  Usage:
    pnpm ts-node scripts/svar/collect_svar_ids.ts --out scripts/svar/all_svar_ids.json --max 1000

  Notes:
    - This uses the public UI and does not call /rest directly. It only extracts IDs
      from link hrefs/text.
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

type Flags = { out: string; max: number; headful: boolean };

function parseFlags(argv: string[]): Flags {
  const f: Partial<Flags> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const n = argv[i+1];
    if (a === '--out' && n) { f.out = n; i++; continue; }
    if (a === '--max' && n) { f.max = Math.max(1, Number(n)); i++; continue; }
    if (a === '--headful') { f.headful = true; continue; }
  }
  return { out: 'scripts/svar/all_svar_ids.json', max: 10_000, headful: false, ...f } as Flags;
}

async function main() {
  const flags = parseFlags(process.argv);
  const browser = await chromium.launch({ headless: !flags.headful });
  const page = await browser.newPage({
    userAgent: 'MakrillSverige/1.0 (https://makrillsverige.se; alexander.westman3@gmail.com)',
  });

  await page.goto('https://vattenwebb.smhi.se/svarwebb/', { waitUntil: 'networkidle' });
  // Accept cookies if present
  await page.getByRole('button', { name: /acceptera/i }).click({ timeout: 4000 }).catch(() => {});

  // Navigate to the register if needed (the UI text may vary; we just look for download buttons later)

  const ids = new Set<string>();

  async function scrapeVisible() {
    // Look for anchor/button text like "Ladda ner sjökartor för 647666-129906"
    const matches = await page.locator('a, button').allTextContents();
    for (const t of matches) {
      const m = /Ladda\s+ner\s+sjökartor\s+för\s+([0-9]{6,}-[0-9]{5,})/i.exec(t);
      if (m) ids.add(m[1]);
    }
    // Also inspect hrefs
    const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map(e => (e as HTMLAnchorElement).href));
    for (const h of hrefs) {
      const m = /downloadmap\/([0-9]{6,}-[0-9]{5,})/i.exec(h);
      if (m) ids.add(m[1]);
    }
  }

  // Scroll/paginate: try a long incremental scroll; break when no new ids for a while
  let unchanged = 0;
  let lastCount = 0;
  for (let step = 0; step < 2000 && ids.size < flags.max; step++) {
    await scrapeVisible();
    if (ids.size === lastCount) unchanged++; else unchanged = 0;
    lastCount = ids.size;
    if (unchanged > 20) break;
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(400);
  }

  await browser.close();

  const outPath = path.resolve(flags.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(Array.from(ids), null, 2), 'utf8');
  console.log(`Collected ${ids.size} svarIds -> ${outPath}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });


