// Lätt geocoding-tjänst med smart caching för prestanda
// Använder Nominatim API (gratis, ingen API-key krävs)

interface GeocodeResult {
  placeName: string | null;
  cached: boolean;
  timestamp: number;
}

interface CacheEntry {
  placeName: string | null;
  timestamp: number;
  coordinates: string; // För att identifiera cachead position
}

class GeocodingService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 timmar cache
  private readonly REQUEST_DELAY = 100; // 100ms mellan requests för att vara snäll mot API
  private lastRequestTime = 0;
  private readonly COORDINATE_PRECISION = 3; // Avrunda till ~100m precision för bättre cache-hits

  // Skapa cache-nyckel med avrundade koordinater för bättre cache-träffar
  private getCacheKey(lat: number, lon: number): string {
    const roundedLat = Math.round(lat * Math.pow(10, this.COORDINATE_PRECISION)) / Math.pow(10, this.COORDINATE_PRECISION);
    const roundedLon = Math.round(lon * Math.pow(10, this.COORDINATE_PRECISION)) / Math.pow(10, this.COORDINATE_PRECISION);
    return `${roundedLat},${roundedLon}`;
  }

  // Kontrollera om cache-post är giltig
  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.CACHE_DURATION;
  }

  // Hämta platsnamn med smart caching
  async getPlaceName(lat: number, lon: number): Promise<GeocodeResult> {
    const cacheKey = this.getCacheKey(lat, lon);
    
    // Kontrollera cache först
    const cachedEntry = this.cache.get(cacheKey);
    if (cachedEntry && this.isCacheValid(cachedEntry)) {
      return {
        placeName: cachedEntry.placeName,
        cached: true,
        timestamp: cachedEntry.timestamp
      };
    }

    try {
      // Rate limiting - vänta om nödvändigt
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.REQUEST_DELAY) {
        await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY - timeSinceLastRequest));
      }

      this.lastRequestTime = Date.now();

      // Försök hämta från Nominatim
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=sv,en`,
        {
          headers: {
            'User-Agent': 'MakrillSverige/1.0 (https://makrillsverige.se)'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      let placeName: string | null = null;

      if (data && data.display_name) {
        // Extrahera relevant platsnamn från Nominatim svar
        placeName = this.extractPlaceName(data);
      }

      // Cacha resultatet (även null-resultat för att undvika upprepade försök)
      const cacheEntry: CacheEntry = {
        placeName,
        timestamp: Date.now(),
        coordinates: cacheKey
      };
      this.cache.set(cacheKey, cacheEntry);

      return {
        placeName,
        cached: false,
        timestamp: Date.now()
      };

    } catch (error) {
      // Tyst fel - geocoding är optional
      
      // Cacha null-resultat för att undvika upprepade försök
      const errorCacheEntry: CacheEntry = {
        placeName: null,
        timestamp: Date.now(),
        coordinates: cacheKey
      };
      this.cache.set(cacheKey, errorCacheEntry);

      return {
        placeName: null,
        cached: false,
        timestamp: Date.now()
      };
    }
  }

  // Extrahera relevant platsnamn från Nominatim-data
  private extractPlaceName(data: any): string | null {
    const address = data.address || {};
    
    // Prioritera svenska geografiska namn för marina områden
    const candidates = [
      address.island,           // Ö
      address.village,          // By
      address.town,            // Stad
      address.city,            // Större stad
      address.municipality,     // Kommun
      address.county,          // Län
      address.archipelago,     // Skärgård
      address.bay,             // Vik
      address.cape,            // Udde
      address.reef,            // Rev
      address.lighthouse,      // Fyr
      address.harbour || address.marina, // Hamn/Marina
    ].filter(Boolean);

    if (candidates.length > 0) {
      // Returnera det mest specifika namnet
      return candidates[0];
    }

    // Fallback till display_name men förenkla det
    if (data.display_name) {
      const parts = data.display_name.split(',');
      // Ta första delen som oftast är mest relevant
      return parts[0].trim();
    }

    return null;
  }

  // Rensa gammal cache (kan köras periodiskt)
  cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isCacheValid(entry)) {
        this.cache.delete(key);
      }
    }
  }

  // Hämta cache-statistik för debugging
  getCacheStats(): { size: number; hitRate: number } {
    const size = this.cache.size;
    // Hit rate skulle behöva räknas över tid, för nu bara cache-storlek
    return { size, hitRate: 0 };
  }
}

// Singleton instance för global användning
export const geocodingService = new GeocodingService();

// Export interface för TypeScript
export type { GeocodeResult }; 