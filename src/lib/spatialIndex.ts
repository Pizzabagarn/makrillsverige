/**
 * Spatial indexing för snabbare søking av närmaste datapunkter
 */

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

interface GridCell {
  points: (DataPoint & { distance?: number })[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

interface SpatialIndex {
  grid: GridCell[][];
  cellSize: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  gridWidth: number;
  gridHeight: number;
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
 * Skapa spatial index för snabbare punkt-søkning
 */
export function createSpatialIndex(
  dataPoints: DataPoint[], 
  cellSize: number = 0.1 // 0.1 grader ≈ 11km
): SpatialIndex {
  if (dataPoints.length === 0) {
    return {
      grid: [],
      cellSize,
      bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
      gridWidth: 0,
      gridHeight: 0
    };
  }

  // Beräkna bounds för alla punkter
  const lats = dataPoints.map(p => p.lat);
  const lons = dataPoints.map(p => p.lon);
  
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons)
  };

  // Beräkna grid-dimensioner
  const gridWidth = Math.ceil((bounds.maxLon - bounds.minLon) / cellSize) + 1;
  const gridHeight = Math.ceil((bounds.maxLat - bounds.minLat) / cellSize) + 1;

  // Skapa tom grid
  const grid: GridCell[][] = Array(gridHeight).fill(null).map(() => 
    Array(gridWidth).fill(null).map(() => ({
      points: [],
      bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 }
    }))
  );

  // Sätt bounds för varje cell
  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const minLat = bounds.minLat + row * cellSize;
      const maxLat = bounds.minLat + (row + 1) * cellSize;
      const minLon = bounds.minLon + col * cellSize;
      const maxLon = bounds.minLon + (col + 1) * cellSize;
      
      grid[row][col].bounds = { minLat, maxLat, minLon, maxLon };
    }
  }

  // Lägg till punkter i grid
  for (const point of dataPoints) {
    const col = Math.floor((point.lon - bounds.minLon) / cellSize);
    const row = Math.floor((point.lat - bounds.minLat) / cellSize);
    
    // Säkerställ att vi är inom bounds
    const safeCol = Math.max(0, Math.min(gridWidth - 1, col));
    const safeRow = Math.max(0, Math.min(gridHeight - 1, row));
    
    grid[safeRow][safeCol].points.push(point);
  }

  return {
    grid,
    cellSize,
    bounds,
    gridWidth,
    gridHeight
  };
}

/**
 * Hitta närmaste datapunkter med spatial index
 */
export function findNearbyPointsWithIndex(
  targetLat: number,
  targetLon: number,
  spatialIndex: SpatialIndex,
  maxDistance: number = 50, // km
  maxPoints: number = 8
): Array<DataPoint & { distance: number }> {
  const { grid, cellSize, bounds, gridWidth, gridHeight } = spatialIndex;
  
  // Hitta target cell
  const targetCol = Math.floor((targetLon - bounds.minLon) / cellSize);
  const targetRow = Math.floor((targetLat - bounds.minLat) / cellSize);
  
  // Säkerställ att vi är inom bounds
  const safeCol = Math.max(0, Math.min(gridWidth - 1, targetCol));
  const safeRow = Math.max(0, Math.min(gridHeight - 1, targetRow));
  
  // Beräkna search radius i grid-celler
  const searchRadius = Math.ceil(maxDistance / (cellSize * 111)); // 111 km ≈ 1 grad
  
  const candidates: Array<DataPoint & { distance: number }> = [];
  
  // Sök i närliggande celler
  for (let row = Math.max(0, safeRow - searchRadius); 
       row <= Math.min(gridHeight - 1, safeRow + searchRadius); 
       row++) {
    for (let col = Math.max(0, safeCol - searchRadius); 
         col <= Math.min(gridWidth - 1, safeCol + searchRadius); 
         col++) {
      
      // Lägg till alla punkter från denna cell
      for (const point of grid[row][col].points) {
        const distance = haversineDistance(targetLat, targetLon, point.lat, point.lon);
        
        if (distance <= maxDistance) {
          candidates.push({ ...point, distance });
        }
      }
    }
  }
  
  // Sortera efter avstånd och ta de närmaste
  return candidates
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxPoints);
}

/**
 * Cache för spatial index
 */
let indexCache: {
  dataPoints: DataPoint[];
  spatialIndex: SpatialIndex;
} | null = null;

/**
 * Hämta eller skapa spatial index med caching
 */
export function getSpatialIndex(dataPoints: DataPoint[]): SpatialIndex {
  // Kontrollera om vi kan återanvända cache
  if (indexCache && indexCache.dataPoints === dataPoints) {
    return indexCache.spatialIndex;
  }
  
  // Skapa nytt index
  const spatialIndex = createSpatialIndex(dataPoints);
  
  // Uppdatera cache
  indexCache = {
    dataPoints,
    spatialIndex
  };
  
  return spatialIndex;
}

/**
 * Rensa spatial index cache
 */
export function clearSpatialIndexCache() {
  indexCache = null;
}

/**
 * Optimerad version av findNearbyPoints som använder spatial index
 */
export function findNearbyPointsOptimized(
  targetLat: number,
  targetLon: number,
  dataPoints: DataPoint[],
  maxDistance: number = 50,
  maxPoints: number = 8
): Array<DataPoint & { distance: number }> {
  const spatialIndex = getSpatialIndex(dataPoints);
  return findNearbyPointsWithIndex(
    targetLat, 
    targetLon, 
    spatialIndex, 
    maxDistance, 
    maxPoints
  );
} 