// src/app/api/update-grid/route.ts
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { generateSamplePointsFromWaterMask } from "@/lib/extractWaterPoints";
import { fetchCurrentVectors } from "@/lib/fetchCurrentVectors";

export async function POST() {
  return await updateGrid();
}

export async function GET() {
  return await updateGrid();
}

async function updateGrid() {
  try {
    const geojsonPath = path.join(process.cwd(), "public/data/scandinavian-waters.geojson");
    const outputPath = path.join(process.cwd(), "public/data/precomputed-grid.json");

    const raw = await fs.readFile(geojsonPath, "utf-8");
    const geojson = JSON.parse(raw);

    const points = generateSamplePointsFromWaterMask(geojson, 0.05);
    const validPoints: { lat: number; lon: number; vectors: any[] }[] = [];

    for (const { lat, lon } of points) {
      try {
        const vectors = await fetchCurrentVectors(lat, lon);
        const allValid = vectors.every((v) => v.u !== null && v.v !== null);
        if (allValid) validPoints.push({ lat, lon, vectors });
        await new Promise((r) => setTimeout(r, 150));
      } catch {}
    }

    await fs.writeFile(outputPath, JSON.stringify(validPoints, null, 2), "utf-8");
    return NextResponse.json({ message: `✅ Grid updated with ${validPoints.length} points.` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
