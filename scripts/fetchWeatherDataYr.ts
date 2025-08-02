#!/usr/bin/env node

// Yr Weather Data Fetcher - Ersätter FMI med Meteorologisk institutt (Norge)
// Hämtar väderdata för hela Sverige med alla fiskerelevanta parametrar
// Följer MET API:s användningsvillkor och best practices

import { promises as fs } from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { yrWeatherService } from '../src/lib/yrWeatherService.js';

console.log('🌤️  Yr Weather Data Fetcher - Hämtar väderprognos från Norge...');

// Konfigurera grid för svenska vatten och kustområden
const SWEDEN_GRID_CONFIG = {
  // Större täckning för hela Sverige och närliggande vatten
  bounds: {
    north: 69.1,    // Nordligaste Sverige  
    south: 55.3,    // Sydligaste Sverige
    west: 10.0,     // Västkusten + margin
    east: 24.2      // Östkusten + margin
  },
  
  // Adaptiv upplösning baserat på område:
  coastalResolution: 0.045,  // ~5 km för kust & berg (fiskerelevant)
  inlandResolution: 0.09,    // ~10 km för inland
  highPrecisionResolution: 0.023, // ~2.5 km för viktiga fiskeområden
  
  // Extra punkter för viktiga fiskeområden
  specialPoints: [
    // Västkusten - viktiga fiskeplatser
    { lat: 57.7089, lon: 11.9746, name: 'Göteborg' },
    { lat: 58.2459, lon: 12.3217, name: 'Lysekil' },
    { lat: 58.3819, lon: 11.1322, name: 'Skagerrak' },
    
    // Östersjön 
    { lat: 59.3293, lon: 18.0686, name: 'Stockholm' },
    { lat: 56.6704, lon: 16.3661, name: 'Kalmar' },
    { lat: 57.7826, lon: 14.1618, name: 'Jönköping region' },
    
    // Bottniska viken
    { lat: 63.8258, lon: 20.2630, name: 'Umeå' },
    { lat: 65.5848, lon: 22.1547, name: 'Luleå' },
    
    // Vänern & Vättern
    { lat: 58.3943, lon: 12.5115, name: 'Vänern' },
    { lat: 58.1173, lon: 14.7719, name: 'Vättern' }
  ]
};

interface WeatherGridPoint {
  lat: number;
  lon: number;
  name?: string;
  data: Array<{
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
  }>;
}

// Kontrollera om punkt är i kustområde (viktigt för fiske)
function isCoastalArea(lat: number, lon: number): boolean {
  // Västkusten (Skagerrak/Kattegat)
  if (lon >= 10.0 && lon <= 13.0 && lat >= 55.3 && lat <= 59.0) return true;
  
  // Östersjön östkust
  if (lon >= 16.0 && lon <= 24.2 && lat >= 55.3 && lat <= 66.0) return true;
  
  // Bottniska viken
  if (lon >= 17.0 && lon <= 24.2 && lat >= 60.0 && lat <= 66.0) return true;
  
  // Stora sjöar (Vänern, Vättern)
  if ((lon >= 12.0 && lon <= 15.0 && lat >= 58.0 && lat <= 59.5) || // Vänern
      (lon >= 14.0 && lon <= 15.0 && lat >= 57.5 && lat <= 58.5)) return true; // Vättern
  
  return false;
}

// Kontrollera om punkt är högprioritetsområde för fiske
function isHighPriorityFishingArea(lat: number, lon: number): boolean {
  // Skagerrak & Kattegat (viktiga makrillfiskeområden)
  if (lon >= 10.5 && lon <= 12.5 && lat >= 57.0 && lat <= 58.5) return true;
  
  // Områden runt stora fiskehamnar
  const fishingPorts = [
    {lat: 57.7089, lon: 11.9746, radius: 0.2}, // Göteborg
    {lat: 58.2459, lon: 12.3217, radius: 0.15}, // Lysekil  
    {lat: 56.6704, lon: 16.3661, radius: 0.15}, // Kalmar
    {lat: 59.3293, lon: 18.0686, radius: 0.2}, // Stockholm
  ];
  
  return fishingPorts.some(port => {
    const distance = Math.sqrt(Math.pow(lat - port.lat, 2) + Math.pow(lon - port.lon, 2));
    return distance <= port.radius;
  });
}

