// Shared constants for the universal routing pipeline

export const WALK_BASE_SPEED_KMH = 5;
export const TOBLER_SPEED_MIN_KMH = 0.6;
export const TOBLER_SPEED_MAX_KMH = 6.0;
export const ELEV_NOISE_M = 1.5;
export const SLOPE_WINDOW_M = 30;
export const GAP_CONNECTOR_MAX_M = 20;
export const DETOUR_EFFICIENCY_THRESHOLD = 1.0;

export const PENALTIES = {
  parking_unknown_minutes: 5,
  track_bad_minutes: 3,
};

// Overpass cache TTLs and limits
export const OVERPASS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
export const ORS_MATRIX_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const ORS_DIRECTIONS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const DEM_TILES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const isDebug = process.env.LOG_LEVEL === 'debug';


