import { NextResponse } from 'next/server';
import { yrWeatherService } from '@/lib/yrWeatherService';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import path from 'path';

interface WeatherRequest {
  location?: string;
  lat?: number;
  lon?: number;
  bbox?: string;
}

interface CachedWeatherPoint {
  lat: number;
  lon: number;
  data: any[];
  nearWater?: boolean;
  name?: string;
  type?: string;
}

// Fast fallback till cache om stor fil finns (optimerad version)
async function findNearestCachedWeather(targetLat: number, targetLon: number): Promise<CachedWeatherPoint | null> {
  try {
    const weatherDataPath = path.join(process.cwd(), 'public', 'data', 'weather_data.json.gz');
    
    // Kontrollera om fil finns, men använd kort timeout för att inte blockera
    try {
      await Promise.race([
        fs.access(weatherDataPath),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
      ]);
    } catch {
      console.log('❌ Cache unavailable, using live API only');
      return null;
    }

    console.log('⚡ Cache finns men vi använder live API för snabbhet');
    return null; // Forcera live API för bästa prestanda
    
  } catch (error) {
    console.log('🌐 Using live API (cache search disabled for performance)');
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const location = url.searchParams.get('location');
  
  try {
    let weatherData;
    
    if (lat && lon) {
      const targetLat = parseFloat(lat);
      const targetLon = parseFloat(lon);
      
      console.log(`🌤️ Weather request for ${targetLat}, ${targetLon}`);
      
      // Optimerad approach: Använd live Yr API direkt för snabbaste respons
      console.log(`🌐 Using live Yr API for optimal performance`);
      const forecasts = await yrWeatherService.fetchPointWeather(targetLat, targetLon);
      
      weatherData = {
        forecasts: forecasts,
        type: 'live',
        source: 'yr_api_optimized'
      };
    } else {
      throw new Error('Lat/lon parameters required');
    }
    
    const apiInfo = yrWeatherService.getApiInfo();
    
    const response = NextResponse.json({
      success: true,
      data: weatherData,
      metadata: {
        source: weatherData.source || apiInfo.provider,
        license: apiInfo.license,
        attribution: apiInfo.attribution,
        resolution: apiInfo.resolution,
        parameters: [
          'temperature', 'precipitation', 'windSpeed', 'windDirection', 
          'windGust', 'cloudCover', 'pressure', 'humidity', 'dewpoint'
        ],
        maxForecastHours: apiInfo.maxForecastHours,
        fetchedAt: new Date().toISOString()
      }
    });

    // Vercel Edge Cache - cache API responses for 10 minutes
    response.headers.set('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
    
    return response;
    
  } catch (error) {
    console.error('Weather API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch weather data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 