// Generera adaptivt grid med olika upplösning för olika områden
function createSwedenGrid(): Array<{lat: number, lon: number, name?: string}> {
  const points: Array<{lat: number, lon: number, name?: string}> = [];
  const { bounds, coastalResolution, inlandResolution, highPrecisionResolution } = SWEDEN_GRID_CONFIG;
  
  console.log('🗺️ Skapar adaptivt grid för Sverige...');
  console.log(`   • Hög precision (fiske): ${highPrecisionResolution}° (~2.5 km)`);
  console.log(`   • Kustområden: ${coastalResolution}° (~5 km)`);
  console.log(`   • Inland: ${inlandResolution}° (~10 km)`);
  
  // Använd finaste upplösning som bas för iteration
  const baseResolution = highPrecisionResolution;
  
  for (let lat = bounds.south; lat <= bounds.north; lat += baseResolution) {
    for (let lon = bounds.west; lon <= bounds.east; lon += baseResolution) {
      const roundedLat = Math.round(lat * 1000) / 1000; // 3 decimaler för precision
      const roundedLon = Math.round(lon * 1000) / 1000;
      
      // Bestäm vilken upplösning som ska användas för denna punkt
      let shouldInclude = false;
      
      if (isHighPriorityFishingArea(roundedLat, roundedLon)) {
        // Högsta precision för viktiga fiskeområden
        shouldInclude = true;
      } else if (isCoastalArea(roundedLat, roundedLon)) {
        // Medel precision för kustområden - ta varannan punkt
        const latIndex = Math.round((lat - bounds.south) / baseResolution);
        const lonIndex = Math.round((lon - bounds.west) / baseResolution);
        const skipFactor = Math.round(coastalResolution / baseResolution);
        shouldInclude = (latIndex % skipFactor === 0) && (lonIndex % skipFactor === 0);
      } else {
        // Lägre precision för inland - ta var fjärde punkt
        const latIndex = Math.round((lat - bounds.south) / baseResolution);
        const lonIndex = Math.round((lon - bounds.west) / baseResolution);
        const skipFactor = Math.round(inlandResolution / baseResolution);
        shouldInclude = (latIndex % skipFactor === 0) && (lonIndex % skipFactor === 0);
      }
      
      if (shouldInclude) {
        points.push({ 
          lat: roundedLat, 
          lon: roundedLon 
        });
      }
    }
  }
  
  // Lägg till specialpunkter för viktiga fiskeområden
  SWEDEN_GRID_CONFIG.specialPoints.forEach(point => {
    // Kontrollera om punkten redan finns i gridet
    const exists = points.some(p => 
      Math.abs(p.lat - point.lat) < 0.01 && 
      Math.abs(p.lon - point.lon) < 0.01
    );
    
    if (!exists) {
      points.push({
        lat: point.lat,
        lon: point.lon,
        name: point.name
      });
    }
  });
  
  console.log(`📍 Genererade ${points.length} grid-punkter för Sverige`);
  return points;
}

