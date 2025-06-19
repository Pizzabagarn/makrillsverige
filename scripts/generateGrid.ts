// scripts/generateGrid.ts
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
import fs from 'fs/promises';
import path from 'path';
import { generateSamplePointsFromWaterMask } from '../src/lib/extractWaterPoints';
import { fetchCurrentVectors } from '../src/lib/fetchCurrentVectors';


async function main() {
  const geojsonPath = path.join(process.cwd(), 'public', 'data', 'skandinavien-water.geojson');
  const outputPath = path.join(process.cwd(), 'public', 'data', 'precomputed-grid.json');

  console.log('📥 Läser GeoJSON...');
  const raw = await fs.readFile(geojsonPath, 'utf-8');
  const geojson = JSON.parse(raw);

  console.log('📡 Genererar punkter...');
  const points = generateSamplePointsFromWaterMask(geojson, 0.05); // spacing kan justeras
  console.log(`🌊 Totalt genererade punkter: ${points.length}`);

  const validPoints: { lat: number; lon: number; vectors: any[] }[] = [];

  for (const { lat, lon } of points) {
    try {
      const vectors = await fetchCurrentVectors(lat, lon);
      const allValid = vectors.every((v) => v.u !== null && v.v !== null);
      if (allValid) {
        validPoints.push({ lat, lon, vectors });
        console.log(`✅ OK: ${lat.toFixed(3)},${lon.toFixed(3)} (${vectors.length} timsteg)`);
      } else {
        console.warn(`⚠️ Ogiltig punkt: ${lat.toFixed(3)},${lon.toFixed(3)}`);
      }

      await new Promise((r) => setTimeout(r, 150)); // Throttla så vi inte får 429

    } catch (err) {
      if (err instanceof Error) {
        console.warn(`❌ Fel vid ${lat},${lon}:`, err.message);
      } else {
        console.warn(`❌ Fel vid ${lat},${lon}:`, err);
      }
    }
  }

  console.log(`💾 Sparar ${validPoints.length} giltiga punkter till: ${outputPath}`);
  await fs.writeFile(outputPath, JSON.stringify(validPoints, null, 2), 'utf-8');
}

main().catch((err) => {
  console.error('💥 Error i generateGrid:', err);
  process.exit(1);
});
