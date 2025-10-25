import { fetchWithRetry } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { ORS_DIRECTIONS_CACHE_TTL_MS, ORS_MATRIX_CACHE_TTL_MS } from '@/shared/constants';

const orsBreaker = new CircuitBreaker();
const directionsCache = new Map<string, { ts: number; value: any }>();
const matrixCache = new Map<string, { ts: number; value: any }>();

type DirectionsProfile = 'driving-car' | 'cycling-regular' | 'foot-walking' | 'foot-hiking';

export interface DirectionsOptions {
  coordinates: [number, number][];
  elevation?: boolean;
  instructions?: boolean;
  language?: string;
  radiuses?: number[];
  extra_params?: Record<string, unknown>;
}

export async function orsDirections(profile: DirectionsProfile, options: DirectionsOptions, apiKey: string) {
  if (!orsBreaker.canRequest()) throw new Error('ORS breaker open');
  const url = `https://api.openrouteservice.org/v2/directions/${profile}/json`;
  const body: any = {
    coordinates: options.coordinates,
    instructions: options.instructions ?? true,
    elevation: options.elevation ?? false,
    language: options.language ?? 'sv',
    radiuses: options.radiuses ?? [-1, -1],
    ...options.extra_params
  };
  const cacheKey = `dir:${profile}:${JSON.stringify(body)}`;
  const now = Date.now();
  const cached = directionsCache.get(cacheKey);
  if (cached && now - cached.ts < ORS_DIRECTIONS_CACHE_TTL_MS) {
    return cached.value;
  }
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  }, 2);
  if (!res.ok) {
    orsBreaker.recordFailure();
    throw new Error(`ORS directions failed: ${res.status}`);
  }
  orsBreaker.recordSuccess();
  const json = await res.json();
  directionsCache.set(cacheKey, { ts: now, value: json });
  return json;
}

export async function orsMatrix(profile: DirectionsProfile, sources: [number, number][], destinations: [number, number][], apiKey: string) {
  if (!orsBreaker.canRequest()) throw new Error('ORS breaker open');
  const url = `https://api.openrouteservice.org/v2/matrix/${profile}`;
  const body: any = { sources, destinations, metrics: ['duration', 'distance'] };
  const cacheKey = `mat:${profile}:${JSON.stringify(body)}`;
  const now = Date.now();
  const cached = matrixCache.get(cacheKey);
  if (cached && now - cached.ts < ORS_MATRIX_CACHE_TTL_MS) {
    return cached.value;
  }
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  }, 2);
  if (!res.ok) {
    orsBreaker.recordFailure();
    throw new Error(`ORS matrix failed: ${res.status}`);
  }
  orsBreaker.recordSuccess();
  const json = await res.json();
  matrixCache.set(cacheKey, { ts: now, value: json });
  return json;
}

export async function orsElevationLine(geometry: { type: 'LineString'; coordinates: [number, number][] }, apiKey: string) {
  if (!orsBreaker.canRequest()) throw new Error('ORS breaker open');
  const url = 'https://api.openrouteservice.org/elevation/line';
  const body = { format_in: 'geojson', format_out: 'geojson', geometry } as any;
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  }, 2);
  if (!res.ok) {
    orsBreaker.recordFailure();
    throw new Error(`ORS elevation line failed: ${res.status}`);
  }
  orsBreaker.recordSuccess();
  return res.json();
}


