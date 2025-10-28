/**
 * SVAR Lake Chart Lookup Service
 * 
 * Matches water bodies from the map to SVAR SJOID for lake chart retrieval.
 * Uses the pre-generated all_svar_ids.json from WFS data.
 */

import svarData from '@/../../scripts/svar/all_svar_ids.json';

export interface SvarLake {
  sjoid: string;
  vyid: string;
  name: string;
  lat: number;
  lon: number;
  area_km2: number;
}

export interface SvarLookupResult {
  sjoid: string;
  vyid: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  distance_km?: number;
}

/**
 * Find SJOID for a water body by name and coordinates
 */
export function findSJOID(
  waterBodyName: string,
  lat: number,
  lon: number,
  maxDistanceKm: number = 5
): SvarLookupResult | null {
  
  if (!waterBodyName || !lat || !lon) {
    return null;
  }

  const normalizedSearchName = normalizeName(waterBodyName);
  const lakes = svarData as SvarLake[];
  
  // Step 1: Find lakes with matching name
  const nameMatches = lakes.filter(lake => {
    if (!lake.name) return false;
    const normalizedLakeName = normalizeName(lake.name);
    return normalizedLakeName === normalizedSearchName || 
           normalizedLakeName.includes(normalizedSearchName) ||
           normalizedSearchName.includes(normalizedLakeName);
  });

  if (nameMatches.length === 0) {
    // No name match - try coordinate-only search within small radius (1km)
    return findByCoordinatesOnly(lat, lon, 1);
  }

  if (nameMatches.length === 1) {
    // Single name match - verify it's within reasonable distance
    const lake = nameMatches[0];
    const distance = calculateDistance(lat, lon, lake.lat, lake.lon);
    
    if (distance <= maxDistanceKm) {
      return {
        sjoid: lake.sjoid,
        vyid: lake.vyid,
        name: lake.name,
        confidence: distance < 0.5 ? 'high' : distance < 2 ? 'medium' : 'low',
        distance_km: distance,
      };
    }
    
    return null;
  }

  // Multiple name matches - find closest one
  let closestLake: SvarLake | null = null;
  let minDistance = Infinity;

  for (const lake of nameMatches) {
    const distance = calculateDistance(lat, lon, lake.lat, lake.lon);
    if (distance < minDistance && distance <= maxDistanceKm) {
      minDistance = distance;
      closestLake = lake;
    }
  }

  if (closestLake) {
    return {
      sjoid: closestLake.sjoid,
      vyid: closestLake.vyid,
      name: closestLake.name,
      confidence: minDistance < 0.5 ? 'high' : minDistance < 2 ? 'medium' : 'low',
      distance_km: minDistance,
    };
  }

  return null;
}

/**
 * Find SJOID by coordinates only (fallback for unnamed lakes)
 */
function findByCoordinatesOnly(
  lat: number,
  lon: number,
  maxDistanceKm: number
): SvarLookupResult | null {
  
  const lakes = svarData as SvarLake[];
  let closestLake: SvarLake | null = null;
  let minDistance = Infinity;

  for (const lake of lakes) {
    const distance = calculateDistance(lat, lon, lake.lat, lake.lon);
    if (distance < minDistance && distance <= maxDistanceKm) {
      minDistance = distance;
      closestLake = lake;
    }
  }

  if (closestLake) {
    return {
      sjoid: closestLake.sjoid,
      vyid: closestLake.vyid,
      name: closestLake.name || '(Unnamed)',
      confidence: minDistance < 0.2 ? 'medium' : 'low',
      distance_km: minDistance,
    };
  }

  return null;
}

/**
 * Normalize lake name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove common suffixes
    .replace(/\s*(sjö|sjön|lake|vatten|träsk|träsket|tjärn|tjärnen)$/i, '')
    .trim()
    // Normalize Swedish characters
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    // Remove special characters
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get all available SVAR lakes (for debugging/testing)
 */
export function getAllSvarLakes(): SvarLake[] {
  return svarData as SvarLake[];
}

/**
 * Search SVAR lakes by name
 */
export function searchSvarLakes(query: string, limit: number = 50): SvarLake[] {
  if (!query || query.length < 2) return [];
  
  const normalizedQuery = normalizeName(query);
  const lakes = svarData as SvarLake[];
  
  return lakes
    .filter(lake => {
      if (!lake.name) return false;
      const normalizedName = normalizeName(lake.name);
      return normalizedName.includes(normalizedQuery);
    })
    .slice(0, limit);
}

