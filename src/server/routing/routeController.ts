import * as turf from '@turf/turf';
import { orsDirections, orsMatrix } from './orsClient';
import { findNearestHighway, getAccessCandidates, getMotorableWaysBBox } from './overpassClient';
import { sampleElevationOpenTopoData } from './demSampler';
import { computeGradeBins, computeRobustMax } from '../utils/computeTerrain';
import { naismithSeconds } from '../utils/naismith';
import { toblerSeconds } from '../utils/tobler';
import { Coordinate, RouteOutput } from '@/shared/types';
import { buildHikeGraphAround, aStarPath } from './hikeGraph';
import { PENALTIES, DETOUR_EFFICIENCY_THRESHOLD } from '@/shared/constants';

function haversine(a: Coordinate, b: Coordinate): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

function bboxFromCoords(coords: Coordinate[]): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

function lineLength(coords: Coordinate[]): number {
  let sum = 0; for (let i = 1; i < coords.length; i++) sum += haversine(coords[i - 1], coords[i]); return sum;
}

function overlapShareFirst2km(walk: Coordinate[], vehicle: Coordinate[]): number {
  if (walk.length < 2 || vehicle.length < 2) return 0;
  const targetLen = 2000; // meters
  // slice first ~2km from walk by accumulating
  const sliced: Coordinate[] = [walk[0]];
  let cum = 0;
  for (let i = 1; i < walk.length && cum < targetLen; i++) {
    const d = haversine(walk[i - 1], walk[i]);
    cum += d; sliced.push(walk[i]);
  }
  if (sliced.length < 2) return 0;
  const vehLine = turf.lineString(vehicle as any);
  // sample every ~25m along sliced
  const step = 25; const samples: Coordinate[] = [];
  let acc = 0; samples.push(sliced[0]);
  for (let i = 1; i < sliced.length; i++) {
    const seg = haversine(sliced[i - 1], sliced[i]);
    let remain = seg; let from = sliced[i - 1];
    while (acc + remain >= step) {
      const t = (step - acc) / seg; // fraction along segment
      const x = from[0] + (sliced[i][0] - from[0]) * t;
      const y = from[1] + (sliced[i][1] - from[1]) * t;
      samples.push([x, y]);
      remain = acc + remain - step; acc = 0; from = [x, y];
    }
    acc += remain;
  }
  let close = 0;
  for (const p of samples) {
    const snapped: any = turf.nearestPointOnLine(vehLine as any, turf.point(p) as any, { units: 'meters' } as any);
    const d = snapped?.properties?.dist ?? turf.distance(turf.point(p) as any, snapped as any, { units: 'meters' } as any);
    if (typeof d === 'number' && d <= 8) close++;
  }
  return samples.length > 0 ? close / samples.length : 0;
}

function averageHeadingToGoalFirstKm(walk: Coordinate[], goal: Coordinate, distLimit = 2000): number {
  if (walk.length < 2) return 1;
  // compute projection of step vectors onto goal vector; return mean sign
  const goalVec = [goal[0] - walk[0][0], goal[1] - walk[0][1]];
  const goalLen = Math.hypot(goalVec[0], goalVec[1]) || 1;
  const ux = goalVec[0] / goalLen; const uy = goalVec[1] / goalLen;
  let cum = 0; let projSum = 0; let count = 0;
  for (let i = 1; i < walk.length && cum < distLimit; i++) {
    const step = [walk[i][0] - walk[i - 1][0], walk[i][1] - walk[i - 1][1]];
    const stepLenM = haversine(walk[i - 1], walk[i]);
    cum += stepLenM;
    const stepLen = Math.hypot(step[0], step[1]) || 1;
    const sx = step[0] / stepLen; const sy = step[1] / stepLen;
    projSum += (sx * ux + sy * uy);
    count++;
  }
  return count ? projSum / count : 1;
}

