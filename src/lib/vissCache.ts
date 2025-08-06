// ENKEL VISS-CACHE för att undvika upprepade API-anrop
// Cachar VISS-resultat i localStorage

interface VISSCacheEntry {
  data: any;
  timestamp: number;
  waterBodyName: string;
}

const CACHE_KEY = 'viss_cache';
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 dagar - VISS ändras sällan

class VISSCache {
  private memoryCache = new Map<string, VISSCacheEntry>();

  getCacheKey(waterBodyName: string, coordinates?: { lat: number; lon: number }): string {
    const coordsKey = coordinates ? `_${coordinates.lat.toFixed(3)}_${coordinates.lon.toFixed(3)}` : '';
    return `${waterBodyName}${coordsKey}`.toLowerCase();
  }

  get(waterBodyName: string, coordinates?: { lat: number; lon: number }): any | null {
    const key = this.getCacheKey(waterBodyName, coordinates);
    
    // Kolla memory cache först
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && Date.now() - memoryEntry.timestamp < CACHE_DURATION) {
      return memoryEntry.data;
    }

    // Kolla localStorage
    try {
      const stored = localStorage.getItem(`${CACHE_KEY}_${key}`);
      if (stored) {
        const entry: VISSCacheEntry = JSON.parse(stored);
        if (Date.now() - entry.timestamp < CACHE_DURATION) {
          // Lägg i memory cache också
          this.memoryCache.set(key, entry);
          return entry.data;
        }
      }
    } catch (error) {
      console.warn('VISS cache read error:', error);
    }

    return null;
  }

  set(waterBodyName: string, data: any, coordinates?: { lat: number; lon: number }): void {
    const key = this.getCacheKey(waterBodyName, coordinates);
    const entry: VISSCacheEntry = {
      data,
      timestamp: Date.now(),
      waterBodyName
    };

    // Spara i memory cache
    this.memoryCache.set(key, entry);

    // Spara i localStorage
    try {
      localStorage.setItem(`${CACHE_KEY}_${key}`, JSON.stringify(entry));
    } catch (error) {
      console.warn('VISS cache write error:', error);
    }
  }

  clear(): void {
    this.memoryCache.clear();
    // Rensa localStorage VISS-cache
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_KEY)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('VISS cache clear error:', error);
    }
  }

  // HÄMTA från CDN-cache API istället för direkt VISS
  async fetchFromCDN(waterBodyName: string, coordinates?: { lat: number; lon: number }): Promise<any | null> {
    try {
      const params = new URLSearchParams({
        name: waterBodyName
      });
      
      if (coordinates) {
        params.append('lat', coordinates.lat.toString());
        params.append('lon', coordinates.lon.toString());
      }

      const response = await fetch(`/api/viss-cache?${params}`, {
        // Använd CDN-cache
        cache: 'force-cache',
        next: { revalidate: 2592000 } // 30 dagar
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // Ingen VISS-data hittades
        }
        throw new Error(`CDN cache error: ${response.status}`);
      }

      const result = await response.json();
      return result.vissData;

    } catch (error) {
      console.warn('CDN cache fetch failed:', error);
      return null;
    }
  }
}

export const vissCache = new VISSCache();