import { fetchWithRetry } from '../utils/retry';

export type DemSource = 'ors' | 'mapbox' | 'eudem' | 'arcticdem' | 'opentopodata';

export interface ElevationProfilePoint { d: number; z: number; g: number }

export interface TerrainSummary {
  elevationGainMeters: number;
  elevationLossMeters: number;
  netAscentMeters: number;
  maxGradePercent: number;
  profile: ElevationProfilePoint[];
  dem_source: DemSource;
}

function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

const ELEV_NOISE_M = 1.5;

function summarizeElevations(coords3: Array<[number, number, number]>): TerrainSummary {
  let gain = 0, loss = 0, maxGrade = 0, cum = 0;
  const profile: ElevationProfilePoint[] = [];
  profile.push({ d: 0, z: coords3[0][2] ?? 0, g: 0 });
  for (let i = 1; i < coords3.length; i++) {
    const a = coords3[i-1];
    const b = coords3[i];
    const dzRaw = (b[2] ?? 0) - (a[2] ?? 0);
    const dz = Math.abs(dzRaw) < ELEV_NOISE_M ? 0 : dzRaw;
    const dx = haversine([a[0], a[1]], [b[0], b[1]]);
    cum += dx;
    const grade = dx > 0 ? (dz / dx) * 100 : 0;
    maxGrade = Math.max(maxGrade, Math.abs(grade));
    if (dz > 0) gain += dz; else if (dz < 0) loss += -dz;
    profile.push({ d: cum, z: b[2] ?? 0, g: grade });
  }
  return {
    elevationGainMeters: gain,
    elevationLossMeters: loss,
    netAscentMeters: (profile[profile.length - 1].z - profile[0].z),
    maxGradePercent: maxGrade,
    profile,
    dem_source: 'eudem'
  };
}

export async function sampleElevationOpenTopoData(line: { type: 'LineString'; coordinates: [number, number][] }): Promise<TerrainSummary | null> {
  if (!line.coordinates || line.coordinates.length < 2) return null;
  const coords = line.coordinates as [number, number][];
  const maxSamples = 80;
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const sampled: [number, number][] = [];
  for (let i = 0; i < coords.length; i += step) sampled.push(coords[i]);
  if (sampled[sampled.length - 1] !== coords[coords.length - 1]) sampled.push(coords[coords.length - 1]);
  const locParam = sampled.map(([lng, lat]) => `${lat},${lng}`).join('|');
  const url = `https://api.opentopodata.org/v1/eudem25m?locations=${encodeURIComponent(locParam)}`;
  const res = await fetchWithRetry(url, { method: 'GET' }, 1);
  if (!res.ok) return null;
  const json = await res.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  if (results.length < 2) return null;
  const coords3: Array<[number, number, number]> = [];
  for (let i = 0; i < results.length; i++) {
    const z = results[i]?.elevation ?? null;
    if (z == null) continue;
    coords3.push([sampled[i][0], sampled[i][1], z]);
  }
  const summary = summarizeElevations(coords3);
  summary.dem_source = 'opentopodata';
  return summary;
}


