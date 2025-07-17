// Historisk data-cache specifikt för makrillmodellen
// Sparar 7 dagars data även när huvuddata uppdateras

interface HistoricalDataPoint {
  lat: number;
  lon: number;
  timestamp: string;
  temperature?: number;
  salinity?: number;
  current_u?: number;
  current_v?: number;
}

interface MackerelHistoryCache {
  points: HistoricalDataPoint[];
  lastUpdated: number;
  retentionDays: number;
}

const CACHE_KEY = 'mackerel_historical_data';
const RETENTION_DAYS = 7;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 timmar innan refresh

let memoryCache: MackerelHistoryCache | null = null;

/**
 * Lägg till nya datapunkter till historisk cache
 */
export function addToMackerelHistory(areaData: any): void {
  // Ladda befintlig cache
  const existingCache = loadMackerelHistory();
  
  // Extrahera nya datapunkter
  const newPoints: HistoricalDataPoint[] = [];
  
  for (const point of areaData.points || []) {
    const { lat, lon } = point;
    
    for (const dataEntry of point.data || []) {
      const { time, temperature, salinity, current } = dataEntry;
      
      newPoints.push({
        lat,
        lon,
        timestamp: time,
        temperature,
        salinity,
        current_u: current?.u,
        current_v: current?.v
      });
    }
  }
  
  // Kombinera med befintliga punkter
  const allPoints = [...existingCache.points, ...newPoints];
  
  // Rensa gamla data (äldre än RETENTION_DAYS)
  const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const filteredPoints = allPoints.filter(point => {
    try {
      const pointTime = new Date(point.timestamp).getTime();
      return pointTime >= cutoffTime;
    } catch {
      return false; // Ta bort ogiltiga timestamps
    }
  });
  
  // Skapa uppdaterad cache
  const updatedCache: MackerelHistoryCache = {
    points: filteredPoints,
    lastUpdated: Date.now(),
    retentionDays: RETENTION_DAYS
  };
  
  // Spara till localStorage och memory
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(updatedCache));
    memoryCache = updatedCache;
    
  } catch (error) {
    console.warn('⚠️ Kunde inte spara makrill historisk cache:', error);
  }
}

/**
 * Ladda historisk cache
 */
export function loadMackerelHistory(): MackerelHistoryCache {
  // Returnera memory cache om den finns och är färsk
  if (memoryCache && Date.now() - memoryCache.lastUpdated < CACHE_DURATION) {
    return memoryCache;
  }
  
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      
      // Validera och rensa gamla data
      const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const validPoints = parsed.points?.filter((point: any) => {
        try {
          const pointTime = new Date(point.timestamp).getTime();
          return pointTime >= cutoffTime;
        } catch {
          return false;
        }
      }) || [];
      
      const cache: MackerelHistoryCache = {
        points: validPoints,
        lastUpdated: parsed.lastUpdated || Date.now(),
        retentionDays: RETENTION_DAYS
      };
      
      memoryCache = cache;
      return cache;
    }
  } catch (error) {
    console.warn('⚠️ Kunde inte ladda makrill historisk cache:', error);
  }
  
  // Returnera tom cache som fallback
  return {
    points: [],
    lastUpdated: Date.now(),
    retentionDays: RETENTION_DAYS
  };
}

/**
 * Beräkna historiska medelvärden för en position
 */
export function getHistoricalAverages(
  lat: number, 
  lon: number, 
  currentTime: string,
  lookbackHours: number = 72 // 3 dagar som standard
): {
  avgTemperature?: number;
  avgSalinity?: number;
  avgCurrentStrength?: number;
  avgCurrentDirectionFactor?: number;
  dataPoints: number;
} {
  const cache = loadMackerelHistory();
  
  const currentTimestamp = new Date(currentTime).getTime();
  const lookbackMs = lookbackHours * 60 * 60 * 1000;
  const startTime = currentTimestamp - lookbackMs;
  
  // Hitta närliggande punkter inom tidsramen
  const DISTANCE_THRESHOLD = 0.1; // ~10km tolerans
  const relevantPoints = cache.points.filter(point => {
    try {
      const pointTime = new Date(point.timestamp).getTime();
      const distance = Math.sqrt(
        Math.pow(point.lat - lat, 2) + Math.pow(point.lon - lon, 2)
      );
      
      return pointTime >= startTime && 
             pointTime < currentTimestamp && 
             distance <= DISTANCE_THRESHOLD;
    } catch {
      return false;
    }
  });
  
  if (relevantPoints.length === 0) {
    return { dataPoints: 0 };
  }
  
  // Beräkna medelvärden
  const temperatures = relevantPoints.map(p => p.temperature).filter(t => t != null);
  const salinities = relevantPoints.map(p => p.salinity).filter(s => s != null);
  const currents = relevantPoints
    .filter(p => p.current_u != null && p.current_v != null)
    .map(p => ({
      strength: Math.sqrt(p.current_u! ** 2 + p.current_v! ** 2),
      direction: Math.atan2(p.current_v!, p.current_u!)
    }));
  
  const result: any = { dataPoints: relevantPoints.length };
  
  if (temperatures.length > 0) {
    result.avgTemperature = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
  }
  
  if (salinities.length > 0) {
    result.avgSalinity = salinities.reduce((a, b) => a + b, 0) / salinities.length;
  }
  
  if (currents.length > 0) {
    result.avgCurrentStrength = currents.reduce((a, b) => a + b.strength, 0) / currents.length;
    
    // Beräkna genomsnittlig riktningsfaktor (sydlig ström gynnsam)
    const directionFactors = currents.map(c => {
      const optimalAngle = Math.PI; // Sydlig ström
      const angleDiff = Math.abs(c.direction - optimalAngle);
      const normalizedDiff = angleDiff > Math.PI ? 2 * Math.PI - angleDiff : angleDiff;
      return (Math.cos(normalizedDiff) + 1) / 2; // 0-1 range
    });
    
    result.avgCurrentDirectionFactor = directionFactors.reduce((a, b) => a + b, 0) / directionFactors.length;
  }
  
  return result;
}

/**
 * Rensa gammal historisk data manuellt
 */
export function clearOldMackerelHistory(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    memoryCache = null;
  } catch (error) {
    console.warn('⚠️ Kunde inte rensa makrill historisk cache:', error);
  }
}

/**
 * Statistik om historisk cache
 */
export function getMackerelHistoryStats(): {
  totalPoints: number;
  oldestTimestamp?: string;
  newestTimestamp?: string;
  retentionDays: number;
} {
  const cache = loadMackerelHistory();
  
  if (cache.points.length === 0) {
    return {
      totalPoints: 0,
      retentionDays: RETENTION_DAYS
    };
  }
  
  const timestamps = cache.points
    .map(p => new Date(p.timestamp).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);
  
  return {
    totalPoints: cache.points.length,
    oldestTimestamp: timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : undefined,
    newestTimestamp: timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : undefined,
    retentionDays: RETENTION_DAYS
  };
} 