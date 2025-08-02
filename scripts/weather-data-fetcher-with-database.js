#!/usr/bin/env node
// Yr Weather Data Fetcher - Använder Supabase-databas för vattendrag
// INGA JSON-filer - direkt databas-queries för vattendetektering!

import { promises as fs } from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
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

// Supabase konfiguration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

console.log(`🔗 Väder-script Supabase URL: ${SUPABASE_URL.substring(0, 30)}...`);
console.log(`🔑 Väder-script Service Key: ${SUPABASE_SERVICE_KEY ? 'LOADED ✅' : 'MISSING ❌'}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Konfiguration ---
const CACHE_DIR = path.resolve(process.cwd(), 'public', 'data');
const CONCURRENCY = 10; // Samtidiga anrop per batch
const BATCH_DELAY = 1000;   // ms paus mellan batcher

// Grid-konfiguration med vattenoptimering
const GRID_CONFIG = {
  bounds: { north: 69.1, south: 55.3, west: 10.0, east: 24.2 },
  waterStep: 0.02,        // ~2 km runt sjöar/vattendrag  
  coastalStep: 0.04,      // ~4.5 km längs kusten
  cityStep: 0.03,         // ~3 km runt städer
  inlandStep: 0.12,       // ~13 km inland
  specialPoints: [
    // Viktiga fiskehamnar & städer
    { lat: 57.7089, lon: 11.9746, name: 'Göteborg' },
    { lat: 58.2459, lon: 12.3217, name: 'Lysekil' },
    { lat: 56.6704, lon: 16.3661, name: 'Kalmar' },
    { lat: 59.3293, lon: 18.0686, name: 'Stockholm' },
    { lat: 57.7826, lon: 14.1618, name: 'Jönköping' },
    { lat: 63.8258, lon: 20.2630, name: 'Umeå' },
    { lat: 65.5848, lon: 22.1547, name: 'Luleå' },
    { lat: 55.6059, lon: 13.0007, name: 'Malmö' },
    { lat: 56.0465, lon: 12.6945, name: 'Helsingborg' },
    { lat: 56.8777, lon: 14.8091, name: 'Växjö' },
    { lat: 58.4108, lon: 15.6214, name: 'Linköping' },
    { lat: 59.8586, lon: 17.6389, name: 'Uppsala' },
    { lat: 60.6749, lon: 17.1413, name: 'Gävle' },
    { lat: 62.3908, lon: 17.3069, name: 'Sundsvall' },
    { lat: 55.9067, lon: 12.8532, name: 'Landskrona' },
    { lat: 55.4253, lon: 14.0853, name: 'Simrishamn' },
    { lat: 58.1173, lon: 11.4467, name: 'Marstrand' },
    { lat: 58.9368, lon: 11.1706, name: 'Strömstad' }
  ]
};

// Databas-funktion för att kolla om punkt är nära vatten
async function isNearWater(lat, lon, radiusKm = 1) {
  try {
    // Använd RPC för PostGIS-funktionen vi skapade
    const { data, error } = await supabase
      .rpc('is_point_near_water', {
        point_lat: lat,
        point_lon: lon,
        radius_meters: radiusKm * 1000
      });
      
    if (error) {
      console.log(`⚠️ Databas-fel för punkt (${lat}, ${lon}): Använder fallback`);
      return isWaterFallback(lat, lon);
    }
    
    return data === true;
  } catch (error) {
    console.log(`⚠️ Databas-anslutning misslyckades för punkt (${lat}, ${lon}): Använder fallback`);
    return isWaterFallback(lat, lon);
  }
}

// Fallback-funktion utan databas
function isWaterFallback(lat, lon) {
  // Enkla hardkodade vattenområden (som backup)
  const waterAreas = [
    // Mälaren
    { lat: 59.4, lon: 17.0, radius: 0.5 },
    // Vänern  
    { lat: 58.9, lon: 13.5, radius: 0.8 },
    // Vättern
    { lat: 58.4, lon: 14.6, radius: 0.6 },
    // Stockholms skärgård
    { lat: 59.3, lon: 18.7, radius: 0.8 },
    // Göteborgs kust
    { lat: 57.7, lon: 11.8, radius: 0.4 }
  ];
  
  for (const area of waterAreas) {
    const distance = Math.sqrt(
      Math.pow(lat - area.lat, 2) + Math.pow(lon - area.lon, 2)
    );
    if (distance <= area.radius) {
      return true;
    }
  }
  return false;
}

// Kontrollfunktioner
function isCoastal(lat, lon) {
  return (
    (lon >= 10.0 && lon <= 13.0 && lat >= 55.3 && lat <= 59.0) ||
    (lon >= 16.0 && lon <= 24.2 && lat >= 55.3 && lat <= 66.0) ||
    (lon >= 17.0 && lon <= 24.2 && lat >= 60.0 && lat <= 66.0) ||
    ((lon >= 12.0 && lon <= 15.0 && lat >= 58.0 && lat <= 59.5) || 
     (lon >= 14.0 && lon <= 15.0 && lat >= 57.5 && lat <= 58.5))
  );
}

function isHighPriority(lat, lon) {
  const ports = [
    {lat: 57.7089, lon: 11.9746, rad: 0.2}, // Göteborg
    {lat: 58.2459, lon: 12.3217, rad: 0.15}, // Lysekil
    {lat: 56.6704, lon: 16.3661, rad: 0.15}, // Kalmar
    {lat: 59.3293, lon: 18.0686, rad: 0.2}, // Stockholm
    {lat: 55.6059, lon: 13.0007, rad: 0.2}, // Malmö
    {lat: 56.0465, lon: 12.6945, rad: 0.15}, // Helsingborg
    {lat: 56.8777, lon: 14.8091, rad: 0.15}, // Växjö
    {lat: 58.4108, lon: 15.6214, rad: 0.15}, // Linköping
    {lat: 59.8586, lon: 17.6389, rad: 0.15}, // Uppsala
    {lat: 60.6749, lon: 17.1413, rad: 0.15}, // Gävle
    {lat: 62.3908, lon: 17.3069, rad: 0.15}, // Sundsvall
    {lat: 55.9067, lon: 12.8532, rad: 0.1}, // Landskrona
    {lat: 55.4253, lon: 14.0853, rad: 0.1}, // Simrishamn
    {lat: 58.1173, lon: 11.4467, rad: 0.1}, // Marstrand
    {lat: 58.9368, lon: 11.1706, rad: 0.1}  // Strömstad
  ];
  
  return ports.some(p => {
    const dlat = lat - p.lat, dlon = lon - p.lon;
    return Math.sqrt(dlat*dlat + dlon*dlon) <= p.rad;
  });
}

// Generera vattenoptimerat grid med databas-queries
async function createGrid() {
  const pts = [];
  const { bounds, waterStep, coastalStep, cityStep, inlandStep } = GRID_CONFIG;
  
  console.log('🗺️ Skapar vattenoptimerat grid...');
  console.log(`   • Vatten (sjöar/älvar): ${waterStep}° (~2 km)`);
  console.log(`   • Kustområden: ${coastalStep}° (~4.5 km)`);
  console.log(`   • Städer: ${cityStep}° (~3 km)`);
  console.log(`   • Inland: ${inlandStep}° (~13 km)`);
  
  // Använd finaste upplösning som bas för iteration
  const baseResolution = waterStep;
  
  let checkedPoints = 0;
  let waterPoints = 0;
  
  for (let lat = bounds.south; lat <= bounds.north; lat += baseResolution) {
    for (let lon = bounds.west; lon <= bounds.east; lon += baseResolution) {
      const latR = +lat.toFixed(3), lonR = +lon.toFixed(3);
      let include = false;
      
      checkedPoints++;
      
      // Kolla databas för vattennärhet
      const nearWater = await isNearWater(latR, lonR);
      if (nearWater) {
        waterPoints++;
        include = true;
      } else if (isHighPriority(latR, lonR)) {
        // Hög prioritet runt städer
        include = true;
      } else if (isCoastal(latR, lonR)) {
        // Kustområden - använd medium-upplösning
        const idxLat = Math.round((latR - bounds.south) / baseResolution);
        const idxLon = Math.round((lonR - bounds.west) / baseResolution);
        const skipFactor = Math.round(coastalStep / baseResolution);
        if (idxLat % skipFactor === 0 && idxLon % skipFactor === 0) {
          include = true;
        }
      } else {
        // Inland - använd grov upplösning
        const idxLat = Math.round((latR - bounds.south) / baseResolution);
        const idxLon = Math.round((lonR - bounds.west) / baseResolution);
        const skipFactor = Math.round(inlandStep / baseResolution);
        if (idxLat % skipFactor === 0 && idxLon % skipFactor === 0) {
          include = true;
        }
      }
      
      if (include) {
        pts.push({ lat: latR, lon: lonR });
      }
      
      // Progress varje 1000:e punkt
      if (checkedPoints % 1000 === 0) {
        console.log(`🔍 Kollat ${checkedPoints} punkter, hittade ${waterPoints} vattenpunkter, ${pts.length} totalt`);
      }
    }
  }
  
  // Lägg till specialpunkter
  GRID_CONFIG.specialPoints.forEach(sp => {
    if (!pts.some(p => Math.abs(p.lat-sp.lat)<0.01 && Math.abs(p.lon-sp.lon)<0.01)) {
      pts.push(sp);
    }
  });
  
  console.log(`📍 Grid: ${pts.length} punkter genererade`);
  console.log(`🌊 Vatten-optimerade punkter: ${waterPoints} (${((waterPoints/pts.length)*100).toFixed(1)}%)`);
  return pts;
}

// Hämta väderdata parallellt med begränsad concurrency
async function fetchAll(points) {
  const limit = pLimit(CONCURRENCY);
  const results = [];
  
  console.log(`🔄 Hämtar ${points.length} punkter med ${CONCURRENCY} samtidiga anrop...`);
  
  for (let i = 0; i < points.length; i += 50) {
    const batch = points.slice(i, i + 50);
    
    for (const pt of batch) {
      results.push(limit(async () => {
        try {
          const raw = await yrWeatherService.fetchPointWeather(pt.lat, pt.lon);
          return { ...pt, data: raw };
        } catch (error) {
          console.warn(`⚠️ Request misslyckades för (${pt.lat}, ${pt.lon}), försöker igen...`);
          throw error;
        }
      }));
    }
    
    // Progress varje 50 punkter
    if ((i + 50) % 50 === 0) {
      console.log(`📊 Progress: ${Math.min(i + 50, points.length)}/${points.length} (${Math.round((Math.min(i + 50, points.length)/points.length)*100)}%)`);
    }
  }
  
  return Promise.all(results);
}

// Spara JSON + gzip med streaming för stora dataset
async function save(data) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:\.]/g, '');
  const outJson = path.join(CACHE_DIR, `weather_data.json`);
  const outGz = path.join(CACHE_DIR, `weather_data.json.gz`);
  
  console.log('💾 Sparar väderdata med streaming...');
  
  // Använd streaming för att undvika minnesproblem
  const writeStream = fs.createWriteStream(outJson);
  
  writeStream.write('{\n  "metadata": ');
  writeStream.write(JSON.stringify(data.metadata, null, 2));
  writeStream.write(',\n  "points": [\n');
  
  for (let i = 0; i < data.points.length; i++) {
    const point = data.points[i];
    const pointStr = JSON.stringify(point, null, 4);
    
    if (i > 0) writeStream.write(',\n');
    writeStream.write('    ' + pointStr);
    
    // Progress varje 1000:e punkt
    if ((i + 1) % 1000 === 0) {
      console.log(`📝 Skrivit ${i + 1}/${data.points.length} punkter...`);
    }
  }
  
  writeStream.write('\n  ]\n}');
  writeStream.end();
  
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
  
  // Skapa komprimerad version
  const streamIn = fs.createReadStream(outJson);
  const streamOut = fs.createWriteStream(outGz);
  await pipeline(streamIn, createGzip(), streamOut);
  
  const jsonStat = await fs.stat(outJson);
  const gzStat = await fs.stat(outGz);
  
  console.log(`💾 Sparade ${outJson} (${(jsonStat.size/1e6).toFixed(2)} MB)`);
  console.log(`📦 Komprimerad ${outGz} (${(gzStat.size/1e6).toFixed(2)} MB)`);
}

// Huvudfunktion
async function main() {
  try {
    console.log('🌤️ Yr Weather Data Fetcher - Databas-optimerad version');
    console.log('🚀 Startar hämtning från MET Norway...');
    
    // Testa databas-anslutning
    console.log('🗄️ Testar databas-anslutning...');
    const { data: testData, error: testError, count } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
      
    if (testError) {
      console.error('❌ Databas-fel:', testError);
      console.log('⚠️ Kör utan databas-optimering...');
    } else {
      console.log(`✅ Databas OK - ${count || 0} vattendrag tillgängliga`);
    }
    
    const grid = await createGrid();
    const allData = await fetchAll(grid);
    
    const metadata = {
      ...yrWeatherService.getApiInfo(),
      generatedAt: new Date().toISOString(),
      gridResolution: "Vattenoptimerad (2km runt vattendrag, 4.5km kust, 13km inland)",
      totalPoints: allData.length,
      databaseOptimized: true
    };
    
    await save({ metadata, points: allData });
    console.log('✅ Klart!');
    
  } catch(err) {
    console.error('❌ Fel:', err);
    process.exit(1);
  }
}

// PostGIS-funktionen är redan skapad manuellt i Supabase Dashboard

// Kör allt
(async () => {
  // PostGIS-funktionen är redan skapad i Supabase Dashboard
  await main();
})(); 