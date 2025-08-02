#!/usr/bin/env node
// Water-Optimized Yr Weather Data Fetcher
// Använder OSM GeoJSON data för att identifiera vattenområden
// och applicera högre upplösning runt sjöar, älvar och bäckar

import { promises as fs } from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import pLimit from 'p-limit';
import { yrWeatherService } from '../src/lib/yrWeatherService.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

// --- Konfiguration ---
const CACHE_DIR = path.resolve(process.cwd(), 'public', 'data');
const WATER_BODIES_FILE = path.join(CACHE_DIR, 'water_bodies.geojson');
const CONCURRENCY = 10; // Samtidiga anrop per batch
const BATCH_DELAY = 1000; // ms paus mellan batcher

// Grid-konfig - hög upplösning runt vatten
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
    { lat: 58.3819, lon: 11.1322, name: 'Skagerrak' },
    { lat: 59.3293, lon: 18.0686, name: 'Stockholm' },
    { lat: 56.6704, lon: 16.3661, name: 'Kalmar' },
    { lat: 57.7826, lon: 14.1618, name: 'Jönköping' },
    { lat: 63.8258, lon: 20.2630, name: 'Umeå' },
    { lat: 65.5848, lon: 22.1547, name: 'Luleå' },
    { lat: 58.3943, lon: 12.5115, name: 'Vänern' },
    { lat: 58.1173, lon: 14.7719, name: 'Vättern' },
    { lat: 55.6059, lon: 13.0007, name: 'Malmö' },
    { lat: 56.0465, lon: 12.6945, name: 'Helsingborg' },
    { lat: 56.8796, lon: 14.8059, name: 'Växjö' },
    { lat: 58.4108, lon: 15.6214, name: 'Linköping' },
    { lat: 59.8586, lon: 17.6389, name: 'Uppsala' },
    { lat: 60.6749, lon: 17.1413, name: 'Gävle' },
    { lat: 62.3875, lon: 17.3069, name: 'Sundsvall' },
    { lat: 56.0448, lon: 12.8037, name: 'Landskrona' },
    { lat: 55.4244, lon: 14.0861, name: 'Simrishamn' },
    { lat: 57.8648, lon: 11.8250, name: 'Marstrand' },
    { lat: 58.9439, lon: 11.1739, name: 'Strömstad' }
  ]
};

// Global variabel för vattendrag (laddas en gång)
let waterBodies = null;

// Ladda vattendrag från OSM GeoJSON
async function loadWaterBodies() {
  if (waterBodies) return waterBodies;
  
  console.log('🌊 Laddar svenska vattendrag från OSM GeoJSON...');
  
  try {
    const data = await fs.readFile(WATER_BODIES_FILE, 'utf8');
    waterBodies = JSON.parse(data);
    console.log(`✅ Laddade ${waterBodies.features.length} vattendrag från OSM`);
    return waterBodies;
  } catch (error) {
    console.error('❌ Kunde inte ladda vattendrag:', error.message);
    console.log('⚠️ Kör utan vattenoptimering...');
    return { features: [] };
  }
}

