// src/app/api/dmi/full-grid/route.ts
import { NextResponse } from 'next/server';
import { fetchCurrentVectors } from '@/app/api/dmi/current';
import { getGridFromCache, saveGridToCache } from '@/lib/memoryCache';
import { generateSamplePointsFromWaterMask } from '@/lib/extractWaterPoints';
import path from 'path';
import fs from 'fs/promises';

export async function GET() {
  let data = getGridFromCache();
  if (data) return NextResponse.json(data);

  try {
    // 1. Läs in GeoJSON-filen från public/data
    const geoPath = path.join(process.cwd(), 'public', 'data', 'skandinavien-water.geojson');
    const raw = await fs.readFile(geoPath, 'utf-8');
    const geojson = JSON.parse(raw);

    // 2. Generera punkter inuti polygonen
    const allPoints = generateSamplePointsFromWaterMask(geojson, 0.05); // ~5km avstånd
    console.log(`💧 Antal punkter inuti masken: ${allPoints.length}`);

    // 3. Filtrera bort punkter utanför DMI:s täckning (säkerhetsfilter)
    const validPoints = allPoints.filter(p =>
      p.lat >= 54.5 && p.lat <= 58.0 &&
      p.lon >= 7.5 && p.lon <= 13.5
    );
    console.log(`✅ Punkter inom DMI-område: ${validPoints.length}`);

    // 4. Begränsa antal (valfritt)
    const points = validPoints.slice(0, 100); // throttlad mängd
    console.log(`🔵 Använder punkter: ${points.length}`);

    // 5. Hämta strömdata för varje punkt
    const result: Record<string, any[]> = {};
    for (const { lat, lon } of points) {
      try {
        const vectors = await fetchCurrentVectors(lat, lon);
        const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
        result[key] = vectors;
        await new Promise((r) => setTimeout(r, 150)); // throttling
      } catch (err) {
        console.warn(`❌ Misslyckades för ${lat},${lon}`, err);
      }
    }

    // 6. Cachea och returnera
    saveGridToCache(result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("💥 Fel vid full-grid GET:", error);
    return NextResponse.json({ error: 'Kunde inte generera grid-data' }, { status: 500 });
  }
}