function estimateRoadShareOnWalk(walk: Coordinate[]): number {
  if (walk.length < 2) return 0;
  // Build bbox and fetch motorable ways to approximate
  const bbox = bboxFromCoords(walk);
  const latSpan = Math.max(0.02, bbox[3] - bbox[1]);
  const lngSpan = Math.max(0.02, bbox[2] - bbox[0]);
  const ext = { south: bbox[1] - latSpan * 0.1, west: bbox[0] - lngSpan * 0.1, north: bbox[3] + latSpan * 0.1, east: bbox[2] + lngSpan * 0.1 };
  const vehLinesPromise = getMotorableWaysBBox(ext);
  // NOTE: This is async in the caller; here we just declare helper
  return 0;
}

async function computeRoadShare(walk: Coordinate[]): Promise<number> {
  if (walk.length < 2) return 0;
  const bbox = bboxFromCoords(walk);
  const latSpan = Math.max(0.02, bbox[3] - bbox[1]);
  const lngSpan = Math.max(0.02, bbox[2] - bbox[0]);
  const ext = { south: bbox[1] - latSpan * 0.1, west: bbox[0] - lngSpan * 0.1, north: bbox[3] + latSpan * 0.1, east: bbox[2] + lngSpan * 0.1 };
  const vehLines = await getMotorableWaysBBox(ext);
  if (!vehLines.length) return 0;
  const vehMulti = turf.multiLineString(vehLines as any);
  // sample walk every 20m
  const samples: Coordinate[] = [];
  const step = 20;
  let acc = 0; samples.push(walk[0]);
  for (let i = 1; i < walk.length; i++) {
    const seg = haversine(walk[i - 1], walk[i]);
    let remain = seg; let from = walk[i - 1];
    while (acc + remain >= step) {
      const t = (step - acc) / seg; const x = from[0] + (walk[i][0] - from[0]) * t; const y = from[1] + (walk[i][1] - from[1]) * t;
      samples.push([x, y]); remain = acc + remain - step; acc = 0; from = [x, y];
    }
    acc += remain;
  }
  let onRoad = 0;
  for (const p of samples) {
    const snapped: any = turf.nearestPointOnLine(vehMulti as any, turf.point(p) as any, { units: 'meters' } as any);
    const d = snapped?.properties?.dist ?? turf.distance(turf.point(p) as any, snapped as any, { units: 'meters' } as any);
    if (typeof d === 'number' && d <= 6) onRoad++;
  }
  return samples.length ? onRoad / samples.length : 0;
}

function adaptiveThresholds(start: Coordinate, end: Coordinate, context: 'urban' | 'semi' | 'mountain' | 'trail'): { endGap: number; lengthRatio: number; overlapShare: number; overlapDistM: number } {
  const crow = haversine(start, end);
  const endGap = Math.max(1000, 0.2 * crow);
  let lengthRatio = crow > 15000 ? 2.5 : 2.0;
  let overlapShare = context === 'trail' ? 0.6 : (context === 'mountain' ? 0.35 : 0.45);
  const overlapDistM = context === 'urban' ? 12 : 8;
  return { endGap, lengthRatio, overlapShare, overlapDistM };
}

function isWalkInvalidWithContext(walk: Coordinate[], vehicle: Coordinate[], goal: Coordinate, thresholds: { endGap: number; lengthRatio: number; overlapShare: number; overlapDistM: number }): { invalid: boolean; reason: string } {
  if (walk.length < 2) return { invalid: true, reason: 'walk_empty' };
  const endGap = haversine(walk[walk.length - 1], goal);
  if (endGap > thresholds.endGap) return { invalid: true, reason: 'end_gap_adaptive' };
  const direct = haversine(vehicle[vehicle.length - 1] || walk[0], goal);
  const wlen = lineLength(walk);
  if (direct > 0 && (wlen / direct) > thresholds.lengthRatio) return { invalid: true, reason: 'walk_length_adaptive' };
  const share = overlapShareFirst2km(walk, vehicle);
  if (share > thresholds.overlapShare) return { invalid: true, reason: 'overlap_adaptive' };
  const heading = averageHeadingToGoalFirstKm(walk, goal, 2000);
  if (heading < 0) return { invalid: true, reason: 'heading_away' };
  return { invalid: false, reason: '' };
}