// Kontrollera om en punkt är nära vatten
function isNearWater(lat, lon) {
  if (!waterBodies || !waterBodies.features) return false;
  
  const testPoint = point([lon, lat]);
  
  // Testa de 100 största vattenområdena först (optimization)
  const largeBodies = waterBodies.features.slice(0, 100);
  
  for (const feature of largeBodies) {
    try {
      if (booleanPointInPolygon(testPoint, feature)) {
        return true;
      }
    } catch (err) {
      // Skippa felaktiga geometrier
      continue;
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
    {lat: 59.3293, lon: 18.0686, rad: 0.2}, // Stockholm
    {lat: 55.6059, lon: 13.0007, rad: 0.2}, // Malmö
    {lat: 56.0465, lon: 12.6945, rad: 0.15}, // Helsingborg
    {lat: 58.2459, lon: 12.3217, rad: 0.15}, // Lysekil
    {lat: 56.6704, lon: 16.3661, rad: 0.15}, // Kalmar
    {lat: 57.7826, lon: 14.1618, rad: 0.15}, // Jönköping
    {lat: 58.4108, lon: 15.6214, rad: 0.15}, // Linköping
    {lat: 59.8586, lon: 17.6389, rad: 0.15}, // Uppsala
    {lat: 60.6749, lon: 17.1413, rad: 0.15}, // Gävle
    {lat: 62.3875, lon: 17.3069, rad: 0.15}, // Sundsvall
    {lat: 63.8258, lon: 20.2630, rad: 0.15}, // Umeå
    {lat: 65.5848, lon: 22.1547, rad: 0.15}, // Luleå
    {lat: 56.8796, lon: 14.8059, rad: 0.15}, // Växjö
    {lat: 56.0448, lon: 12.8037, rad: 0.15}, // Landskrona
    {lat: 55.4244, lon: 14.0861, rad: 0.15}, // Simrishamn
    {lat: 57.8648, lon: 11.8250, rad: 0.15}, // Marstrand
    {lat: 58.9439, lon: 11.1739, rad: 0.15}, // Strömstad
  ];
  
  return ports.some(p => {
    const dlat = lat - p.lat, dlon = lon - p.lon;
    return Math.sqrt(dlat*dlat + dlon*dlon) <= p.rad;
  });
}

// Generera vattenoptimerat grid
function createGrid() {
  const pts = [];
  const { bounds, waterStep, coastalStep, cityStep, inlandStep } = GRID_CONFIG;
  
  console.log('🗺️ Skapar vattenoptimerat grid...');
  console.log(`   • Vatten (sjöar/älvar): ${waterStep}° (~2 km)`);
  console.log(`   • Kustområden: ${coastalStep}° (~4.5 km)`);
  console.log(`   • Städer: ${cityStep}° (~3 km)`);
  console.log(`   • Inland: ${inlandStep}° (~13 km)`);
  
  // Använd finaste upplösning som bas för iteration
  const baseResolution = waterStep;
  
  for (let lat = bounds.south; lat <= bounds.north; lat += baseResolution) {
    for (let lon = bounds.west; lon <= bounds.east; lon += baseResolution) {
      const latR = +lat.toFixed(3), lonR = +lon.toFixed(3);
      let include = false;
      
      // Bestäm vilken upplösning som ska användas
      if (isNearWater(latR, lonR)) {
        // Alltid inkludera punkter nära vatten
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
    }
  }

  // Lägg till specialpunkter
  GRID_CONFIG.specialPoints.forEach(sp => {
    if (!pts.some(p => Math.abs(p.lat - sp.lat) < 0.01 && Math.abs(p.lon - sp.lon) < 0.01)) {
      pts.push({ lat: sp.lat, lon: sp.lon });
    }
  });

  console.log(`📍 Grid: ${pts.length} punkter genererade`);
  return pts;
}

// Hämta väderdata parallellt med begränsad concurrency
async function fetchAll(points) {
  const limit = pLimit(CONCURRENCY);
  console.log(`🔄 Hämtar ${points.length} punkter med ${CONCURRENCY} samtidiga anrop...`);
  
  const results = [];
  let completed = 0;
  
  for (const pt of points) {
    results.push(limit(async () => {
      try {
        const raw = await yrWeatherService.fetchPointWeather(pt.lat, pt.lon);
        completed++;
        
        if (completed % 50 === 0) {
          console.log(`📊 Progress: ${completed}/${points.length} (${Math.round((completed/points.length)*100)}%)`);
        }
        
        return { ...pt, data: raw };
      } catch (error) {
        console.error(`⚠️ Fel för punkt ${pt.lat},${pt.lon}:`, error.message);
        return null;
      }
    }));
  }
  
  const allResults = await Promise.all(results);
  return allResults.filter(result => result !== null);
}

// Spara JSON + gzip (streaming för stora filer)
async function save(data) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  
  // Spara som weather_data.json (ersätter gamla)
  const outJson = path.join(CACHE_DIR, 'weather_data.json');
  const outGz   = path.join(CACHE_DIR, 'weather_data.json.gz');

  console.log(`💾 Sparar ${data.points.length} punkter med streaming...`);
  
  // Skriv JSON streaming för att undvika minnesfel
  const writeStream = fs.createWriteStream(outJson);
  
  // Skriv metadata
  writeStream.write('{\n  "metadata": ');
  writeStream.write(JSON.stringify(data.metadata, null, 2));
  writeStream.write(',\n  "points": [\n');
  
  // Skriv punkter en i taget
  for (let i = 0; i < data.points.length; i++) {
    const point = data.points[i];
    writeStream.write('    ');
    writeStream.write(JSON.stringify(point));
    if (i < data.points.length - 1) writeStream.write(',');
    writeStream.write('\n');
    
    if (i % 1000 === 0) {
      console.log(`💾 Progress: ${i}/${data.points.length} punkter sparade`);
    }
  }
  
  writeStream.write('  ]\n}');
  writeStream.end();
  
  // Vänta på att filen ska skrivas klart
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
  
  console.log(`💾 JSON-fil sparad: ${outJson}`);
  
  // Skapa gzip-version streaming
  console.log('🗜️ Skapar gzip-version...');
  const streamIn = fs.createReadStream(outJson);
  const streamOut = fs.createWriteStream(outGz);
  await pipeline(streamIn, createGzip(), streamOut);
  
  const jsonStat = await fs.stat(outJson);
  const gzStat = await fs.stat(outGz);
  
  console.log(`💾 Sparade: ${outJson} (${(jsonStat.size/1e6).toFixed(2)} MB)`);
  console.log(`📦 Komprimerat: ${outGz} (${(gzStat.size/1e6).toFixed(2)} MB)`);
}

// Huvudfunktion
(async () => {
  try {
    const startTime = Date.now();
    console.log('🌤️ Yr Weather Data Fetcher - Vattenoptimerad version');
    console.log('🚀 Startar hämtning från MET Norway...');

    // Ladda vattendrag först
    await loadWaterBodies();
    
    // Skapa vattenoptimerat grid
    const grid = createGrid();
    
    // Hämta alla väderdata
    const allData = await fetchAll(grid);
    
    // Hämta API-info
    const apiInfo = yrWeatherService.getApiInfo();
    
    // Skapa output-data
    const outputData = {
      metadata: {
        generated: new Date().toISOString(),
        provider: apiInfo.provider,
        license: apiInfo.license,
        attribution: apiInfo.attribution,
        resolution: 'Vattenoptimerad: 2km (vatten), 4.5km (kust), 3km (städer), 13km (inland)',
        coverage: {
          bounds: GRID_CONFIG.bounds,
          pointsCount: allData.length,
          waterOptimized: true,
          waterBodiesCount: waterBodies?.features?.length || 0
        },
        parameters: [
          'temperature', 'precipitation', 'windSpeed', 'windDirection',
          'windGust', 'cloudCover', 'pressure', 'humidity', 'dewpoint'
        ],
        maxForecastHours: apiInfo.maxForecastHours,
        source: 'Yr/MET Norway API + OSM Water Bodies',
        method: 'yr_locationforecast_water_optimized'
      },
      points: allData
    };
    
    await save(outputData);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    const successRate = Math.round((allData.length / grid.length) * 100);
    
    console.log(`✅ Klart! ${duration}s, ${successRate}% framgång`);
    console.log(`🌊 Vattenoptimerad väderdata sparad!`);
    
  } catch (error) {
    console.error('❌ Fel:', error);
    process.exit(1);
  }
})(); 