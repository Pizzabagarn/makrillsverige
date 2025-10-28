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

  console.log('Opening https://vattenwebb.smhi.se/svarwebb/ ...');
  await page.goto('https://vattenwebb.smhi.se/svarwebb/', { waitUntil: 'networkidle' });
  
  // Accept cookies if present
  console.log('Checking for cookie banner...');
  await page.getByRole('button', { name: /acceptera/i }).click({ timeout: 4000 }).catch(() => {});

  // Wait for the page to fully render and for download links to appear
  console.log('Waiting for download links to load...');
  await page.waitForTimeout(3000); // Give React/Vue/etc time to render
  
  // Try to wait for at least one download link
  await page.waitForSelector('a.download-link', { timeout: 15000 }).catch(() => {
    console.warn('⚠️  No .download-link elements found after 15s');
  });

  const ids = new Set<string>();

  async function scrapeVisible() {
    const beforeCount = ids.size;
    
    // Look specifically for .download-link elements first
    const downloadLinks = await page.locator('a.download-link').all();
    for (const link of downloadLinks) {
      const href = await link.getAttribute('href').catch(() => null);
      const text = await link.textContent().catch(() => null);
      
      if (href) {
        const m = /downloadmap\/([0-9]{6,}-[0-9]{5,})/i.exec(href);
        if (m) ids.add(m[1]);
      }
      if (text) {
        const m = /Ladda\s+ner\s+sjökartor\s+för\s+([0-9]{6,}-[0-9]{5,})/i.exec(text);
        if (m) ids.add(m[1]);
      }
    }
    
    // Fallback: scan all links
    const allLinks = await page.locator('a[href*="downloadmap"]').all();
    for (const link of allLinks) {
      const href = await link.getAttribute('href').catch(() => null);
      if (href) {
        const m = /downloadmap\/([0-9]{6,}-[0-9]{5,})/i.exec(href);
        if (m) ids.add(m[1]);
      }
    }
    
    const newCount = ids.size - beforeCount;
    if (newCount > 0) {
      console.log(`  Found ${newCount} new IDs (total: ${ids.size})`);
    }
  }

  // Initial scrape
  console.log('Scraping visible IDs...');
  await scrapeVisible();
  console.log(`Initial scrape: ${ids.size} IDs`);

  // Scroll/paginate: try a long incremental scroll; break when no new ids for a while
  console.log('Starting scroll loop...');
  let unchanged = 0;
  let lastCount = ids.size;
  for (let step = 0; step < 3000 && ids.size < flags.max; step++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(600); // Slightly longer wait to let content load
    
    await scrapeVisible();
    
    if (ids.size === lastCount) {
      unchanged++;
    } else {
      unchanged = 0;
      lastCount = ids.size;
    }
    
    if (unchanged > 30) {
      console.log('No new IDs found for 30 iterations, stopping.');
      break;
    }
    
    if (step % 10 === 0 && step > 0) {
      console.log(`  Step ${step}: ${ids.size} IDs collected...`);
    }
  }

  console.log(`\n✅ Finished! Collected ${ids.size} unique SVAR IDs`);
  
  await browser.close();

  const outPath = path.resolve(flags.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(Array.from(ids), null, 2), 'utf8');
  console.log(`📁 Saved to: ${outPath}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });


