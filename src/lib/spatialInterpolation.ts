/**
 * Spatial interpolation utilities for parameter values
 */

import { findNearbyPointsOptimized } from './spatialIndex';

interface DataPoint {
  lat: number;
  lon: number;
  data: Array<{
    time: string;
    current?: { u: number; v: number };
    temperature?: number;
    salinity?: number;
  }>;
}

interface InterpolatedValues {
  coordinates: {
    lat: number;
    lon: number;
  };
  values: {
    current?: {
      magnitude: number;
      direction: number;
      u: number;
      v: number;
      unit: string;
    };
    temperature?: {
      value: number;
      unit: string;
    };
    salinity?: {
      value: number;
      unit: string;
    };
  };
  dataType: 'interpolated' | 'actual' | 'no_data';
  nearestPointDistance: number;
  timestamp: string;
}

/**
 * Beräkna haversine-avstånd mellan två punkter
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Jordens radie i km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) ** 2 + 
           Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
           Math.sin(dLon / 2) ** 2;
  
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Hitta närmaste datapunkter för en given position
 * Nu importerad från spatialIndex för bättre prestanda
 */
function findNearbyPoints(
  targetLat: number, 
  targetLon: number, 
  dataPoints: DataPoint[], 
  maxDistance: number = 50, // km
  maxPoints: number = 16   // Fler punkter för bättre kubisk interpolation
): Array<DataPoint & { distance: number }> {
  // Använd optimerad version med spatial indexing
  return findNearbyPointsOptimized(targetLat, targetLon, dataPoints, maxDistance, maxPoints);
}

/**
 * Kubisk interpolation som matchar bildgenerering bättre
 * Baserad på avståndsgrupperad viktning för mjukare resultat
 */
function cubicInterpolation(
  targetLat: number,
  targetLon: number,
  nearbyPoints: Array<DataPoint & { distance: number }>,
  parameter: 'current' | 'temperature' | 'salinity',
  timestamp: string
): number | { u: number; v: number } | null {
  if (nearbyPoints.length === 0) return null;
  
  // Kolla om vi har en exakt match (distance = 0)
  const exactMatch = nearbyPoints.find(p => p.distance < 0.001); // < 1m
  if (exactMatch) {
    const dataEntry = exactMatch.data.find(d => d.time === timestamp);
    if (dataEntry) {
      if (parameter === 'current' && dataEntry.current) {
        return { u: dataEntry.current.u, v: dataEntry.current.v };
      } else if (parameter === 'temperature' && dataEntry.temperature !== undefined) {
        return dataEntry.temperature;
      } else if (parameter === 'salinity' && dataEntry.salinity !== undefined) {
        return dataEntry.salinity;
      }
    }
  }
  
  // Samla värden och beräkna kubiska vikter
  const values: number[] = [];
  const weights: number[] = [];
  const vectorValues: Array<{ u: number; v: number }> = [];
  
  for (const point of nearbyPoints) {
    const dataEntry = point.data.find(d => d.time === timestamp);
    if (!dataEntry) continue;
    
    let value: number | { u: number; v: number } | null = null;
    
    if (parameter === 'current' && dataEntry.current) {
      value = { u: dataEntry.current.u, v: dataEntry.current.v };
    } else if (parameter === 'temperature' && dataEntry.temperature !== undefined) {
      value = dataEntry.temperature;
    } else if (parameter === 'salinity' && dataEntry.salinity !== undefined) {
      value = dataEntry.salinity;
    }
    
    if (value !== null) {
      // Kubisk viktning - mer likt bildgenerering
      const d = Math.max(point.distance, 0.001); // Undvik division med 0
      const weight = 1 / (d * d * d); // Kubisk viktning istället för kvadratisk
      
      // Mjuk avtrappning för avlägsna punkter
      const maxDistance = 50; // km
      const distanceFactor = Math.max(0, 1 - (point.distance / maxDistance));
      const finalWeight = weight * distanceFactor;
      
      weights.push(finalWeight);
      
      if (parameter === 'current') {
        vectorValues.push(value as { u: number; v: number });
      } else {
        values.push(value as number);
      }
    }
  }
  
  if (values.length === 0 && vectorValues.length === 0) return null;
  
  // Beräkna viktad interpolation
  if (parameter === 'current') {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return null;
    
    const weightedU = vectorValues.reduce((sum, v, i) => sum + v.u * weights[i], 0) / totalWeight;
    const weightedV = vectorValues.reduce((sum, v, i) => sum + v.v * weights[i], 0) / totalWeight;
    
    return { u: weightedU, v: weightedV };
  } else {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return null;
    
    const weightedValue = values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;
    
    // Lägg till lite smoothing för att matcha bildgenerering
    // Enkel Gaussian-liknande smoothing baserat på lokala värden
    if (values.length >= 3) {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const smoothingFactor = 0.1; // Samma som i Python-scriptet
      const smoothedValue = weightedValue * (1 - smoothingFactor) + mean * smoothingFactor;
      return smoothedValue;
    }
    
    return weightedValue;
  }
}

/**
 * Beräkna strömriktning från u,v komponenter
 */
function calculateCurrentDirection(u: number, v: number): number {
  // Beräkna riktning i grader (0° = nord, 90° = öst)
  let direction = Math.atan2(u, v) * (180 / Math.PI);
  if (direction < 0) direction += 360;
  return direction;
}

/**
 * Konvertera riktning till kompassriktning
 */
function getCompassDirection(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                     'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Huvudfunktion för att interpolera alla parametrar för en given position
 */
export function interpolateParametersAtPosition(
  targetLat: number,
  targetLon: number,
  dataPoints: DataPoint[],
  timestamp: string
): InterpolatedValues {
  // Hitta närmaste punkter - fler punkter för bättre kubisk interpolation
  const nearbyPoints = findNearbyPoints(targetLat, targetLon, dataPoints);
  
  if (nearbyPoints.length === 0) {
    return {
      coordinates: { lat: targetLat, lon: targetLon },
      values: {},
      dataType: 'no_data',
      nearestPointDistance: Infinity,
      timestamp
    };
  }
  
  const nearestDistance = nearbyPoints[0].distance;
  const isActualData = nearestDistance < 0.001; // < 1m anses som exakt data
  
  const result: InterpolatedValues = {
    coordinates: { lat: targetLat, lon: targetLon },
    values: {},
    dataType: isActualData ? 'actual' : 'interpolated',
    nearestPointDistance: nearestDistance,
    timestamp
  };
  
  // Interpolera strömstyrka med förbättrad kubisk interpolation
  const currentData = cubicInterpolation(targetLat, targetLon, nearbyPoints, 'current', timestamp);
  if (currentData && typeof currentData === 'object') {
    const magnitude = Math.sqrt(currentData.u ** 2 + currentData.v ** 2);
    const direction = calculateCurrentDirection(currentData.u, currentData.v);
    
    result.values.current = {
      magnitude: magnitude,
      direction: direction,
      u: currentData.u,
      v: currentData.v,
      unit: 'm/s'
    };
  }
  
  // Interpolera temperatur med förbättrad kubisk interpolation
  const tempData = cubicInterpolation(targetLat, targetLon, nearbyPoints, 'temperature', timestamp);
  if (tempData && typeof tempData === 'number') {
    result.values.temperature = {
      value: tempData,
      unit: '°C'
    };
  }
  
  // Interpolera salthalt med förbättrad kubisk interpolation
  const salinityData = cubicInterpolation(targetLat, targetLon, nearbyPoints, 'salinity', timestamp);
  if (salinityData && typeof salinityData === 'number') {
    result.values.salinity = {
      value: salinityData,
      unit: 'g/kg'
    };
  }
  
  return result;
}

/**
 * Formatera koordinater för visning
 */
export function formatCoordinates(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

/**
 * Konvertera m/s till knop
 */
export function msToKnots(ms: number): number {
  return ms * 1.944;
}

/**
 * Formatera parametervärden för visning
 */
export function formatParameterValue(parameter: string, value: number): string {
  switch (parameter) {
    case 'current':
      return `${value.toFixed(3)} m/s (${msToKnots(value).toFixed(1)} knop)`;
    case 'temperature':
      return `${value.toFixed(1)}°C`;
    case 'salinity':
      return `${value.toFixed(1)} g/kg`;
    default:
      return value.toFixed(2);
  }
} 