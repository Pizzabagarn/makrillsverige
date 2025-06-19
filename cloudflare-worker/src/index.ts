import fs from "fs/promises";
import path from "path";
import { generateSamplePointsFromWaterMask } from "../../src/lib/extractWaterPoints";
import { fetchCurrentVectors } from "../../src/lib/fetchCurrentVectors";

export default {
  async scheduled(event: ScheduledController, env: any, ctx: ExecutionContext) {
    try {
      const geojsonPath = path.join(process.cwd(), "public", "data", "skandinavien-water.geojson");
      const outputPath = path.join(process.cwd(), "public", "data", "precomputed-grid.json");

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
      console.log(`✅ Grid updated with ${validPoints.length} points.`);
    } catch (err: any) {
      console.error("💥 Cron-job error:", err);
    }
  },
};
