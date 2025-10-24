// src/app/api/routing/route.ts
// Server-side API route för att hantera OpenRouteService requests
// Detta håller API-nyckeln säker på servern

import { NextRequest, NextResponse } from 'next/server';
import { calculateElevationAdjustedTime } from '@/lib/smartRoutingService';

// Gate verbose logs behind LOG_LEVEL=debug
const isDebug = process.env.LOG_LEVEL === 'debug';
const JOIN_TRIM_THRESHOLD_M = 5; // much stricter: only join if segments virtually touch
const ELEV_NOISE_M = 1.5; // ignore tiny vertical jitter per step

// Minimal polyline decoder supporting precision 5 or 6 (ORS default is 5)
function decodeEncodedPolyline(encoded: string, precision: 5 | 6 = 5): [number, number][] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];
  const factor = Math.pow(10, precision);

  while (index < len) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    const latitude = lat / factor;
    const longitude = lng / factor;
    // Return as [lng, lat] for MapLibre
    coordinates.push([longitude, latitude]);
  }

  return coordinates;
}

function normalizeRouteGeometry(route: any): { type: 'LineString'; coordinates: [number, number][] } {
  const geom = route.geometry;
  if (!geom) {
    return { type: 'LineString', coordinates: [] };
  }
  if (typeof geom === 'string') {
    // Try precision 5 first (ORS default), fallback to 6 if path looks degenerate
    let coords = decodeEncodedPolyline(geom, 5);
    // Heuristic: if bbox width/height is unrealistically tiny, retry with 6
    const [minLng, minLat, maxLng, maxLat] = (function () {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
      return [minLng, minLat, maxLng, maxLat] as [number, number, number, number];
    })();
    const spanLng = Math.abs(maxLng - minLng);
    const spanLat = Math.abs(maxLat - minLat);
    if ((spanLng < 0.0001 && spanLat < 0.0001) || coords.length < 2) {
      coords = decodeEncodedPolyline(geom, 6);
    }
    return { type: 'LineString', coordinates: coords };
  }
  if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
    return { type: 'LineString', coordinates: geom.coordinates };
  }
  // Fallback
  return { type: 'LineString', coordinates: [] };
}

/**
 * PROFESSIONELL LÖSNING: Använd Overpass API (OpenStreetMap) för att hitta närmaste väg/stig
 * Mycket snabbare och mer exakt än att testa olika riktningar
 * @param includeFootpaths - Om true, inkludera även gång/cykelvägar och stigar
 */
// Simple in-memory cache for Overpass lookups to speed up repeated queries
const overpassCache = new Map<string, { ts: number; value: { point: [number, number]; distance: number; wayType: string } | null }>();
const OVERPASS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function findNearestRoadViaOverpass(
  coord: [number, number], // [lng, lat]
  maxRadiusKm: number = 50,
  includeFootpaths: boolean = false
): Promise<{ point: [number, number]; distance: number; wayType: string } | null> {
  
  const [lng, lat] = coord;
  const key = `${includeFootpaths?'fp':'rd'}:${maxRadiusKm}:${lng.toFixed(4)},${lat.toFixed(4)}`;
  const now = Date.now();
  const cached = overpassCache.get(key);
  if (cached && (now - cached.ts) < OVERPASS_CACHE_TTL_MS) {
    return cached.value;
  }
  
  // Testa progressivt större radier tills vi hittar en väg (upp till maxRadiusKm)
  const candidateRadii = [2, 5, 10, 20, 50, 100, 150];
  const radii = candidateRadii.filter(r => r <= maxRadiusKm);
  
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter'
  ];

  for (const radiusKm of radii) {
    const pathType = includeFootpaths ? 'vägar/stigar' : 'vägar';
    if (isDebug) console.log(`🗺️  Söker ${pathType} i OSM inom ${radiusKm}km radie...`);
    
    // Beräkna bounding box
    const latDegPerKm = 1 / 110.574;
    const lngDegPerKm = 1 / (111.320 * Math.cos(lat * Math.PI / 180));
    
    const latRadius = radiusKm * latDegPerKm;
    const lngRadius = radiusKm * lngDegPerKm;
    
    const bbox = {
      south: lat - latRadius,
      north: lat + latRadius,
      west: lng - lngRadius,
      east: lng + lngRadius
    };
    
    // Overpass QL query - hitta körbar väg (highway) eller gångstig
    // För gång: inkludera footway, path, track, cycleway
    // För bil: endast körbar väg
    const highwayTypes = includeFootpaths
      ? "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|footway|path|track|cycleway|steps"
      : "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service";
    
    const query = `
      [out:json][timeout:8];
      (
        way["highway"~"^(${highwayTypes})$"]
           (${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      );
      out geom;
    `;
    
    try {
      let data: any = null;
      for (const ep of endpoints) {
        try {
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), 9000);
          const response = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal
          });
          clearTimeout(to);
          if (!response.ok) {
            if (isDebug) console.warn(`Overpass API error @${ep}: ${response.status}`);
            continue;
          }
          data = await response.json();
          break;
        } catch (e) {
          console.warn(`Overpass endpoint failed @${ep}:`, e);
          continue;
        }
      }
      if (!data) {
        continue;
      }
      
      if (!data.elements || data.elements.length === 0) {
        if (isDebug) console.log(`Inga ${pathType} hittades inom ${radiusKm}km`);
        continue;
      }
      
      if (isDebug) console.log(`✅ Hittade ${data.elements.length} vägsegment i OSM`);
      
      // Hitta närmaste punkt på alla vägsegment
      let nearestPoint: [number, number] | null = null;
      let shortestDistance = Infinity;
      let bestWayType = 'unknown';
      
      for (const element of data.elements) {
        if (element.type !== 'way' || !element.geometry) continue;
        
        const wayType = element.tags?.highway || 'unknown';
        
        // Gå igenom alla punkter i vägsegmentet
        for (const node of element.geometry) {
          const nodeLng = node.lon;
          const nodeLat = node.lat;
          const distance = haversineDistanceMeters(coord, [nodeLng, nodeLat]);
          
          if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestPoint = [nodeLng, nodeLat];
            bestWayType = wayType;
          }
        }
      }
      
      if (nearestPoint) {
        if (isDebug) console.log(`✅ Närmaste ${includeFootpaths ? 'väg/stig' : 'väg'}: ${Math.round(shortestDistance / 1000)}km (${bestWayType})`);
        const result = {
          point: nearestPoint,
          distance: shortestDistance,
          wayType: bestWayType
        } as { point: [number, number]; distance: number; wayType: string };
        overpassCache.set(key, { ts: now, value: result });
        
        return result;
      }
      
    } catch (error) {
      console.error(`Overpass API fel vid ${radiusKm}km radie:`, error);
      continue;
    }
  }
  
  if (isDebug) console.log(`❌ Kunde inte hitta någon ${includeFootpaths ? 'väg/stig' : 'väg'} via Overpass inom ${maxRadiusKm}km`);
  overpassCache.set(key, { ts: now, value: null });
  return null;
}

