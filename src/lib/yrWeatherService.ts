// Yr/MET Weather Service - Professionell implementation av Meteorologisk institutt (Norge) API
// Följer MET API villkor: CC BY 4.0, korrekt attribution, begränsad trafik

// Cache result wrapper
interface CacheResult {
  fromCache: boolean;
  data: ProcessedWeatherData[];
}

interface YrTimeSeries {
  time: string;
  data: {
    instant: {
      details: {
        air_temperature?: number;
        air_pressure_at_sea_level?: number;
        cloud_area_fraction?: number;
        relative_humidity?: number;
        wind_from_direction?: number;
        wind_speed?: number;
        wind_speed_of_gust?: number;
        dew_point_temperature?: number;
      };
    };
    next_1_hours?: {
      summary?: {
        symbol_code: string;
      };
      details?: {
        precipitation_amount?: number;
      };
    };
    next_6_hours?: {
      summary?: {
        symbol_code: string;
      };
      details?: {
        precipitation_amount?: number;
      };
    };
    next_12_hours?: {
      summary?: {
        symbol_code: string;
      };
      details?: {
        precipitation_amount?: number;
      };
    };
  };
}

interface YrResponse {
  type: string;
  geometry: {
    type: string;
    coordinates: number[];
  };
  properties: {
    meta: {
      updated_at: string;
      units: Record<string, string>;
    };
    timeseries: YrTimeSeries[];
  };
}

export interface ProcessedWeatherData {
  time: string;
  temperature: number | null;          
  precipitation: number | null;        
  windSpeed: number | null;           
  windDirection: number | null;        
  windGust: number | null;            
  cloudCover: number | null;          
  pressure: number | null;            
  humidity: number | null;            
  dewpoint: number | null;            
  symbol: string | null;              
}

// Yr API konfiguration
const YR_API_CONFIG = {
  baseUrl: 'https://api.met.no/weatherapi/locationforecast/2.0',
  userAgent: `Makrill Sverige/1.0 +${process.env.NEXT_PUBLIC_SITE_URL || 'https://makrillsweden.vercel.app'} superalle96@gmail.com`,
  maxRetries: 3,
  retryDelay: 1000,
} as const;

export class YrWeatherService {
  private static instance: YrWeatherService;
  private cache: Map<string, { data: ProcessedWeatherData[], expires: Date, lastModified?: string }> = new Map();
  
  private constructor() {}
  
  public static getInstance(): YrWeatherService {
    if (!YrWeatherService.instance) {
      YrWeatherService.instance = new YrWeatherService();
    }
    return YrWeatherService.instance;
  }

  /**
   * Hämta väderprognos för en specifik punkt från Yr
   * Returnerar alla tillgängliga tidssteg (0-240h)
   */
  async fetchPointWeather(lat: number, lon: number): Promise<ProcessedWeatherData[]> {
    // Truncate coordinates to max 4 decimals as required by MET API first
    const truncatedLat = parseFloat(lat.toFixed(4));
    const truncatedLon = parseFloat(lon.toFixed(4));
    
    // Then validate the truncated coordinates
    if (!this.isValidCoordinate(truncatedLat, truncatedLon)) {
      throw new Error(`Ogiltiga koordinater: lat=${truncatedLat}, lon=${truncatedLon}`);
    }

    const result = await this.fetchWeatherWithCache(truncatedLat, truncatedLon);
    return result.data;
  }

