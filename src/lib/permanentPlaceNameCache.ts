// 🗺️ PERMANENT PLATSNAMN-CACHE - Optimal för marina applikationer
// localStorage + in-memory för maximal prestanda och offline-funktion

interface PlaceNameCacheEntry {
  name: string | null;
  timestamp: number;
  accuracy: 'high' | 'medium' | 'low'; // Kvalitet på platsnamnet
  source: 'nominatim' | 'cache' | 'fallback';
}

interface PlaceNameCacheData {
  version: string;
  entries: Record<string, PlaceNameCacheEntry>;
  metadata: {
    totalEntries: number;
    lastOptimization: number;
    hitRate: number;
    totalRequests: number;
    cacheHits: number;
  };
}

class PermanentPlaceNameCache {
  private static instance: PermanentPlaceNameCache;
  private memoryCache = new Map<string, PlaceNameCacheEntry>();
  private readonly CACHE_VERSION = 'v1.2';
  private readonly STORAGE_KEY = 'makrillsverige-placenames';
  private readonly MAX_ENTRIES = 5000; // ~500KB för svenska kusten
  private readonly COORDINATE_PRECISION = 3; // ~100m precision för marina användning
  private readonly OPTIMIZATION_INTERVAL = 7 * 24 * 60 * 60 * 1000; // Vecka
  
  // Marina prioriteringar för svenska kusten
  private readonly MARINE_KEYWORDS = {
    high: ['fyr', 'hamn', 'marina', 'skärgård', 'ö', 'holme', 'grund', 'bank', 'rev'],
    medium: ['vik', 'sund', 'udde', 'klint', 'strand', 'kust'],
    low: ['kommun', 'län', 'församling']
  };

  private constructor() {
    this.loadFromStorage();
    this.setupPeriodicOptimization();
  }

  static getInstance(): PermanentPlaceNameCache {
    if (!PermanentPlaceNameCache.instance) {
      PermanentPlaceNameCache.instance = new PermanentPlaceNameCache();
    }
    return PermanentPlaceNameCache.instance;
  }

  // Skapa cache-nyckel med marina precision
  private getCacheKey(lat: number, lon: number): string {
    const precision = this.COORDINATE_PRECISION;
    const roundedLat = Math.round(lat * Math.pow(10, precision)) / Math.pow(10, precision);
    const roundedLon = Math.round(lon * Math.pow(10, precision)) / Math.pow(10, precision);
    return `${roundedLat},${roundedLon}`;
  }

  // Bedöm kvalitet på platsnamn för marina användning
  private assessPlaceNameQuality(name: string): 'high' | 'medium' | 'low' {
    const lowerName = name.toLowerCase();
    
    // Hög kvalitet: Marina specifika namn
    if (this.MARINE_KEYWORDS.high.some(keyword => lowerName.includes(keyword))) {
      return 'high';
    }
    
    // Medel kvalitet: Geografiska namn
    if (this.MARINE_KEYWORDS.medium.some(keyword => lowerName.includes(keyword))) {
      return 'medium';
    }
    
    // Låg kvalitet: Administrativa namn
    if (this.MARINE_KEYWORDS.low.some(keyword => lowerName.includes(keyword))) {
      return 'low';
    }
    
    // Default: Medel för okända namn
    return 'medium';
  }

  // Ladda cache från localStorage
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return;

      const data: PlaceNameCacheData = JSON.parse(stored);
      
      // Version check - rensa vid inkompatibel version
      if (data.version !== this.CACHE_VERSION) {
        console.log('🗺️ Cache version updated, clearing old data');
        this.clearStorage();
        return;
      }

      // Ladda entries till memory cache
      Object.entries(data.entries).forEach(([key, entry]) => {
        this.memoryCache.set(key, entry);
      });

