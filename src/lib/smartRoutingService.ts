// Smart Routing Service - Find nearest shore point for water body navigation
// Simple solution: just find the closest shore point to the user

import * as turf from '@turf/turf';
import { SMHIWaterBody } from './smhiWaterService';

/**
 * Find the nearest shore point for navigating to a water body
 * Returns the closest point on the water's edge (not the center)
 */
export function findNearestShorePoint(
  waterBody: SMHIWaterBody,
  userPosition: [number, number] // [lng, lat]
): [number, number] {

  if (!waterBody.geometry) {
    // Fallback: use center point if no geometry available
    return [waterBody.coordinates[1], waterBody.coordinates[0]];
  }
  
  try {
    // Convert geometry to line for shore calculations
    let shoreLine: any = null;
    
    if (waterBody.geometry.type === 'Polygon' || waterBody.geometry.type === 'MultiPolygon') {
      shoreLine = turf.polygonToLine(waterBody.geometry as any);
    } else if (waterBody.geometry.type === 'LineString' || waterBody.geometry.type === 'MultiLineString') {
      shoreLine = waterBody.geometry;
    } else if (waterBody.geometry.type === 'GeometryCollection') {
      // Handle geometry collections (multiple segments)
      const polygons = waterBody.geometry.geometries.filter((g: any) => 
        g.type === 'Polygon' || g.type === 'MultiPolygon'
      );
      const lines = waterBody.geometry.geometries.filter((g: any) => 
        g.type === 'LineString' || g.type === 'MultiLineString'
      );
      
      if (polygons.length > 0) {
        shoreLine = turf.polygonToLine(polygons[0] as any);
      } else if (lines.length > 0) {
        shoreLine = lines[0];
      }
    }
    
    if (!shoreLine) {
      console.warn('Could not extract shore line from geometry');
      return [waterBody.coordinates[1], waterBody.coordinates[0]];
    }
    
    // Find nearest point on shore to user
    const nearestPoint = turf.nearestPointOnLine(shoreLine, turf.point(userPosition));
    return nearestPoint.geometry.coordinates as [number, number];
    
  } catch (error) {
    console.error('Error finding nearest shore point:', error);
    return [waterBody.coordinates[1], waterBody.coordinates[0]];
  }
}


/**
 * Calculate adjusted walking time based on elevation gain/loss
 * Uses Naismith's Rule: 1 hour per 5km + 1 hour per 600m elevation gain
 * Modified with descent adjustment
 */
export function calculateElevationAdjustedTime(
  baseSeconds: number,
  elevationGainMeters: number,
  elevationLossMeters: number
): number {
  
  // Base time from ORS
  let adjustedSeconds = baseSeconds;
  
  // Add time for elevation gain (Naismith's rule: 600m gain = 1 hour)
  const gainTimeSeconds = (elevationGainMeters / 600) * 3600;
  adjustedSeconds += gainTimeSeconds;
  
  // Adjust for descent (descent is faster, but still adds time on steep terrain)
  // Rule of thumb: subtract 10 minutes per 300m descent (but not more than gained)
  const descentReduction = Math.min(
    (elevationLossMeters / 300) * 600, // Max 10 min per 300m
    gainTimeSeconds * 0.5 // Don't reduce more than half the gain time
  );
  adjustedSeconds -= descentReduction;
  
  return Math.max(adjustedSeconds, baseSeconds); // Never less than base time
}

/**
 * Format elevation-aware duration
 */
export function formatElevationAwareDuration(
  baseSeconds: number,
  terrain?: { elevationGainMeters: number; elevationLossMeters: number } | null
): string {
  
  if (!terrain || (terrain.elevationGainMeters === 0 && terrain.elevationLossMeters === 0)) {
    return formatDuration(baseSeconds);
  }
  
  const adjustedSeconds = calculateElevationAdjustedTime(
    baseSeconds,
    terrain.elevationGainMeters,
    terrain.elevationLossMeters
  );
  
  const baseTime = formatDuration(baseSeconds);
  const adjustedTime = formatDuration(adjustedSeconds);
  
  if (adjustedSeconds > baseSeconds) {
    return `${adjustedTime} (${baseTime} utan höjd)`;
  }
  
  return adjustedTime;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours} tim ${minutes} min`;
  }
  return `${minutes} min`;
}

