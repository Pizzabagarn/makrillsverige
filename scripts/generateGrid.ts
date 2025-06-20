// scripts/generateGrid.ts
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env.local') });

import fs from 'fs/promises';
import path from 'path';

// ❌ Inaktiverad: manuella punkter
// import { DMI_GRID_POINTS } from '../src/lib/points.js';

import { generateSamplePointsFromWaterMask } from '../src/lib/extractWaterPoints.js';
import { fetchCurrentVectors } from '../src/lib/fetchCurrentVectors.js';

async function main() {
  const geojsonPath = path.join(process.cwd(), 'public', 'data', 'skandinavien-water.geojson');
  const outputPath  = path.join(process.cwd(), 'public', 'data', 'precomputed-grid.json');

  console.log('📥 Läser GeoJSON…');
  const raw     = await fs.readFile(geojsonPath, 'utf-8');
  const geojson = JSON.parse(raw);

  console.log('📡 Genererar automatiska punkter från havsmask…');
  const autoPoints = generateSamplePointsFromWaterMask(geojson, 0.05);
  console.log(`🌊 Automatiskt genererade punkter: ${autoPoints.length}`);

  // ✅ Använd endast automatiska punkter från vattenmasken
  const allPoints = [...autoPoints];

  // ❌ Tidigare: inkludera manuella punkter
  /*
  const allPoints = [
    ...DMI_GRID_POINTS,
    ...autoPoints
  ];
  */

  console.log(`⭐ Totalt att behandla: ${allPoints.length}`);

  const validPoints: { lat: number; lon: number; vectors: any[] }[] = [];

  for (const { lat, lon } of allPoints) {
    try {
      const vectors = await fetchCurrentVectors(lat, lon);

      const allValid = vectors.every((v) => v.u !== null && v.v !== null);
      if (allValid) {
        validPoints.push({ lat, lon, vectors });
        console.log(`✅ OK: ${lat.toFixed(4)},${lon.toFixed(4)} (${vectors.length} steg)`);
      } else {
        console.warn(`⚠ Ogiltig data vid ${lat.toFixed(4)},${lon.toFixed(4)}`);
      }

      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.warn(`❌ API-fel vid ${lat.toFixed(4)},${lon.toFixed(4)}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`💾 Sparar ${validPoints.length} punkter till:\n  ${outputPath}`);
  await fs.writeFile(outputPath, JSON.stringify(validPoints, null, 2), 'utf-8');
}

main().catch((err) => {
  console.error('💥 Fel i generateGrid:', err);
  process.exit(1);
});