  /**
   * Internal method that handles cache logic properly
   */
  private async fetchWeatherWithCache(lat: number, lon: number): Promise<CacheResult> {
    const cacheKey = `${lat},${lon}`;
    const url = `${YR_API_CONFIG.baseUrl}/complete?lat=${lat}&lon=${lon}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > new Date()) {
      console.log(`📦 Using cached data for ${cacheKey}`);
      return { fromCache: true, data: cached.data };
    }
    
    try {
      const response = await this.makeRequestWithCache(url, cached);
      
      // Handle 304 Not Modified - use cached data
      if (response.status === 304 && cached) {
        console.log(`📦 Data not modified, using cache for ${cacheKey}`);
        // Update expires time but keep same data
        const expiresHeader = response.headers.get('expires');
        if (expiresHeader) {
          cached.expires = new Date(expiresHeader);
          this.cache.set(cacheKey, cached);
        }
        return { fromCache: true, data: cached.data };
      }
      
      // Handle 203 Non-Authoritative (deprecated/beta)
      if (response.status === 203) {
        console.warn(`⚠️ API endpoint is deprecated or in beta: ${url}`);
      }
      
      // Handle 429 Too Many Requests
      if (response.status === 429) {
        console.error(`🚫 Rate limited by MET API. Respect the traffic limits!`);
        throw new Error(`Rate limited by MET API. Please reduce request frequency.`);
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: YrResponse = await response.json();
      const processedData = this.processYrData(data);
      
      // Cache the data according to MET API headers
      const expiresHeader = response.headers.get('expires');
      const lastModifiedHeader = response.headers.get('last-modified');
      
      if (expiresHeader) {
        const expires = new Date(expiresHeader);
        this.cache.set(cacheKey, {
          data: processedData,
          expires,
          lastModified: lastModifiedHeader || undefined
        });
        console.log(`💾 Cached weather data until ${expires.toISOString()}`);
      }
      
      return { fromCache: false, data: processedData };
      
    } catch (error) {
      console.error(`❌ Yr API fel för punkt ${lat},${lon}:`, error);
      throw new Error(`Kunde inte hämta väderdata från Yr: ${error instanceof Error ? error.message : 'Okänt fel'}`);
    }
  }

  /**
   * Hämta väderdata för flera punkter (batch processing)
   * Respekterar MET API rate limits med 200ms delay mellan requests
   */
  async fetchMultiplePoints(points: Array<{lat: number, lon: number}>): Promise<Array<{lat: number, lon: number, data: ProcessedWeatherData[]}>> {
    const results: Array<{lat: number, lon: number, data: ProcessedWeatherData[]}> = [];
    
    console.log(`🌤️ Batch processing ${points.length} weather points with rate limiting...`);
    
    // Batch requests med delay för att respektera API-begränsningar
    // MET API limit: ~20 req/sec, vi använder 200ms = 5 req/sec för säkerhet
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      
      try {
        // Använd den nya cache-aware metoden
        const result = await this.fetchWeatherWithCache(
          parseFloat(point.lat.toFixed(4)), 
          parseFloat(point.lon.toFixed(4))
        );
        
        results.push({
          lat: point.lat,
          lon: point.lon,
          data: result.data
        });
        
        const cacheStatus = result.fromCache ? '📦 Cache' : '🌐 API';
        console.log(`✅ ${cacheStatus} - Point ${i + 1}/${points.length} (${point.lat}, ${point.lon})`);
        
        // Lägg in paus mellan requests, men hoppa över för cache hits
        if (i < points.length - 1 && !result.fromCache) {
          console.log(`⏳ Rate limiting delay (200ms)...`);
          await this.delay(200);
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed for point ${point.lat}, ${point.lon}:`, error);
        // Fortsätt med nästa punkt även om denna misslyckas
      }
    }
    
    console.log(`🎯 Batch complete: ${results.length}/${points.length} successful`);
    
    return results;
  }

  /**
   * Gör HTTP-request med retry-logik och HTTP caching enligt MET API villkor
   */
  private async makeRequestWithCache(
    url: string, 
    cached?: { data: ProcessedWeatherData[], expires: Date, lastModified?: string },
    retries: number = YR_API_CONFIG.maxRetries
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': YR_API_CONFIG.userAgent,
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate', // Required by MET API
    };

    // Add If-Modified-Since header if we have cached data
    if (cached?.lastModified) {
      headers['If-Modified-Since'] = cached.lastModified;
    }

    try {
      const response = await fetch(url, { headers });
      return response;
    } catch (error) {
      if (retries > 0) {
        console.warn(`⚠️ Request misslyckades, försöker igen (${retries} försök kvar)...`);
        await this.delay(YR_API_CONFIG.retryDelay);
        return this.makeRequestWithCache(url, cached, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Bearbeta Yr API response till vårt standardformat
   */
  private processYrData(data: YrResponse): ProcessedWeatherData[] {
    if (!data.properties?.timeseries) {
      throw new Error('Ogiltig Yr API response: timeseries saknas');
    }

    return data.properties.timeseries.map(entry => {
      const instant = entry.data.instant?.details;
      const next1h = entry.data.next_1_hours;
      const next6h = entry.data.next_6_hours;
      const next12h = entry.data.next_12_hours;

      // Hämta nederbörd från närmaste tillgängliga period
      // YR ger TOTAL nederbörd för perioden (inte per timme)
      let precipitation: number | null = null;
      if (next1h?.details?.precipitation_amount !== undefined) {
        precipitation = next1h.details.precipitation_amount; // 1h total
      } else if (next6h?.details?.precipitation_amount !== undefined) {
        precipitation = next6h.details.precipitation_amount; // 6h total (INTE delat med 6!)
      } else if (next12h?.details?.precipitation_amount !== undefined) {
        precipitation = next12h.details.precipitation_amount; // 12h total (INTE delat med 12!)
      }

      // Hämta väder-symbol
      let symbol: string | null = null;
      if (next1h?.summary?.symbol_code) {
        symbol = next1h.summary.symbol_code;
      } else if (next6h?.summary?.symbol_code) {
        symbol = next6h.summary.symbol_code;
      } else if (next12h?.summary?.symbol_code) {
        symbol = next12h.summary.symbol_code;
      }

      const processedEntry = {
        time: entry.time,
        temperature: instant?.air_temperature ?? null,
        precipitation,
        windSpeed: instant?.wind_speed ?? null,
        windDirection: instant?.wind_from_direction ?? null,
        windGust: instant?.wind_speed_of_gust ?? null,
        cloudCover: instant?.cloud_area_fraction ?? null,
        pressure: instant?.air_pressure_at_sea_level ?? null,
        humidity: instant?.relative_humidity ?? null,
        dewpoint: instant?.dew_point_temperature ?? null,
        symbol
      };
      

      
      return processedEntry;
    });
  }

  /**
   * Validera koordinater
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Hämta metadata om API:et
   */
  getApiInfo() {
    return {
      provider: 'Meteorologisk institutt (MET Norway)',
      license: 'CC BY 4.0',
      attribution: 'Data från Meteorologisk institutt (MET Norway)',
      resolution: 'MEPS 2.5km (0-60h), ECMWF 9km (60-240h)',
      updateFrequency: '4 gånger per dag (00, 06, 12, 18 UTC)',
      maxForecastHours: 240,
      userAgent: YR_API_CONFIG.userAgent,
      compliance: {
        coordinatePrecision: '4 decimals max (auto-truncated)',
        httpCaching: 'If-Modified-Since, Expires headers, in-memory cache',
        rateLimit: '200ms delay between requests (5 req/sec, well under 20 req/sec limit)',
        statusCodes: '203 (deprecated), 304 (not modified), 429 (rate limited)',
        headers: 'User-Agent identification, Accept-Encoding: gzip/deflate',
        vercelEdgeCache: '10 minutes CDN cache with stale-while-revalidate'
      }
    };
  }
}

// Export singleton instance
export const yrWeatherService = YrWeatherService.getInstance(); 