/**
 * Routing till den punkt vi hittade via Overpass
 */
async function routeToOverpassPoint(
  profile: string,
  start: [number, number],
  roadPoint: [number, number],
  apiKey: string
): Promise<any | null> {
  
  try {
    const url = `https://api.openrouteservice.org/v2/directions/${profile}/json`;
    const body = {
      coordinates: [start, roadPoint],
      instructions: true,
      radiuses: [-1, -1]
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      console.error('ORS routing till Overpass-punkt misslyckades:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.routes?.[0] || null;
    
  } catch (error) {
    console.error('Fel vid routing till Overpass-punkt:', error);
    return null;
  }
}

function haversineDistanceMeters(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function computeBboxFromCoords(coords: [number, number][]): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

type TerrainProfilePoint = { d: number; z: number; g: number };

async function enrichElevationAndComputeTerrain(
  line: { type: 'LineString'; coordinates: [number, number][] },
  apiKey: string
): Promise<{
  elevationGainMeters: number;
  elevationLossMeters: number;
  netAscentMeters: number;
  maxGradePercent: number;
  profile: TerrainProfilePoint[];
  elevationSource: 'ors' | 'eudem';
  isSteepTerrain: boolean;
} | null> {
  try {
    if (!line.coordinates || line.coordinates.length < 2) return null;
    // Try ORS elevation first
    try {
      const orsUrl = 'https://api.openrouteservice.org/elevation/line';
      const body = { format_in: 'geojson', format_out: 'geojson', geometry: line } as any;
      const res = await fetch(orsUrl, {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        const coords = data?.geometry?.coordinates as number[][] | undefined;
        if (coords && coords.length >= 2) {
          let gain = 0; let loss = 0; let maxGrade = 0; let cum = 0;
          const profile: TerrainProfilePoint[] = [];
          // seed
          profile.push({ d: 0, z: coords[0][2] ?? 0, g: 0 });
          for (let i = 1; i < coords.length; i++) {
            const prev = coords[i - 1];
            const curr = coords[i];
            const dzRaw = (curr[2] ?? 0) - (prev[2] ?? 0);
            const dz = Math.abs(dzRaw) < ELEV_NOISE_M ? 0 : dzRaw;
            const dx = haversineDistanceMeters([prev[0], prev[1]], [curr[0], curr[1]]);
            cum += dx;
            const grade = dx > 0 ? (dz / dx) * 100 : 0;
            maxGrade = Math.max(maxGrade, Math.abs(grade));
            if (dz > 0) gain += dz; else if (dz < 0) loss += -dz;
            profile.push({ d: cum, z: (curr[2] ?? 0), g: grade });
          }
          const distKm = Math.max(cum / 1000, 0.0001);
          const ascentPerKm = gain / distKm;
          const isSteep = (maxGrade >= 20) || (ascentPerKm >= 80) || ((gain - loss) >= 250);
          return {
            elevationGainMeters: gain,
            elevationLossMeters: loss,
            netAscentMeters: (profile[profile.length - 1].z - profile[0].z),
            maxGradePercent: maxGrade,
            profile,
            elevationSource: 'ors',
            isSteepTerrain: isSteep
          };
        }
      }
    } catch {}

    // Fallback: OpenTopoData EU-DEM 25m (no key). Sample along the line (≤100 points)
    const coords = line.coordinates as [number, number][];
    const maxSamples = 80;
    const step = Math.max(1, Math.floor(coords.length / maxSamples));
    const sampled: [number, number][] = [];
    for (let i = 0; i < coords.length; i += step) sampled.push(coords[i]);
    if (sampled[sampled.length - 1] !== coords[coords.length - 1]) sampled.push(coords[coords.length - 1]);
    const locParam = sampled.map(([lng, lat]) => `${lat},${lng}`).join('|');
    const otdUrl = `https://api.opentopodata.org/v1/eudem25m?locations=${encodeURIComponent(locParam)}`;
    const otdRes = await fetch(otdUrl, { method: 'GET' });
    if (!otdRes.ok) return null;
    const otd = await otdRes.json();
    const results = Array.isArray(otd?.results) ? otd.results : [];
    if (results.length < 2) return null;
    let gain = 0; let loss = 0; let maxGrade = 0; let cum = 0;
    const profile: TerrainProfilePoint[] = [];
    profile.push({ d: 0, z: results[0]?.elevation ?? 0, g: 0 });
    for (let i = 1; i < results.length; i++) {
      const prevZ = results[i - 1]?.elevation ?? null;
      const currZ = results[i]?.elevation ?? null;
      if (prevZ == null || currZ == null) continue;
      // approximate distance along source polyline between sampled points
      const a = sampled[i - 1];
      const b = sampled[i];
      const dx = haversineDistanceMeters(a as [number, number], b as [number, number]);
      cum += dx;
      const dzRaw = currZ - prevZ;
      const dz = Math.abs(dzRaw) < ELEV_NOISE_M ? 0 : dzRaw;
      const grade = dx > 0 ? (dz / dx) * 100 : 0;
      maxGrade = Math.max(maxGrade, Math.abs(grade));
      if (dz > 0) gain += dz; else if (dz < 0) loss += -dz;
      profile.push({ d: cum, z: currZ, g: grade });
    }
    const distKm = Math.max(cum / 1000, 0.0001);
    const ascentPerKm = gain / distKm;
    const isSteep = (maxGrade >= 20) || (ascentPerKm >= 80) || ((gain - loss) >= 250);
    return {
      elevationGainMeters: gain,
      elevationLossMeters: loss,
      netAscentMeters: (profile[profile.length - 1].z - profile[0].z),
      maxGradePercent: maxGrade,
      profile,
      elevationSource: 'eudem',
      isSteepTerrain: isSteep
    };
  } catch {
    return null;
  }
}

function createStraightWalkSegment(start: [number, number], end: [number, number]) {
  const distance = haversineDistanceMeters(start, end);
  const walkingSpeedMps = 1.4; // ~5 km/h
  const duration = distance / walkingSpeedMps;
  return {
    geometry: { type: 'LineString' as const, coordinates: [start, end] as [number, number][] },
    segment: { distance, duration, steps: [{ instruction: 'Walk to destination', distance, duration, type: 0, name: '' }] }
  };
}

export async function POST(request: NextRequest) {
  try {
    const { start, end, mode, optimizeAccess } = await request.json();

    if (!start || !end || !Array.isArray(start) || !Array.isArray(end)) {
      return NextResponse.json(
        { error: 'Ogiltiga koordinater' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ORS_API_KEY;
    
    if (!apiKey) {
      console.error('ORS_API_KEY saknas i .env.local');
      return NextResponse.json(
        { error: 'API-nyckel saknas' },
        { status: 500 }
      );
    }

    const transportMode = mode || 'driving-car';
    
    // För BIL/CYKEL: hitta närmaste väg, sen beräkna gång-sträcka automatiskt
    // För GÅNG: direkt till destinationen
    const isVehicle = transportMode === 'driving-car' || transportMode === 'cycling-regular';
    
    if (isVehicle) {
      const enableOptimize = process.env.ROUTING_OPTIMIZE_ACCESS === '1' && optimizeAccess === true;
      // OPTIMIZED ACCESS PIPELINE (optional): evaluate multiple trailhead/parking candidates
      if (enableOptimize) {
        try {
          if (isDebug) console.log('🧭 Optimize access: fetching trail/path candidates via Overpass');

          async function findTrailCandidatesViaOverpass(
            coord: [number, number],
            maxRadiusKm: number = 10,
            maxCandidates: number = 20
          ): Promise<[number, number][]> {
            const [lng, lat] = coord;
            const latDegPerKm = 1 / 110.574;
            const lngDegPerKm = 1 / (111.320 * Math.cos(lat * Math.PI / 180));
            const r = Math.min(maxRadiusKm, 20);
            const bbox = {
              south: lat - r * latDegPerKm,
              north: lat + r * latDegPerKm,
              west: lng - r * lngDegPerKm,
              east: lng + r * lngDegPerKm
            };

            const endpoints = [
              'https://overpass-api.de/api/interpreter',
              'https://overpass.kumi.systems/api/interpreter',
              'https://overpass.openstreetmap.fr/api/interpreter'
            ];

            const query = `
              [out:json][timeout:15];
              (
                way["highway"~"^(path|footway|track)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
                node["highway"="trailhead"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
                node["amenity"~"^(parking|parking_entrance)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
              );
              out geom;
            `;

            let data: any = null;
            for (const ep of endpoints) {
              try {
                const controller = new AbortController();
                const to = setTimeout(() => controller.abort(), 12000);
                const res = await fetch(ep, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: `data=${encodeURIComponent(query)}`,
                  signal: controller.signal
                });
                clearTimeout(to);
                if (!res.ok) {
                  if (isDebug) console.warn(`Overpass candidates error @${ep}: ${res.status}`);
                  continue;
                }
                data = await res.json();
                break;
              } catch (e) {
                if (isDebug) console.warn('Overpass candidates endpoint failed:', e);
              }
            }
            if (!data || !Array.isArray(data.elements)) return [];

            const candidates: [number, number][] = [];

            for (const el of data.elements) {
              if (el.type === 'way' && Array.isArray(el.geometry)) {
                const geom = el.geometry as Array<{ lat: number; lon: number }>;
                // Sample approximately every ~300m by taking every Nth point (heuristic)
                const step = Math.max(1, Math.floor(geom.length / 10));
                for (let i = 0; i < geom.length; i += step) {
                  const p = geom[i];
                  candidates.push([p.lon, p.lat]);
                  if (candidates.length >= maxCandidates) break;
                }
              } else if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
                candidates.push([el.lon, el.lat]);
              }
              if (candidates.length >= maxCandidates) break;
            }

            // Deduplicate by ~30m grid
            const seen = new Set<string>();
            const deduped: [number, number][] = [];
            for (const [cx, cy] of candidates) {
              const k = `${(cx*1000)|0},${(cy*1000)|0}`;
              if (!seen.has(k)) {
                seen.add(k);
                deduped.push([cx, cy]);
              }
            }
            return deduped.slice(0, maxCandidates);
          }

          const candidatePoints = await findTrailCandidatesViaOverpass(end as [number, number], 10, 20);
          if (isDebug) console.log(`Optimize access: ${candidatePoints.length} candidates`);

          // Find a walking target near the water on an actual path/footway
          let walkTargetForEnd: [number, number] = end as [number, number];
          try {
            const destPath = await findNearestRoadViaOverpass(end as [number, number], 150, true);
            if (destPath?.point) {
              walkTargetForEnd = destPath.point as [number, number];
            }
          } catch {}

          type EvalResult = {
            candidate: [number, number];
            vehicleRoute: any | null;
            walkRoute: any | null;
            walkGeom: { type: 'LineString'; coordinates: [number, number][] } | null;
            walkTerrain: { elevationGainMeters: number; elevationLossMeters: number } | null;
            totalDuration: number; // seconds
          };

          const evals: EvalResult[] = [];

          for (const cand of candidatePoints) {
            try {
              // 1) Vehicle leg
              const vehUrl = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
              const vehBody = { coordinates: [start, cand], instructions: true, radiuses: [-1, -1] };
              const vehRes = await fetch(vehUrl, { method: 'POST', headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(vehBody) });
              if (!vehRes.ok) continue;
              const vehData = await vehRes.json();
              const vehRoute = vehData.routes?.[0];
              if (!vehRoute) continue;

              // 2) Walk leg (from candidate to end)
              const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
              const walkBody = { coordinates: [cand, walkTargetForEnd], instructions: true, language: 'sv', radiuses: [-1, -1] };
              const walkRes = await fetch(walkUrl, { method: 'POST', headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(walkBody) });
              if (!walkRes.ok) continue;
              const walkData = await walkRes.json();
              const walkRoute = walkData.routes?.[0];
              if (!walkRoute) continue;

              let walkGeom = normalizeRouteGeometry(walkRoute);
              // Sanity: ensure walk end is close to water target; if far, try Overpass reroute
              try {
                const walkEnd = walkGeom.coordinates[walkGeom.coordinates.length - 1];
                const endGap = haversineDistanceMeters(walkEnd as [number, number], end as [number, number]);
                const dirDist = haversineDistanceMeters(cand as [number, number], end as [number, number]);
                const orsDist = walkRoute.summary?.distance || Infinity;
                if (endGap > 2000 || (isFinite(orsDist) && dirDist > 0 && (orsDist / dirDist) > 5)) {
                  const pathPoint = await findNearestRoadViaOverpass(end as [number, number], 50, true);
                  if (pathPoint) {
                    const rer = await routeToOverpassPoint('foot-walking', cand as [number, number], pathPoint.point, apiKey);
                    if (rer) walkGeom = normalizeRouteGeometry(rer);
                  }
                }
              } catch {}
              const walkTerrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
              const baseWalk = walkRoute.summary?.duration || 0;
              const adjustedWalk = walkTerrain ? calculateElevationAdjustedTime(baseWalk, walkTerrain.elevationGainMeters, walkTerrain.elevationLossMeters) : baseWalk;
              const total = (vehRoute.summary?.duration || 0) + adjustedWalk;

              evals.push({ candidate: cand, vehicleRoute: vehRoute, walkRoute, walkGeom, walkTerrain, totalDuration: total });
            } catch {}
            if (evals.length >= 10) break; // hard limit to control cost
          }

          if (evals.length > 0) {
            evals.sort((a, b) => a.totalDuration - b.totalDuration);
            const best = evals[0];

            // Trim vehicle to meet walk start
            let vehicleGeom = normalizeRouteGeometry(best.vehicleRoute);
            try {
              const joinPoint = best.walkGeom!.coordinates[0];
              let idxBest = vehicleGeom.coordinates.length - 1;
              let bestD = Infinity;
              for (let i = 0; i < vehicleGeom.coordinates.length; i++) {
                const d = haversineDistanceMeters(vehicleGeom.coordinates[i] as [number, number], joinPoint as [number, number]);
                if (d < bestD) { bestD = d; idxBest = i; }
              }
              if (bestD <= JOIN_TRIM_THRESHOLD_M) {
                const trimmed = vehicleGeom.coordinates.slice(0, Math.max(1, idxBest + 1));
                trimmed[trimmed.length - 1] = joinPoint as [number, number];
                vehicleGeom = { type: 'LineString', coordinates: trimmed } as any;
              }
            } catch {}

            const combinedCoords = [...vehicleGeom.coordinates, ...best.walkGeom!.coordinates.slice(1)];
            const bbox = computeBboxFromCoords(combinedCoords);
            const combinedRoute: any = {
              ...best.vehicleRoute,
              geometry: { type: 'LineString', coordinates: combinedCoords },
              partialGeometries: { vehicle: vehicleGeom, walk: best.walkGeom },
              segments: [
                ...((best.vehicleRoute.segments as any[]) || []),
                ...((best.walkRoute.segments as any[]) || [])
              ],
              summary: {
                distance: (best.vehicleRoute.summary?.distance || 0) + (best.walkRoute.summary?.distance || 0),
                duration: (best.vehicleRoute.summary?.duration || 0) + (best.totalDuration - (best.vehicleRoute.summary?.duration || 0))
              },
              distanceRoadToWaterMeters: best.walkRoute.summary?.distance || 0,
              walkDurationSeconds: best.totalDuration - (best.vehicleRoute.summary?.duration || 0),
              terrain: best.walkTerrain,
              bbox
            };
            return NextResponse.json({ routes: [combinedRoute], metadata: {} });
          }
        } catch (e) {
          if (isDebug) console.warn('Optimize access pipeline failed, falling back:', e);
        }
      }
      // MULTIMODAL: Bil/cykel + gång
      // 0. Förbered: hitta närmaste gångväg och körbar accesspunkt nära målet
      let preparedWalkTarget: [number, number] = end as [number, number];
      let preparedAccessPoint: [number, number] | null = null;
      try {
        const destPathPrep = await findNearestRoadViaOverpass(end as [number, number], 150, true);
        if (destPathPrep) {
          preparedWalkTarget = destPathPrep.point as [number, number];
          const roadAccPrep = await findNearestRoadViaOverpass(preparedWalkTarget, 10, false);
          if (roadAccPrep) preparedAccessPoint = roadAccPrep.point as [number, number];
        }
      } catch {}

      // 1. Försök ORS vehicle routing direkt till accesspunkten (om hittad), annars till gångmålet
      const vehicleTargetPoint = (preparedAccessPoint || preparedWalkTarget) as [number, number];
      const vehicleUrl = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
      const vehicleBody = {
        coordinates: [start, vehicleTargetPoint],
        instructions: true,
        radiuses: [-1, -1] // Ingen snapping
      };

      if (isDebug) console.log('🚗 Försöker normal ORS vehicle routing...');
      
      const vehicleResponse = await fetch(vehicleUrl, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(vehicleBody)
      });

      let vehicleRoute = null;
      let usedOverpass = false;

      if (vehicleResponse.ok) {
        const vehicleData = await vehicleResponse.json();
        vehicleRoute = vehicleData.routes?.[0];
        if (isDebug) console.log('✅ ORS vehicle routing lyckades');
      } else {
        // ORS misslyckades - försök med Overpass
        const errorText = await vehicleResponse.text();
        if (isDebug) console.log('⚠️ ORS vehicle routing misslyckades:', errorText);
        
        if (errorText.includes('Could not find routable point')) {
          if (isDebug) console.log('🗺️  Använder Overpass API som fallback...');
          // Hitta närmaste körbara väg nära destinationen
          const endRoad = await findNearestRoadViaOverpass(end as [number, number], 150, false);
          // Hitta närmaste körbara väg nära start (om användaren står utanför vägnätet)
          const startRoad = await findNearestRoadViaOverpass(start as [number, number], 50, false);

          if (endRoad) {
            if (isDebug) console.log(`✅ OSM: ${endRoad.wayType} ${Math.round(endRoad.distance / 1000)}km från sjön`);
            const fromPoint = (startRoad?.point as [number, number]) || (start as [number, number]);
            vehicleRoute = await routeToOverpassPoint(transportMode, fromPoint, endRoad.point, apiKey);
            // Om det fortfarande fallerar, försök även att börja på startRoad → endRoad
            if (!vehicleRoute && startRoad) {
              vehicleRoute = await routeToOverpassPoint(transportMode, startRoad.point as [number, number], endRoad.point as [number, number], apiKey);
            }
            usedOverpass = !!vehicleRoute;
          }
        }
      }
      
      if (!vehicleRoute) {
        if (isDebug) console.log('❌ Kunde inte hitta fordonväg - fallback till gång');
        // Fallback till pure walking
        const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
        const walkBody = {
          coordinates: [start, end],
          instructions: true,
          language: 'sv',
          radiuses: [-1, -1],
          elevation: true
        };

        const walkResponse = await fetch(walkUrl, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(walkBody)
        });
        
        if (walkResponse.ok) {
          const walkData = await walkResponse.json();
          const wr = walkData.routes?.[0];
          if (wr) {
            const geometry = normalizeRouteGeometry(wr);
            const terrain = await enrichElevationAndComputeTerrain(geometry, apiKey);
            
            let adjustedDuration = wr.summary?.duration || 0;
            if (terrain) {
              adjustedDuration = calculateElevationAdjustedTime(
                wr.summary?.duration || 0,
                terrain.elevationGainMeters,
                terrain.elevationLossMeters
              );
            }
            
            const enriched = {
              ...wr,
              geometry,
              summary: {
                distance: wr.summary?.distance || 0,
                duration: adjustedDuration
              },
              distanceRoadToWaterMeters: wr.summary?.distance,
              walkDurationSeconds: adjustedDuration,
              terrain
            } as any;
            return NextResponse.json({ routes: [enriched], metadata: walkData.metadata });
          }
        }
        
        // Ultimate fallback: straight line with elevation
        const { geometry: straightGeom, segment } = createStraightWalkSegment(start as [number, number], end as [number, number]);
        const terrain = await enrichElevationAndComputeTerrain(straightGeom, apiKey);
        let adjustedDuration = segment.duration;
        if (terrain) {
          adjustedDuration = calculateElevationAdjustedTime(segment.duration, terrain.elevationGainMeters, terrain.elevationLossMeters);
        }
        
        const bbox = computeBboxFromCoords(straightGeom.coordinates);
        return NextResponse.json({ 
          routes: [{
            geometry: straightGeom,
            segments: [{ distance: segment.distance, duration: adjustedDuration, steps: segment.steps }],
            summary: { distance: segment.distance, duration: adjustedDuration },
            distanceRoadToWaterMeters: segment.distance,
            walkDurationSeconds: adjustedDuration,
            terrain,
            bbox
          }], 
          metadata: {} 
        });
      }
      
      // Nu har vi en vehicleRoute (antingen från ORS eller via Overpass)
      
      const vehicleGeom = normalizeRouteGeometry(vehicleRoute);
      if (isDebug) console.log('🚗 Bilrutt klar, beräknar gång-sträcka...');

      // 2. Beräkna gång-sträcka: hitta fotledens access via körbar väg nära stigen
        const vehicleEndPoint = vehicleGeom.coordinates[vehicleGeom.coordinates.length - 1];

        const walkUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
        // Hitta stigpunkt vid målet samt närmaste KÖRBARA väg till den (accesspunkt)
        let targetForWalk: [number, number] = end as [number, number];
        let walkStartPoint: [number, number] = vehicleEndPoint as [number, number];
        try {
          const destPath = await findNearestRoadViaOverpass(end as [number, number], 150, true);
          if (destPath) {
            targetForWalk = destPath.point as [number, number];
            try {
              const roadAccess = await findNearestRoadViaOverpass(destPath.point as [number, number], 5, false);
              if (roadAccess) {
                walkStartPoint = roadAccess.point as [number, number];
              }
            } catch {}
          }
        } catch {}
        const walkBody = {
          coordinates: [walkStartPoint, targetForWalk],
          instructions: true,
          language: 'sv',
          radiuses: [-1, -1],
          elevation: true
        };

        if (isDebug) console.log('🚶 Walking routing (steg 2):', { from: walkStartPoint, to: end });

        const walkResponse = await fetch(walkUrl, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(walkBody)
        });

        if (walkResponse.ok) {
          const walkData = await walkResponse.json();
          let walkRoute = walkData.routes[0];
          
          // Sanity-koll för gång-delen (som i rena gångfallet)
          try {
            if (walkRoute) {
              const walkGeomTmp = normalizeRouteGeometry(walkRoute);
              const walkEndTmp = walkGeomTmp.coordinates[walkGeomTmp.coordinates.length - 1];
              const endGapTmp = haversineDistanceMeters(walkEndTmp as [number, number], end as [number, number]);
              const directTmp = haversineDistanceMeters(vehicleEndPoint as [number, number], end as [number, number]);
              const orsDistTmp = walkRoute.summary?.distance || Infinity;
              const tooFarFromEnd = endGapTmp > 2000; // >2 km
              const suspiciouslyLong = isFinite(orsDistTmp) && directTmp > 0 && (orsDistTmp / directTmp) > 5;
              if (tooFarFromEnd || suspiciouslyLong) {
                if (isDebug) console.log(`⚠️ Gång-del av multimodal verkar fel: gap ${Math.round(endGapTmp)}m, ratio ${((orsDistTmp/directTmp)||0).toFixed(1)}x. Overpass-fallback...`);
                const pathPoint = await findNearestRoadViaOverpass(end as [number, number], 50, true);
                if (pathPoint) {
                  const rerouted = await routeToOverpassPoint('foot-walking', vehicleEndPoint as [number, number], pathPoint.point, apiKey);
                  if (rerouted) walkRoute = rerouted;
                }
              }
            }
          } catch {}

          // 3. Trimma bil-delen till gångens start ENDAST om gapet är litet
          let vehicleGeom = normalizeRouteGeometry(vehicleRoute);
          const walkGeom = normalizeRouteGeometry(walkRoute);
          const walkStart = walkGeom.coordinates[0];
          try {
            // Hitta närmaste punkt i bil-geometrin till gångens start
            let idxBest = vehicleGeom.coordinates.length - 1;
            let best = Infinity;
            for (let i = 0; i < vehicleGeom.coordinates.length; i++) {
              const d = haversineDistanceMeters(vehicleGeom.coordinates[i] as [number, number], walkStart as [number, number]);
              if (d < best) { best = d; idxBest = i; }
            }
            if (best <= JOIN_TRIM_THRESHOLD_M) {
              const trimmed = vehicleGeom.coordinates.slice(0, Math.max(1, idxBest + 1));
              trimmed[trimmed.length - 1] = walkStart as [number, number];
              vehicleGeom = { type: 'LineString', coordinates: trimmed } as any;
              vehicleRoute = { ...vehicleRoute, geometry: vehicleGeom };
            } else {
              // Beräkna access-walk från vehicle end till walk start via ORS foot-walking
              try {
                const vehEnd = vehicleGeom.coordinates[vehicleGeom.coordinates.length - 1] as [number, number];
                const awUrl = 'https://api.openrouteservice.org/v2/directions/foot-walking/json';
                const awBody = { coordinates: [vehEnd, walkStart], instructions: true, language: 'sv', radiuses: [-1, -1] };
                const awRes = await fetch(awUrl, { method: 'POST', headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(awBody) });
                if (awRes.ok) {
                  const awData = await awRes.json();
                  const awRoute = awData.routes?.[0];
                  if (awRoute) {
                    const awGeom = normalizeRouteGeometry(awRoute);
                    // Kombinera: vehicle + access-walk + main-walk
                    const combinedCoords = [...vehicleGeom.coordinates, ...awGeom.coordinates.slice(1), ...walkGeom.coordinates.slice(1)];
                    const bbox = computeBboxFromCoords(combinedCoords);
                    const pathTerrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
                    let adjustedWalkDuration = walkRoute.summary.duration;
                    if (pathTerrain) {
                      adjustedWalkDuration = calculateElevationAdjustedTime(adjustedWalkDuration, pathTerrain.elevationGainMeters, pathTerrain.elevationLossMeters);
                    }
                    const combinedRoute: any = {
                      ...vehicleRoute,
                      geometry: { type: 'LineString', coordinates: combinedCoords },
                      partialGeometries: { vehicle: vehicleGeom, walk: walkGeom },
                      segments: [
                        ...((vehicleRoute.segments as any[]) || []),
                        ...((awRoute.segments as any[]) || []),
                        ...((walkRoute.segments as any[]) || [])
                      ],
                      summary: {
                        distance: (vehicleRoute.summary?.distance || 0) + (awRoute.summary?.distance || 0) + (walkRoute.summary?.distance || 0),
                        duration: (vehicleRoute.summary?.duration || 0) + (awRoute.summary?.duration || 0) + adjustedWalkDuration
                      },
                      distanceRoadToWaterMeters: (awRoute.summary?.distance || 0) + (walkRoute.summary?.distance || 0),
                      walkDurationSeconds: (awRoute.summary?.duration || 0) + adjustedWalkDuration,
                      terrain: pathTerrain,
                      bbox
                    };
                    return NextResponse.json({ routes: [combinedRoute], metadata: {} });
                  }
                }
              } catch {}
            }
          } catch {}

          // Terräng för huvudsakliga gång-delen
          const pathTerrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
          let adjustedWalkDuration = walkRoute.summary.duration;
          if (pathTerrain && (pathTerrain.elevationGainMeters > 0 || pathTerrain.elevationLossMeters > 0)) {
            adjustedWalkDuration = calculateElevationAdjustedTime(
              walkRoute.summary.duration,
              pathTerrain.elevationGainMeters,
              pathTerrain.elevationLossMeters
            );
            if (isDebug) console.log(`⛰️ Elevation-justerad gångtid: ${walkRoute.summary.duration}s → ${adjustedWalkDuration}s`);
          }

          // Kombinera utan någon extra rak slutbit – gångvägen går ända till vattnet
          const combinedCoords = [...vehicleGeom.coordinates, ...walkGeom.coordinates.slice(1)];
          const bbox = computeBboxFromCoords(combinedCoords);

          const combinedRoute: any = {
            ...vehicleRoute,
            geometry: { type: 'LineString', coordinates: combinedCoords },
            partialGeometries: { vehicle: vehicleGeom, walk: walkGeom },
            segments: [
              ...vehicleRoute.segments,
              ...walkRoute.segments
            ],
            summary: {
              distance: vehicleRoute.summary.distance + walkRoute.summary.distance,
              duration: vehicleRoute.summary.duration + adjustedWalkDuration
            },
            distanceRoadToWaterMeters: walkRoute.summary?.distance || 0,
            walkDurationSeconds: adjustedWalkDuration,
            terrain: pathTerrain,
            bbox
          };

          if (isDebug) console.log('✅ Multimodal route:', {
            vehicleDistance: vehicleRoute.summary.distance,
            walkDistance: walkRoute.summary.distance,
            total: combinedRoute.summary.distance
          });

          return NextResponse.json({ routes: [combinedRoute], metadata: {} });
        } else {
          // Om gång-rutten misslyckas, försök Overpass-fallback via accesspunkt vid stigen
          const pathPoint = await findNearestRoadViaOverpass(end as [number, number], 150, true);
          let accessPoint = vehicleEndPoint as [number, number];
          if (pathPoint) {
            try {
              const roadAccess = await findNearestRoadViaOverpass(pathPoint.point as [number, number], 5, false);
              if (roadAccess) accessPoint = roadAccess.point as [number, number];
            } catch {}
            const walkToPath = await routeToOverpassPoint('foot-walking', accessPoint as [number, number], pathPoint.point, apiKey);
            if (walkToPath) {
              // Rerouta fordon till accesspunkten om nödvändigt
              let vehicleGeom = normalizeRouteGeometry(vehicleRoute);
              const vehEnd = vehicleGeom.coordinates[vehicleGeom.coordinates.length - 1];
              if (haversineDistanceMeters(vehEnd as [number, number], accessPoint as [number, number]) > 10) {
                try {
                  const vresp = await fetch(`https://api.openrouteservice.org/v2/directions/${transportMode}/json`, {
                    method: 'POST',
                    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ coordinates: [start, accessPoint], instructions: true, radiuses: [-1, -1] })
                  });
                  if (vresp.ok) {
                    const rd = await vresp.json();
                    const r = rd.routes?.[0];
                    if (r) {
                      vehicleRoute = r;
                      vehicleGeom = normalizeRouteGeometry(r);
                    }
                  }
                } catch {}
              }
              let walkGeom = normalizeRouteGeometry(walkToPath);
              // Try trim only if the gap is tiny; otherwise keep separate
              try {
                const joinPoint = walkGeom.coordinates[0];
                let idxBest = vehicleGeom.coordinates.length - 1;
                let best = Infinity;
                for (let i = 0; i < vehicleGeom.coordinates.length; i++) {
                  const d = haversineDistanceMeters(vehicleGeom.coordinates[i] as [number, number], joinPoint as [number, number]);
                  if (d < best) { best = d; idxBest = i; }
                }
                if (best <= JOIN_TRIM_THRESHOLD_M) {
                  const trimmed = vehicleGeom.coordinates.slice(0, Math.max(1, idxBest + 1));
                  trimmed[trimmed.length - 1] = joinPoint as [number, number];
                  vehicleGeom = { type: 'LineString', coordinates: trimmed } as any;
                }
              } catch {}
              const pathTerrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
              let adjustedWalkDur = walkToPath.summary?.duration || 0;
              if (pathTerrain) {
                adjustedWalkDur = calculateElevationAdjustedTime(adjustedWalkDur, pathTerrain.elevationGainMeters, pathTerrain.elevationLossMeters);
              }
              const coords = [...vehicleGeom.coordinates, ...walkGeom.coordinates.slice(1)];
              const bbox = computeBboxFromCoords(coords);
              const combinedRoute: any = {
                ...vehicleRoute,
                geometry: { type: 'LineString', coordinates: coords },
                partialGeometries: { vehicle: vehicleGeom, walk: walkGeom },
                segments: [
                  ...((vehicleRoute.segments as any[]) || []),
                  ...((walkToPath.segments as any[]) || [])
                ],
                summary: {
                  distance: (vehicleRoute.summary?.distance || 0) + (walkToPath.summary?.distance || 0),
                  duration: (vehicleRoute.summary?.duration || 0) + adjustedWalkDur
                },
                distanceRoadToWaterMeters: walkToPath.summary?.distance || 0,
                walkDurationSeconds: adjustedWalkDur,
                terrain: pathTerrain,
                bbox
              };
              if (isDebug) console.log('✅ Multimodal with Overpass walking fallback');
              return NextResponse.json({ routes: [combinedRoute], metadata: {} });
            }
          }

          // Sista utväg: rak linje
          let vehicleGeom = normalizeRouteGeometry(vehicleRoute);
          const { geometry: straightWalkGeom, segment: straightWalkSeg } = createStraightWalkSegment(vehicleEndPoint as [number, number], end as [number, number]);
          const terrain = await enrichElevationAndComputeTerrain(straightWalkGeom, apiKey);
          let adjustedWalkDuration = straightWalkSeg.duration;
          if (terrain) {
            adjustedWalkDuration = calculateElevationAdjustedTime(
              straightWalkSeg.duration,
              terrain.elevationGainMeters,
              terrain.elevationLossMeters
            );
          }
          // Only trim if virtually touching
          try {
            const joinPoint = straightWalkGeom.coordinates[0];
            let idxBest = vehicleGeom.coordinates.length - 1;
            let best = Infinity;
            for (let i = 0; i < vehicleGeom.coordinates.length; i++) {
              const d = haversineDistanceMeters(vehicleGeom.coordinates[i] as [number, number], joinPoint as [number, number]);
              if (d < best) { best = d; idxBest = i; }
            }
            if (best <= JOIN_TRIM_THRESHOLD_M) {
              const trimmed = vehicleGeom.coordinates.slice(0, Math.max(1, idxBest + 1));
              trimmed[trimmed.length - 1] = joinPoint as [number, number];
              vehicleGeom = { type: 'LineString', coordinates: trimmed } as any;
            }
          } catch {}
          const combinedCoords = [...vehicleGeom.coordinates, ...straightWalkGeom.coordinates.slice(1)];
          const bbox = computeBboxFromCoords(combinedCoords);
          const combinedRoute: any = {
            ...vehicleRoute,
            geometry: { type: 'LineString', coordinates: combinedCoords },
            partialGeometries: { vehicle: vehicleGeom, walk: straightWalkGeom },
            segments: [
              ...((vehicleRoute.segments as any[]) || []),
              { distance: straightWalkSeg.distance, duration: adjustedWalkDuration, steps: straightWalkSeg.steps }
            ],
            summary: {
              distance: (vehicleRoute.summary?.distance || 0) + straightWalkSeg.distance,
              duration: (vehicleRoute.summary?.duration || 0) + adjustedWalkDuration
            },
            distanceRoadToWaterMeters: straightWalkSeg.distance,
            walkDurationSeconds: adjustedWalkDuration,
            terrain,
            bbox
          };
          if (isDebug) console.log('✅ Multimodal with straight walk fallback (with elevation)');
          return NextResponse.json({ routes: [combinedRoute], metadata: {} });
        }
    } // Slut på isVehicle
    
    // För GÅNG: EXAKT samma logik som bil/cykel
    // 1. Försök ORS routing
    const walkUrl = `https://api.openrouteservice.org/v2/directions/${transportMode}/json`;
    const walkBody = {
      coordinates: [start, end],
      instructions: true,
      radiuses: [-1, -1],
      elevation: true
    };

    if (isDebug) console.log('🚶 Walking routing request...');

    const walkResponse = await fetch(walkUrl, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(walkBody)
    });

    let walkRoute = null as any;

    if (walkResponse.ok) {
      const walkData = await walkResponse.json();
      walkRoute = walkData.routes?.[0];
      if (isDebug) console.log('✅ ORS walking routing lyckades');

      // Sanity-koll: om ORS slutpunkt är långt från vår verkliga destination (strand)
      // så har ORS snappat till en felaktig punkt. Då gör vi Overpass-fallback.
      try {
        if (walkRoute) {
          const geom = normalizeRouteGeometry(walkRoute);
          const last = geom.coordinates[geom.coordinates.length - 1];
          const endPoint = end as [number, number];
          const endGap = haversineDistanceMeters(last, endPoint);
          const direct = haversineDistanceMeters(start as [number, number], endPoint);
          const orsDistance = walkRoute.summary?.distance || Infinity;

          const tooFarFromEnd = endGap > 2000; // >2 km från stranden betraktas som fel snapping
          const suspiciouslyLong = isFinite(orsDistance) && direct > 0 && (orsDistance / direct) > 5; // >5x fågelvägen

          if (tooFarFromEnd || suspiciouslyLong) {
            if (isDebug) console.log(`⚠️ ORS walking slutpunkt ${Math.round(endGap)}m från mål eller misstänkt lång (${Math.round(orsDistance/1000)}km för ${Math.round(direct/1000)}km fågelvägen). Försöker Overpass...`);
            const pathPoint = await findNearestRoadViaOverpass(end as [number, number], 50, true);
            if (pathPoint) {
              const rerouted = await routeToOverpassPoint(transportMode, start as [number, number], pathPoint.point, apiKey);
              if (rerouted) {
                walkRoute = rerouted; // Ersätt rutt med säkert mål nära vattnet
              } else {
                // Vi låter walkRoute stå kvar och hanterar rak linje nedan
              }
            }
          }
        }
      } catch (e) {
        console.warn('Sanity-koll för gång misslyckades:', e);
      }
    } else {
      // ORS misslyckades - försök med Overpass (SAMMA SOM BIL/CYKEL)
      const errorText = await walkResponse.text();
      if (isDebug) console.log('⚠️ ORS walking routing misslyckades:', errorText);
      
      if (errorText.includes('Could not find routable point')) {
        if (isDebug) console.log('🗺️  Använder Overpass API för att hitta gångväg...');
        const pathPoint = await findNearestRoadViaOverpass(end as [number, number], 50, true); // includeFootpaths = true
        
        if (pathPoint) {
          if (isDebug) console.log(`✅ OSM: ${pathPoint.wayType} ${Math.round(pathPoint.distance / 1000)}km från sjön`);
          walkRoute = await routeToOverpassPoint(transportMode, start as [number, number], pathPoint.point, apiKey);
        }
      }
    }
    
    if (!walkRoute) {
      if (isDebug) console.log('❌ Kunde inte hitta gångväg - fallback till rak linje');
      const { geometry: straightGeom, segment } = createStraightWalkSegment(start as [number, number], end as [number, number]);
      const terrain = await enrichElevationAndComputeTerrain(straightGeom, apiKey);
      let adjustedDuration = segment.duration;
      if (terrain) {
        adjustedDuration = calculateElevationAdjustedTime(segment.duration, terrain.elevationGainMeters, terrain.elevationLossMeters);
      }
      const bbox = computeBboxFromCoords(straightGeom.coordinates);
      const route: any = {
        geometry: straightGeom,
        segments: [{ distance: segment.distance, duration: adjustedDuration, steps: segment.steps }],
        summary: { distance: segment.distance, duration: adjustedDuration },
        distanceRoadToWaterMeters: segment.distance,
        walkDurationSeconds: adjustedDuration,
        terrain,
        bbox,
        isDirectPath: true
      };
      return NextResponse.json({ routes: [route], metadata: {} });
    }
    
    // Nu har vi en walkRoute – använd den direkt utan rak slutbit
    const walkGeom = normalizeRouteGeometry(walkRoute);
    const pathTerrain = await enrichElevationAndComputeTerrain(walkGeom, apiKey);
    let adjustedPathDuration = walkRoute.summary?.duration || 0;
    if (pathTerrain) {
      adjustedPathDuration = calculateElevationAdjustedTime(
        walkRoute.summary?.duration || 0,
        pathTerrain.elevationGainMeters,
        pathTerrain.elevationLossMeters
      );
    }
    const bbox = computeBboxFromCoords(walkGeom.coordinates);
    const routeOnlyWalk: any = {
      geometry: walkGeom,
      partialGeometries: { walk: walkGeom },
      segments: [...(walkRoute.segments || [])],
      summary: { distance: walkRoute.summary?.distance || 0, duration: adjustedPathDuration },
      distanceRoadToWaterMeters: walkRoute.summary?.distance || 0,
      walkDurationSeconds: adjustedPathDuration,
      terrain: pathTerrain,
      bbox
    };
    if (isDebug) console.log('✅ Walking route (direkt, utan rak slutbit)');
    return NextResponse.json({ routes: [routeOnlyWalk], metadata: {} });
  } catch (error) {
    console.error('Routing API error:', error);
    return NextResponse.json(
      { error: 'Serverfel vid hämtning av rutt' },
      { status: 500 }
    );
  }
}

