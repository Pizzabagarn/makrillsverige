#!/usr/bin/env node

// MINNESOPTIMERAD VERSION - löser JavaScript heap out of memory
// Streamar data istället för att ladda allt i minnet

import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';
import pLimit from 'p-limit';
import { yrWeatherService } from '../src/lib/yrWeatherService.js';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ladda .env.local fil
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
config({ path: join(projectRoot, '.env.local') });

console.log('🧠 MINNESOPTIMERAD Yr Weather Fetcher');

// Supabase konfiguration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Saknar SUPABASE_URL eller SUPABASE_SERVICE_KEY i .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// MINNESOPTIMERAD konfiguration - mindre batches
const CONFIG = {
  bounds: { north: 69.1, south: 55.3, west: 10.0, east: 24.2 },
  
  // Mindre upplösning för att minska minnesbehov
  waterResolution: 0.02,     // ~2.2km (från 0.015)
  coastalResolution: 0.04,   // ~4.4km 
  inlandResolution: 0.12,    // ~13km
  
  // MYCKET mindre batches för minnesoptimering
  spatialBatchSize: 500,     // Halverat från 1000
  weatherConcurrency: 4,     // Minskat från 8
  streamBatchSize: 100,      // Spara data i små batches
  
  waterCacheRadius: 2500,
  
  priorityPoints: [
    { lat: 57.7089, lon: 11.9746, name: 'Göteborg', type: 'major_port' },
    { lat: 58.2459, lon: 12.3217, name: 'Lysekil', type: 'fishing_port' },
    { lat: 56.6704, lon: 16.3661, name: 'Kalmar', type: 'major_port' },
    { lat: 59.3293, lon: 18.0686, name: 'Stockholm', type: 'major_port' },
    { lat: 55.6059, lon: 13.0007, name: 'Malmö', type: 'major_port' }
  ]
};

interface WeatherPoint {
  lat: number;
  lon: number;
  name?: string;
  type?: string;
  nearWater?: boolean;
}

interface ProcessedWeatherPoint extends WeatherPoint {
  data: any[];
}

// Streaming JSON Writer - skriver data direkt till disk
class StreamingJsonWriter {
  private writeStream: any;
  private first = true;
  
  constructor(filePath: string) {
    this.writeStream = fsSync.createWriteStream(filePath);
  }
  
  async start(metadata: any) {
    this.writeStream.write('{\n  "metadata": ');
    this.writeStream.write(JSON.stringify(metadata, null, 2));
    this.writeStream.write(',\n  "points": [\n');
  }
  
  writePoint(point: ProcessedWeatherPoint) {
    if (!this.first) {
      this.writeStream.write(',\n');
    } else {
      this.first = false;
    }
    this.writeStream.write('    ' + JSON.stringify(point, null, 4));
  }
  
  async finish(): Promise<void> {
    this.writeStream.write('\n  ]\n}');
    this.writeStream.end();
    
    return new Promise((resolve, reject) => {
      this.writeStream.on('finish', resolve);
      this.writeStream.on('error', reject);
    });
  }
}

// Generera mindre grid
function generateOptimizedGrid(): WeatherPoint[] {
  const points: WeatherPoint[] = [];
  const { bounds, waterResolution } = CONFIG;
  
  console.log('🗺️ Genererar minnesoptimerat grid...');
  
  for (let lat = bounds.south; lat <= bounds.north; lat += waterResolution) {
    for (let lon = bounds.west; lon <= bounds.east; lon += waterResolution) {
      const roundedLat = Math.round(lat * 1000) / 1000;
      const roundedLon = Math.round(lon * 1000) / 1000;
      
      points.push({ lat: roundedLat, lon: roundedLon });
    }
  }
  
  console.log(`📍 Minnesoptimerat grid: ${points.length} punkter`);
  return points;
}

// STREAMING batch-kontroll
async function streamingBatchCheckWater(points: WeatherPoint[]): Promise<WeatherPoint[]> {
  console.log(`🌊 Streaming batch-kontroll för ${points.length} punkter...`);
  
  const results: WeatherPoint[] = [];
  const batchSize = CONFIG.spatialBatchSize;
  
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(points.length / batchSize);
    
    console.log(`🔄 Spatial batch ${batchNum}/${totalBatches} (${batch.length} punkter)...`);
    
    try {
      const pointsJson = batch.map(p => ({ lat: p.lat, lon: p.lon }));
      
      const { data, error } = await supabase
        .rpc('batch_check_points_near_water', {
          points_json: pointsJson,
          radius_meters: CONFIG.waterCacheRadius
        });
      
      if (error) {
        console.warn(`⚠️ Spatial batch ${batchNum} fel - hoppar över`);
        continue;
      }
      
      const waterResults = data as Array<{lat: number, lon: number, nearWater: boolean}>;
      let waterCount = 0;
      
      waterResults.forEach(result => {
        if (result.nearWater) {
          waterCount++;
          results.push({ 
            lat: result.lat, 
            lon: result.lon, 
            nearWater: true 
          });
        }
      });
      
      console.log(`   ✅ Batch ${batchNum}: ${waterCount}/${batch.length} vattenpunkter`);
      
      // TVINGA garbage collection för att frigöra minne
      if (batchNum % 10 === 0 && global.gc) {
        global.gc();
        console.log(`🧹 Garbage collection körd efter batch ${batchNum}`);
      }
      
    } catch (error) {
      console.warn(`⚠️ Batch ${batchNum} kritiskt fel - hoppar över`);
    }
  }
  
  // Lägg till prioritetspunkter
  CONFIG.priorityPoints.forEach(point => {
    const exists = results.some(p => 
      Math.abs(p.lat - point.lat) < 0.01 && 
      Math.abs(p.lon - point.lon) < 0.01
    );
    if (!exists) {
      results.push({ ...point, nearWater: false });
    }
  });
  
  console.log(`🎯 Vattenfiltrering klar: ${results.length} relevanta punkter`);
  return results;
}

