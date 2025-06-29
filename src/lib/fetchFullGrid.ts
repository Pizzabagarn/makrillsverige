// src/lib/fetchFullGrid.ts
import { DMI_GRID_POINTS } from './points';
import { fetchCurrentVectors } from '@/app/api/dmi/current'; // du har redan denna
import { CurrentVector } from '@/app/api/dmi/current';

export async function fetchFullGrid(): Promise<Record<string, CurrentVector[]>> {
  const result: Record<string, CurrentVector[]> = {};

  for (const { lat, lon } of DMI_GRID_POINTS) {
    try {
      const vectors = await fetchCurrentVectors(lat, lon);
      const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
      result[key] = vectors;
      await new Promise((r) => setTimeout(r, 200)); // throttling
          } catch (err) {
        // console.warn(`Misslyckades för punkt ${lat},${lon}`, err);
    }
  }

  return result;
}
