// Shared types for the universal routing pipeline

export type Coordinate = [number, number]; // [lng, lat]

export type LineString2D = { type: 'LineString'; coordinates: Coordinate[] };
export type LineString3D = { type: 'LineString'; coordinates: [number, number, number][] };

export interface VehicleResult {
  geometry: LineString2D;
  distance_m: number;
  duration_s: number;
}

export interface HikeGrades {
  '0_4': number;
  '4_10': number;
  '10_20': number;
  '20_35': number;
  '>35': number;
}

export interface HikeDurationsSec {
  naismith: number;
  tobler: number;
}

export interface HikeResult {
  geometry3d: Array<[number, number, number]>;
  distance_m: number;
  ascent_m: number;
  descent_m: number;
  grades: HikeGrades;
  robust_max: number; // robust maximal slope over at least 30 m
  duration_s: HikeDurationsSec;
}

export interface RouteOutput {
  vehicle?: VehicleResult;
  hike: HikeResult;
  bbox: [number, number, number, number];
  dem_source: 'ors' | 'mapbox' | 'eudem' | 'arcticdem' | 'opentopodata';
  flags: string[];
}