// STREAMING väder-hämtning med direkt disk-skrivning
async function streamingWeatherFetch(points: WeatherPoint[], outputPath: string): Promise<void> {
  console.log(`☁️ Streaming väder-hämtning för ${points.length} punkter...`);
  
  const metadata = {
    ...yrWeatherService.getApiInfo(),
    generatedAt: new Date().toISOString(),
    optimizations: {
      memoryOptimized: true,
      streamingEnabled: true,
      batchProcessing: true,
      waterProximityFiltering: true
    },
    performance: {
      totalPoints: points.length,
      estimatedMemoryUsage: 'Minimal - streaming mode'
    }
  };
  
  const writer = new StreamingJsonWriter(outputPath);
  await writer.start(metadata);
  
  const limit = pLimit(CONFIG.weatherConcurrency);
  let completed = 0;
  let saved = 0;
  
  // Process i mindre batches för minneskontroll
  for (let i = 0; i < points.length; i += CONFIG.streamBatchSize) {
    const batch = points.slice(i, i + CONFIG.streamBatchSize);
    
    const promises = batch.map(point => 
      limit(async () => {
        try {
          const weatherData = await yrWeatherService.fetchPointWeather(point.lat, point.lon);
          completed++;
          
          if (completed % 100 === 0) {
            const percent = Math.round((completed / points.length) * 100);
            console.log(`📊 Väder-progress: ${completed}/${points.length} (${percent}%)`);
          }
          
          return {
            ...point,
            data: weatherData
          };
        } catch (error) {
          completed++;
          return null;
        }
      })
    );
    
    const batchResults = await Promise.all(promises);
    
    // Skriv direkt till disk - frigör minnet
    for (const result of batchResults) {
      if (result) {
        writer.writePoint(result);
        saved++;
      }
    }
    
    // Tvinga garbage collection varje 500 punkter
    if (saved % 500 === 0 && global.gc) {
      global.gc();
      console.log(`🧹 GC efter ${saved} sparade punkter`);
    }
  }
  
  await writer.finish();
  console.log(`✅ Streaming slutförd: ${saved} punkter sparade`);
}

// Huvudfunktion
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('\n🧠 MINNESOPTIMERAD YR WEATHER FETCHER');
    console.log('=====================================');
    
    // Sätt Node.js heap limit om möjligt
    if (process.env.NODE_OPTIONS?.includes('--max-old-space-size')) {
      console.log('🔧 Node.js heap limit redan satt via NODE_OPTIONS');
    } else {
      console.log('💡 Tips: Sätt NODE_OPTIONS=--max-old-space-size=4096 för mer minne');
    }
    
    // 1. Testa databas
    console.log('\n🔍 1. Testar databas...');
    const { count } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    console.log(`✅ Databas OK - ${count || 0} vattendrag`);
    
    // 2. Generera mindre grid
    console.log('\n🗺️ 2. Genererar minnesoptimerat grid...');
    const baseGrid = generateOptimizedGrid();
    
    // 3. Streaming batch-kontroll
    console.log('\n🌊 3. Streaming vattendetektering...');
    const waterGrid = await streamingBatchCheckWater(baseGrid);
    
    // 4. Streaming väder-hämtning
    console.log('\n☁️ 4. Streaming väder-hämtning...');
    const outputPath = path.join('public', 'data', 'weather_data.json');
    await streamingWeatherFetch(waterGrid, outputPath);
    
    // 5. Komprimera
    console.log('\n📦 5. Komprimerar...');
    const gzPath = path.join('public', 'data', 'weather_data.json.gz');
    const readStream = fsSync.createReadStream(outputPath);
    const writeStream = fsSync.createWriteStream(gzPath);
    await pipeline(readStream, createGzip(), writeStream);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n🎉 MINNESOPTIMERAD SLUTFÖRD!`);
    console.log(`⏱️  Total tid: ${duration} sekunder`);
    console.log(`🧠 Minnesproblem löst med streaming!`);
    
  } catch (error) {
    console.error('\n❌ KRITISKT FEL:', error);
    process.exit(1);
  }
}

main(); 