// Batch-hantering för att inte överbelasta API:et
async function fetchWeatherInBatches(points: Array<{lat: number, lon: number, name?: string}>): Promise<WeatherGridPoint[]> {
  const BATCH_SIZE = 10; // Mindre batches för att vara snäll mot API:et
  const BATCH_DELAY = 2000; // 2 sekunder mellan batches
  
  const results: WeatherGridPoint[] = [];
  const totalBatches = Math.ceil(points.length / BATCH_SIZE);
  
  console.log(`🔄 Bearbetar ${points.length} punkter i ${totalBatches} batches...`);
  
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    
    console.log(`📦 Batch ${batchNumber}/${totalBatches} - Hämtar ${batch.length} punkter...`);
    
    // Parallell bearbetning inom batchen
    const batchPromises = batch.map(async (point) => {
      try {
        const weatherData = await yrWeatherService.fetchPointWeather(point.lat, point.lon);
        
        return {
          lat: point.lat,
          lon: point.lon,
          name: point.name,
          data: weatherData.map(entry => ({
            time: entry.time,
            temperature: entry.temperature,
            precipitation: entry.precipitation,
            windSpeed: entry.windSpeed,
            windDirection: entry.windDirection,
            windGust: entry.windGust,
            cloudCover: entry.cloudCover,
            pressure: entry.pressure,
            humidity: entry.humidity,
            dewpoint: entry.dewpoint
          }))
        };
      } catch (error) {
        console.warn(`⚠️ Misslyckades med punkt ${point.lat}, ${point.lon}:`, error);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Filtrera bort misslyckade requests
    batchResults.forEach(result => {
      if (result) {
        results.push(result);
      }
    });
    
    console.log(`✅ Batch ${batchNumber} klar - ${results.length}/${points.length} punkter hämtade`);
    
    // Paus mellan batches
    if (i + BATCH_SIZE < points.length) {
      console.log(`⏳ Väntar ${BATCH_DELAY/1000}s innan nästa batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  return results;
}

// Spara komprimerad väderdata
async function saveWeatherData(weatherPoints: WeatherGridPoint[]): Promise<void> {
  const apiInfo = yrWeatherService.getApiInfo();
  
  const outputData = {
    metadata: {
      generated: new Date().toISOString(),
      provider: apiInfo.provider,
      license: apiInfo.license,
      attribution: apiInfo.attribution,
      resolution: apiInfo.resolution,
             coverage: {
         bounds: SWEDEN_GRID_CONFIG.bounds,
         gridResolution: 'Adaptive: 2.5km (fiske), 5km (kust), 10km (inland)',
         pointsCount: weatherPoints.length
       },
      parameters: [
        'temperature', 'precipitation', 'windSpeed', 'windDirection',
        'windGust', 'cloudCover', 'pressure', 'humidity', 'dewpoint'
      ],
      maxForecastHours: apiInfo.maxForecastHours,
      source: 'Yr/MET Norway API',
      method: 'yr_locationforecast_batch'
    },
    points: weatherPoints
  };
  
  // Spara okomprimerad version för utveckling
  const jsonPath = path.join('public', 'data', 'weather_data.json');
  await fs.writeFile(jsonPath, JSON.stringify(outputData, null, 2));
  console.log(`💾 Sparade okomprimerad väderdata: ${jsonPath}`);
  
  // Spara komprimerad version för produktion
  const gzPath = path.join('public', 'data', 'weather_data.json.gz');
  const jsonString = JSON.stringify(outputData);
  const readable = Readable.from([jsonString]);
  const gzip = createGzip();
  const writeStream = require('fs').createWriteStream(gzPath);
  
  await pipeline(readable, gzip, writeStream);
  console.log(`📦 Sparade komprimerad väderdata: ${gzPath}`);
  
  // Statistik
  const fileSizeMB = Math.round((Buffer.byteLength(jsonString) / 1024 / 1024) * 100) / 100;
  const gzipStats = await fs.stat(gzPath);
  const gzipSizeMB = Math.round((gzipStats.size / 1024 / 1024) * 100) / 100;
  
  console.log(`📊 Datastatistik:`);
  console.log(`   • Punkter: ${weatherPoints.length}`);
  console.log(`   • Storlek: ${fileSizeMB} MB (okomprimerad)`);
  console.log(`   • Gzip: ${gzipSizeMB} MB (${Math.round((gzipSizeMB/fileSizeMB)*100)}% av original)`);
  
  if (weatherPoints.length > 0) {
    const samplePoint = weatherPoints[0];
    console.log(`   • Tidssteg per punkt: ${samplePoint.data.length}`);
    console.log(`   • Första prognos: ${samplePoint.data[0]?.time}`);
    console.log(`   • Sista prognos: ${samplePoint.data[samplePoint.data.length - 1]?.time}`);
  }
}

// Huvudfunktion
async function main() {
  try {
    console.log('🚀 Startar Yr väderdata-hämtning för Sverige...');
    
    const startTime = Date.now();
    
    // 1. Generera grid
    const gridPoints = createSwedenGrid();
    
    // 2. Hämta väderdata
    const weatherData = await fetchWeatherInBatches(gridPoints);
    
    if (weatherData.length === 0) {
      throw new Error('Ingen väderdata kunde hämtas');
    }
    
    // 3. Spara resultat
    await saveWeatherData(weatherData);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    const successRate = Math.round((weatherData.length / gridPoints.length) * 100);
    
    console.log('✅ Yr väderdata-hämtning slutförd!');
    console.log(`   • Tid: ${duration} sekunder`);
    console.log(`   • Framgång: ${successRate}% (${weatherData.length}/${gridPoints.length})`);
    console.log(`   • Attribution: ${yrWeatherService.getApiInfo().attribution}`);
    
  } catch (error) {
    console.error('❌ Fel vid hämtning av väderdata:', error);
    process.exit(1);
  }
}

// Kör scriptet direkt
main().catch(error => {
  console.error('❌ Fel:', error);
  process.exit(1);
}); 