      console.log(`🗺️ Loaded ${Object.keys(data.entries).length} place names from persistent cache`);
      
    } catch (error) {
      console.warn('🗺️ Failed to load place name cache:', error);
      this.clearStorage();
    }
  }

  // Skriv cache till localStorage
  private saveToStorage(): void {
    try {
      const entries: Record<string, PlaceNameCacheEntry> = {};
      this.memoryCache.forEach((value, key) => {
        entries[key] = value;
      });

      const data: PlaceNameCacheData = {
        version: this.CACHE_VERSION,
        entries,
        metadata: {
          totalEntries: this.memoryCache.size,
          lastOptimization: Date.now(),
          hitRate: 0, // Beräknas vid runtime
          totalRequests: 0,
          cacheHits: 0
        }
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      
    } catch (error) {
      console.warn('🗺️ Failed to save place name cache:', error);
      
      // Om localStorage är fullt, försök optimera och spara igen
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.optimizeCache();
        try {
          const entries: Record<string, PlaceNameCacheEntry> = {};
          this.memoryCache.forEach((value, key) => {
            entries[key] = value;
          });
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ version: this.CACHE_VERSION, entries, metadata: { totalEntries: this.memoryCache.size, lastOptimization: Date.now(), hitRate: 0, totalRequests: 0, cacheHits: 0 } }));
        } catch (retryError) {
          console.warn('🗺️ Failed to save even after optimization');
        }
      }
    }
  }

  // Optimera cache genom att ta bort lågprioriterade entries
  private optimizeCache(): void {
    if (this.memoryCache.size <= this.MAX_ENTRIES) return;

    console.log('🗺️ Optimizing place name cache...');
    
    // Konvertera till array för sortering
    const entries = Array.from(this.memoryCache.entries());
    
    // Sortera baserat på prioritet: accuracy, age, marina relevans
    entries.sort(([keyA, entryA], [keyB, entryB]) => {
      // Prioritet 1: Accuracy (marina namn viktigast)
      const accuracyScore = { high: 3, medium: 2, low: 1 };
      const scoreDiff = accuracyScore[entryB.accuracy] - accuracyScore[entryA.accuracy];
      if (scoreDiff !== 0) return scoreDiff;
      
      // Prioritet 2: Age (nyare bättre)
      return entryB.timestamp - entryA.timestamp;
    });

    // Behåll bara top entries
    const keepEntries = entries.slice(0, Math.floor(this.MAX_ENTRIES * 0.8)); // 80% av max
    
    this.memoryCache.clear();
    keepEntries.forEach(([key, entry]) => {
      this.memoryCache.set(key, entry);
    });

    console.log(`🗺️ Cache optimized: ${entries.length} → ${keepEntries.length} entries`);
  }

  // Hämta platsnamn med intelligent cache management
  async getPlaceName(lat: number, lon: number): Promise<{
    placeName: string | null;
    cached: boolean;
    accuracy: 'high' | 'medium' | 'low';
  }> {
    const cacheKey = this.getCacheKey(lat, lon);
    
    // Kontrollera memory cache först (snabbast)
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      return {
        placeName: cached.name,
        cached: true,
        accuracy: cached.accuracy
      };
    }

    // Hämta från API och cache permanent
    try {
      // Importera geocoding service dynamiskt för att undvika cirkulära beroenden
      const { geocodingService } = await import('./geocodingService');
      const result = await geocodingService.getPlaceName(lat, lon);
      
      // Bedöm kvalitet och skapa cache entry
      const accuracy = result.placeName ? this.assessPlaceNameQuality(result.placeName) : 'low';
      const entry: PlaceNameCacheEntry = {
        name: result.placeName,
        timestamp: Date.now(),
        accuracy,
        source: 'nominatim'
      };

      // Spara i memory cache
      this.memoryCache.set(cacheKey, entry);
      
      // Spara till localStorage (async för att inte blockera UI)
      setTimeout(() => this.saveToStorage(), 100);

      return {
        placeName: result.placeName,
        cached: false,
        accuracy
      };

    } catch (error) {
      // Cache även misslyckanden för att undvika upprepade requests
      const entry: PlaceNameCacheEntry = {
        name: null,
        timestamp: Date.now(),
        accuracy: 'low',
        source: 'fallback'
      };
      
      this.memoryCache.set(cacheKey, entry);
      
      return {
        placeName: null,
        cached: false,
        accuracy: 'low'
      };
    }
  }

  // Förbättrad prestanda för vanliga marina områden
  async preloadCommonMarineAreas(): Promise<void> {
    // Svenska kustens populära områden - detta kan köras i bakgrunden
    const commonAreas = [
      [57.70, 11.97], // Göteborg
      [58.59, 17.64], // Stockholm skärgård
      [55.61, 13.00], // Malmö
      [56.88, 14.81], // Kalmar
      [57.78, 16.63], // Visby
      [59.85, 17.64], // Arlanda kusten
    ];

    // Preload utan att blockera huvudtråden
    for (const [lat, lon] of commonAreas) {
      const cacheKey = this.getCacheKey(lat, lon);
      if (!this.memoryCache.has(cacheKey)) {
        // Lägg till liten delay för att inte överbelasta API
        await new Promise(resolve => setTimeout(resolve, 200));
        await this.getPlaceName(lat, lon);
      }
    }
  }

  // Setup periodisk optimering
  private setupPeriodicOptimization(): void {
    // Optimera cache en gång i veckan
    setInterval(() => {
      this.optimizeCache();
      this.saveToStorage();
    }, this.OPTIMIZATION_INTERVAL);
  }

  // Rensa allt (för utveckling/debugging)
  clearStorage(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.memoryCache.clear();
    console.log('🗺️ Place name cache cleared');
  }

  // Statistik för monitoring
  getStats(): {
    memoryEntries: number;
    cacheSize: number;
    accuracy: Record<string, number>;
  } {
    const accuracyCount = { high: 0, medium: 0, low: 0 };
    
    this.memoryCache.forEach(entry => {
      accuracyCount[entry.accuracy]++;
    });

    return {
      memoryEntries: this.memoryCache.size,
      cacheSize: this.estimateCacheSize(),
      accuracy: accuracyCount
    };
  }

  private estimateCacheSize(): number {
    // Uppskatta storlek i KB
    let size = 0;
    this.memoryCache.forEach((entry, key) => {
      size += key.length + (entry.name ? entry.name.length : 0) + 50; // metadata overhead
    });
    return Math.round(size / 1024);
  }
}

// Export singleton instance
export const permanentPlaceNameCache = PermanentPlaceNameCache.getInstance();

// Export för TypeScript
export type { PlaceNameCacheEntry }; 