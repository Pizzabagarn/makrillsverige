// src/app/api/dmi/current.ts

import { dmiFetch } from "./apiClient";

export type CurrentVector = {
  lat: number;
  lon: number;
  u: number;
  v: number;
  magnitude: number;
  angleDeg: number;
  timestamp: string; // 🕒 Nytt fält
};

export async function fetchCurrentVectors(lat: number, lon: number): Promise<CurrentVector[]> {
  const res = await fetch(`/api/dmi/current?lat=${lat}&lon=${lon}`);
  const data = await res.json();

  const uValues = extractValues(data, "current-u");
  const vValues = extractValues(data, "current-v");
  const timestamps: string[] = extractTimestamps(data);

  const vectors: CurrentVector[] = [];

  for (let i = 0; i < uValues.length; i++) {
    const u = uValues[i];
    const v = vValues[i];
    const time = timestamps[i] ?? null;

    if (time) {
      vectors.push({
        lat,
        lon,
        u,
        v,
        magnitude: Math.sqrt(u * u + v * v),
        angleDeg: (Math.atan2(u, v) * 180) / Math.PI,
        timestamp: time,
      });
    }
  }

  console.log("✅ Strömningsdata med timestamp:");
  vectors.forEach((vec, i) => {
    if (
      typeof vec.u === 'number' &&
      typeof vec.v === 'number' &&
      typeof vec.angleDeg === 'number' &&
      typeof vec.magnitude === 'number'
    ) {
      console.log(
        `#${i} ${vec.timestamp} | u=${vec.u.toFixed(3)}, v=${vec.v.toFixed(3)}, vinkel=${vec.angleDeg.toFixed(1)}°, hastighet=${vec.magnitude.toFixed(3)}`
      );
    } else {
      console.warn(`⚠️ Ogiltig vektor [${i}]`, vec);
    }
  });

  return vectors;
}

function extractValues(data: any, paramName: string): number[] {
  try {
    return data?.ranges?.[paramName]?.values ?? [];
  } catch (err) {
    console.warn(`⚠️ Kunde inte extrahera ${paramName}`, err);
    return [];
  }
}

function extractTimestamps(data: any): string[] {
  try {
    return data?.domain?.axes?.t?.values ?? [];
  } catch (err) {
    console.warn("⚠️ Kunde inte extrahera timestamps", err);
    return [];
  }
}