export async function computeUniversalRoute(start: Coordinate, end: Coordinate, apiKey: string): Promise<RouteOutput> {
  const crow = haversine(start, end);

  // Determine proximity to road network near start and end
  const nearestRoadEnd = await findNearestHighway(end, 20, true);
  const nearestRoadStart = await findNearestHighway(start, 5, false);

  // Mode decision
  // A) Urban: within 350 m of road → direct ORS
  if (nearestRoadEnd && nearestRoadEnd.distance_m < 350) {
    try {
      const dir = await orsDirections('driving-car', { coordinates: [start, end], instructions: true, radiuses: [-1, -1] }, apiKey);
      const route = dir.routes?.[0];
      const coords: Coordinate[] = decodeOrsGeometry(route?.geometry);
      const bbox = bboxFromCoords(coords);
      // Elevation for walking not needed here; return vehicle and a trivial hike of 0
      const result: RouteOutput = {
        vehicle: { geometry: { type: 'LineString', coordinates: coords }, distance_m: route?.summary?.distance || crow, duration_s: route?.summary?.duration || 0 },
        hike: { geometry3d: [], distance_m: 0, ascent_m: 0, descent_m: 0, grades: { '0_4': 1, '4_10': 0, '10_20': 0, '20_35': 0, '>35': 0 }, robust_max: 0, duration_s: { naismith: 0, tobler: 0 } },
        bbox,
        dem_source: 'opentopodata',
        flags: []
      };
      return result;
    } catch {}
  }

  // B) Semi-rural + Accesspunktsmotor: generate candidates via Overpass, score via Matrix, apply penalties + efficiency; return top 3 as alternatives
  if (nearestRoadEnd && nearestRoadEnd.distance_m < 20_000) {
    const candidatesList = await getAccessCandidates(end, 10, 20);
    const candidates: Coordinate[] = candidatesList.map(c => c.coord);
    if (candidates.length === 0) candidates.push(nearestRoadEnd.point);
    const sources = [start];
    try {
      const carMat = await orsMatrix('driving-car', sources, candidates, apiKey);
      const walkMat = await orsMatrix('foot-walking', candidates, [end], apiKey);
      const scored = candidates.map((cand, idx) => {
        const carDur = carMat?.durations?.[0]?.[idx] ?? Infinity;
        const walkDur = walkMat?.durations?.[idx]?.[0] ?? Infinity;
        const base = (carDur + walkDur);
        const penalty = (PENALTIES.parking_unknown_minutes * 60);
        return { cand, base, total: base + penalty, carDur, walkDur };
      }).filter(s => isFinite(s.total)).sort((a, b) => a.total - b.total).slice(0, 3);

      const detailed = [] as Array<{ cand: Coordinate; carRoute: any; walkRoute: any; total_s: number; walkTerrain: any }>;
      for (const s of scored) {
        const carDir = await orsDirections('driving-car', { coordinates: [start, s.cand], instructions: true, radiuses: [-1, -1] }, apiKey);
        const walkDir = await orsDirections('foot-walking', { coordinates: [s.cand, end], instructions: true, radiuses: [-1, -1], elevation: true }, apiKey);
        const carRoute = carDir.routes?.[0];
        const walkRoute = walkDir.routes?.[0];
        const walkCoords: Coordinate[] = decodeOrsGeometry(walkRoute?.geometry);
        const walkLine = { type: 'LineString' as const, coordinates: walkCoords };
        const terrain = await sampleElevationOpenTopoData(walkLine);
        const total_s = (carRoute?.summary?.duration || 0) + (walkRoute?.summary?.duration || 0) + (PENALTIES.parking_unknown_minutes * 60);
        detailed.push({ cand: s.cand, carRoute, walkRoute, total_s, walkTerrain: terrain });
      }
      // Choose best by total_s
      detailed.sort((a, b) => a.total_s - b.total_s);
      const best = detailed[0];
      let carCoords: Coordinate[] = decodeOrsGeometry(best.carRoute?.geometry);
      let walkCoords: Coordinate[] = decodeOrsGeometry(best.walkRoute?.geometry);
      // Validate walking leg with adaptive thresholds (semi-rural)
      const thr = adaptiveThresholds(start, end, 'semi');
      const invalid = isWalkInvalidWithContext(walkCoords, carCoords, end, thr);
      let usedFallback = false;
      let terrain = best.walkTerrain;
      if (invalid.invalid) {
        const line = { type: 'LineString' as const, coordinates: [walkCoords[0] || best.cand, end] };
        const ter = await sampleElevationOpenTopoData(line);
        terrain = ter;
        walkCoords = [line.coordinates[0], line.coordinates[1]];
        usedFallback = true;
      }
      const distance_m = lineLength(walkCoords);
      const ascent_m = (terrain?.elevationGainMeters || 0);
      const descent_m = (terrain?.elevationLossMeters || 0);
      const grades = terrain ? computeGradeBins(terrain.profile) : { '0_4': 1, '4_10': 0, '10_20': 0, '20_35': 0, '>35': 0 };
      const robust = terrain ? computeRobustMax(terrain.profile) : 0;
      const t_naismith = naismithSeconds(distance_m, ascent_m);
      const t_tobler = terrain ? toblerSeconds(distance_m, terrain.profile.map((p: any) => ({ d: p.d, g: p.g }))) : t_naismith;
      const geom3d = terrain ? walkCoords.map((c, idx) => [c[0], c[1], (terrain.profile[Math.min(idx, terrain.profile.length - 1)]?.z ?? 0)]) : walkCoords.map(c => [c[0], c[1], 0]);
      const bbox = bboxFromCoords([...carCoords, ...walkCoords]);
      const chosen: RouteOutput = {
        vehicle: { geometry: { type: 'LineString', coordinates: carCoords }, distance_m: best.carRoute?.summary?.distance || 0, duration_s: (best.carRoute?.summary?.duration || 0) + (PENALTIES.parking_unknown_minutes * 60) },
        hike: { geometry3d: geom3d as any, distance_m, ascent_m, descent_m, grades, robust_max: robust, duration_s: { naismith: t_naismith, tobler: t_tobler } },
        bbox,
        dem_source: terrain?.dem_source || 'opentopodata',
        flags: usedFallback ? ['fallback:offtrail'] : []
      };

      // Efficiency stat for UI (not used in selection here)
      const alternatives = detailed.map(d => ({
        access: d.cand,
        car_s: d.carRoute?.summary?.duration || 0,
        walk_s: d.walkRoute?.summary?.duration || 0,
        total_s: d.total_s
      }));
      (chosen as any).alternatives = alternatives;
      return chosen;
    } catch {}
  }

  // C) Trail mode: build OSM hike graph and run A*
  try {
    const graph = await buildHikeGraphAround(end, 50);
    if (graph) {
      const path = aStarPath(graph, start, end);
      if (path && path.length >= 2) {
        // Validate trail with milder thresholds
        const thr = adaptiveThresholds(start, end, 'trail');
        let trailCoords: Coordinate[] = path as Coordinate[];
        const invalid = isWalkInvalidWithContext(trailCoords, [start], end, thr);
        let terrain;
        if (invalid.invalid) {
          const fallback = { type: 'LineString' as const, coordinates: [trailCoords[0], end] };
          terrain = await sampleElevationOpenTopoData(fallback);
          trailCoords = [fallback.coordinates[0], fallback.coordinates[1]];
        } else {
          const line = { type: 'LineString' as const, coordinates: trailCoords };
          terrain = await sampleElevationOpenTopoData(line);
        }
        const distance_m = trailCoords.reduce((acc, _, i) => (i ? acc + haversine(trailCoords[i - 1] as any, trailCoords[i] as any) : acc), 0);
        const ascent_m = (terrain?.elevationGainMeters || 0);
        const descent_m = (terrain?.elevationLossMeters || 0);
        const grades = terrain ? computeGradeBins(terrain.profile) : { '0_4': 1, '4_10': 0, '10_20': 0, '20_35': 0, '>35': 0 };
        const robust = terrain ? computeRobustMax(terrain.profile) : 0;
        const t_naismith = naismithSeconds(distance_m, ascent_m);
        const t_tobler = terrain ? toblerSeconds(distance_m, terrain.profile.map(p => ({ d: p.d, g: p.g }))) : t_naismith;
        const geom3d = terrain ? trailCoords.map((c, idx) => [c[0], c[1], (terrain.profile[Math.min(idx, terrain.profile.length - 1)]?.z ?? 0)]) : trailCoords.map(c => [c[0], c[1], 0]);
        const bbox = bboxFromCoords(trailCoords as Coordinate[]);
        return {
          hike: { geometry3d: geom3d as any, distance_m, ascent_m, descent_m, grades, robust_max: robust, duration_s: { naismith: t_naismith, tobler: t_tobler } },
          bbox,
          dem_source: terrain?.dem_source || 'opentopodata',
          flags: invalid.invalid ? ['fallback:offtrail'] : []
        } as RouteOutput;
      }
    }
  } catch {}

  // D) Offtrail: straight line + DEM fallback
  const coords: Coordinate[] = [start, end];
  const line = { type: 'LineString' as const, coordinates: coords };
  const terrain = await sampleElevationOpenTopoData(line);
  const distance_m = crow;
  const ascent_m = terrain?.elevationGainMeters || 0;
  const descent_m = terrain?.elevationLossMeters || 0;
  const grades = terrain ? computeGradeBins(terrain.profile) : { '0_4': 1, '4_10': 0, '10_20': 0, '20_35': 0, '>35': 0 };
  const robust = terrain ? computeRobustMax(terrain.profile) : 0;
  const t_naismith = naismithSeconds(distance_m, ascent_m);
  const t_tobler = terrain ? toblerSeconds(distance_m, terrain.profile.map(p => ({ d: p.d, g: p.g }))) : t_naismith;
  const bbox = bboxFromCoords(coords);
  return {
    hike: {
      geometry3d: coords.map((c, idx) => [c[0], c[1], terrain?.profile?.[Math.min(idx, (terrain?.profile?.length || 1) - 1)]?.z ?? 0]) as any,
      distance_m,
      ascent_m,
      descent_m,
      grades,
      robust_max: robust,
      duration_s: { naismith: t_naismith, tobler: t_tobler }
    },
    bbox,
    dem_source: terrain?.dem_source || 'opentopodata',
    flags: ['off-trail']
  } as RouteOutput;
}

function decodeOrsGeometry(geom: any): Coordinate[] {
  if (!geom) return [];
  if (typeof geom === 'string') {
    return decodePolyline(geom, 5);
  }
  if (geom.type === 'LineString') return geom.coordinates as Coordinate[];
  return [];
}

function decodePolyline(encoded: string, precision: 5 | 6 = 5): Coordinate[] {
  let index = 0; const len = encoded.length; let lat = 0; let lng = 0; const coords: Coordinate[] = []; const factor = Math.pow(10, precision);
  while (index < len) {
    let result = 0; let shift = 0; let b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1); lat += dlat;
    result = 0; shift = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1); lng += dlng;
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}


