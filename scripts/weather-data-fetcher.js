#!/usr/bin/env node

// Yr Weather Data Fetcher - Ersätter FMI med MET Norway
// Hämtar väderdata för Sverige med fiskerelevanta parametrar
// Följer MET API:s användningsvillkor och best practices

import { promises as fs } from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import pLimit from 'p-limit';
import { yrWeatherService } from '../src/lib/yrWeatherService.js';

// --- Konfiguration ---
const CACHE_DIR  = path.resolve(process.cwd(), 'public', 'data');
const CONCURRENCY = 5;      // Samtidiga anrop - snäll mot Yr API
const BATCH_DELAY = 1000;   // ms paus mellan batcher

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
    { lat: 59.3293, lon: 18.0686, name: 'Stockholm' },
    { lat: 55.6059, lon: 13.0007, name: 'Malmö' },
    { lat: 56.0465, lon: 12.6945, name: 'Helsingborg' },
    { lat: 56.1612, lon: 15.5866, name: 'Växjö' },
    { lat: 56.6704, lon: 16.3661, name: 'Kalmar' },
    { lat: 57.7826, lon: 14.1618, name: 'Jönköping' },
    { lat: 58.4108, lon: 15.6214, name: 'Linköping' },
    { lat: 59.8586, lon: 17.6389, name: 'Uppsala' },
    { lat: 60.6749, lon: 17.1413, name: 'Gävle' },
    { lat: 62.3875, lon: 17.3069, name: 'Sundsvall' },
    { lat: 63.8258, lon: 20.2630, name: 'Umeå' },
    { lat: 65.5848, lon: 22.1547, name: 'Luleå' },
    // Viktiga fiskeområden & vatten
    { lat: 58.3819, lon: 11.1322, name: 'Skagerrak' },
    
    // Stora sjöar (högsta prioritet för fiske)
    { lat: 58.3943, lon: 12.5115, name: 'Vänern' },
    { lat: 58.1173, lon: 14.7719, name: 'Vättern' },
    { lat: 60.8000, lon: 14.8000, name: 'Storsjön Jämtland' },
    { lat: 61.7000, lon: 16.1000, name: 'Ljusnan' },
    { lat: 59.4000, lon: 13.5000, name: 'Siljan' },
    { lat: 62.1000, lon: 14.6000, name: 'Ångermanälven' },
    
    // Viktiga älvar
    { lat: 59.8600, lon: 17.0300, name: 'Dalälven' },
    { lat: 60.1200, lon: 18.7100, name: 'Gävleån' },
    { lat: 62.0500, lon: 17.9400, name: 'Ljungan' },
    { lat: 63.1700, lon: 18.7100, name: 'Indalsälven' },
    { lat: 64.7500, lon: 20.9500, name: 'Skellefteälven' },
    { lat: 65.3200, lon: 21.4900, name: 'Piteälven' },
    { lat: 65.8400, lon: 23.1300, name: 'Luleälven' },
    { lat: 67.8600, lon: 20.2300, name: 'Torneälven' },
    
    // Mellansvenska sjöar
    { lat: 59.4500, lon: 18.2000, name: 'Mälaren' },
         { lat: 58.7500, lon: 14.7000, name: 'Hjälmaren' },
    { lat: 57.4000, lon: 14.4000, name: 'Bolmen' },
    { lat: 56.9000, lon: 14.1000, name: 'Åsnen' },
    // Öresund & sydkust
    { lat: 55.7585, lon: 12.9069, name: 'Öresund' },
    { lat: 56.2639, lon: 12.8649, name: 'Landskrona' },
    { lat: 55.9929, lon: 14.3055, name: 'Simrishamn' },
    // Västkusten fiskeområden
    { lat: 57.9348, lon: 11.5203, name: 'Marstrand' },
    { lat: 58.6171, lon: 11.1458, name: 'Strömstad' }
  ]
};

// Kontrollera om punkt är nära vatten (sjöar, älvar, bäckar)
function isNearWater(lat, lon) {
  // Stora sjöar med hög precision
  const majorLakes = [
    {lat: 58.3943, lon: 12.5115, rad: 0.8}, // Vänern - stor radie
    {lat: 58.1173, lon: 14.7719, rad: 0.6}, // Vättern
    {lat: 59.4500, lon: 18.2000, rad: 0.9}, // Mälaren - stor & komplex
    {lat: 60.8000, lon: 14.8000, rad: 0.3}, // Storsjön Jämtland
    {lat: 59.4000, lon: 13.5000, rad: 0.25}, // Siljan
    {lat: 58.7500, lon: 14.7000, rad: 0.3}, // Hjälmaren
    {lat: 57.4000, lon: 14.4000, rad: 0.2}, // Bolmen
    {lat: 56.9000, lon: 14.1000, rad: 0.2}, // Åsnen
  ];
  
  // Stora älvar - kräver linje-baserad kontroll
  const majorRivers = [
    // Dalälven
    {lat1: 60.6, lon1: 15.6, lat2: 60.5, lon2: 17.0, width: 0.05},
    // Gävleån  
    {lat1: 60.7, lon1: 16.8, lat2: 60.1, lon2: 17.1, width: 0.03},
    // Ångermanälven
    {lat1: 63.2, lon1: 12.3, lat2: 62.8, lon2: 17.8, width: 0.04},
    // Indalsälven
    {lat1: 63.2, lon1: 12.1, lat2: 63.1, lon2: 18.7, width: 0.04},
    // Luleälven
    {lat1: 67.1, lon1: 17.9, lat2: 65.8, lon2: 23.1, width: 0.04},
    // Torneälven  
    {lat1: 68.4, lon1: 17.9, lat2: 65.8, lon2: 23.9, width: 0.04},
  ];
  
  // Kontrollera sjöar
  for (const lake of majorLakes) {
    const distance = Math.sqrt(Math.pow(lat - lake.lat, 2) + Math.pow(lon - lake.lon, 2));
    if (distance <= lake.rad) return true;
  }
  
  // Kontrollera älvar (förenklad linje-distans)
  for (const river of majorRivers) {
    const distToRiver = distanceToLineSegment(lat, lon, river.lat1, river.lon1, river.lat2, river.lon2);
    if (distToRiver <= river.width) return true;
  }
  
  return false;
}

// Beräkna avstånd från punkt till linjesegment
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;  
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;  
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
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
    // Stora städer & fiskehamnar
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
    // Viktiga fiskeområden & kustområden
    {lat: 58.3819, lon: 11.1322, rad: 0.2}, // Skagerrak
    {lat: 55.7585, lon: 12.9069, rad: 0.15}, // Öresund
    {lat: 58.6171, lon: 11.1458, rad: 0.1}, // Strömstad
    {lat: 57.9348, lon: 11.5203, rad: 0.1}  // Marstrand
  ];
  return ports.some(p => {
    const dlat = lat - p.lat, dlon = lon - p.lon;
    return Math.sqrt(dlat*dlat + dlon*dlon) <= p.rad;
  });
}

// Generera adaptivt grid
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
      
      if (isHighPriority(latR, lonR)) {
        include = true;
      } else if (isCoastal(latR, lonR)) {
        const idxLat = Math.round((latR - bounds.south)/baseResolution);
        const idxLon = Math.round((lonR - bounds.west)/baseResolution);
        const skipFactor = Math.round(coastalStep/baseResolution);
        if (idxLat % skipFactor === 0 && idxLon % skipFactor === 0)
          include = true;
      } else {
        const idxLat = Math.round((latR - bounds.south)/baseResolution);
        const idxLon = Math.round((lonR - bounds.west)/baseResolution);
        const skipFactor = Math.round(inlandStep/baseResolution);
        if (idxLat % skipFactor === 0 && idxLon % skipFactor === 0)
          include = true;
      }
      
      if (include) pts.push({ lat: latR, lon: lonR });
    }
  }
  
  // Lägg till specialpunkter
  GRID_CONFIG.specialPoints.forEach(sp => {
    if (!pts.some(p => Math.abs(p.lat-sp.lat)<0.01 && Math.abs(p.lon-sp.lon)<0.01))
      pts.push(sp);
  });
  
  console.log(`📍 Grid: ${pts.length} punkter genererade`);
  return pts;
}

// Hämta väderdata parallellt med begränsad concurrency
async function fetchAll(points) {
  const limit = pLimit(CONCURRENCY);
  const results = [];
  
  console.log(`🔄 Hämtar ${points.length} punkter med ${CONCURRENCY} samtidiga anrop...`);
  
  let completed = 0;
  for (const pt of points) {
    results.push(limit(async () => {
      try {
        const weatherData = await yrWeatherService.fetchPointWeather(pt.lat, pt.lon);
        completed++;
        
        if (completed % 50 === 0) {
          console.log(`📊 Progress: ${completed}/${points.length} (${Math.round(completed/points.length*100)}%)`);
        }
        
        return { 
          lat: pt.lat, 
          lon: pt.lon, 
          name: pt.name,
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
        console.warn(`⚠️ Misslyckades med punkt ${pt.lat}, ${pt.lon}:`, error.message);
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
  const readStream = fs.createReadStream(outJson);
  const gzipStream = createGzip();
  const writeGzStream = fs.createWriteStream(outGz);
  
  await pipeline(readStream, gzipStream, writeGzStream);
  
  const jsonStat = await fs.stat(outJson);
  const gzStat = await fs.stat(outGz);
  
  const jsonSize = (jsonStat.size/1e6).toFixed(2);
  const gzSize = (gzStat.size/1e6).toFixed(2);
  
  console.log(`💾 Okomprimerad: ${outJson} (${jsonSize} MB)`);
  console.log(`📦 Komprimerad: ${outGz} (${gzSize} MB)`);
  console.log(`📊 Komprimering: ${Math.round((1-gzStat.size/jsonStat.size)*100)}%`);
}

// Huvud
(async () => {
  try {
    console.log('🌤️ Yr Weather Data Fetcher - Optimerad version');
    console.log('🚀 Startar hämtning från MET Norway...');
    
    const startTime = Date.now();
    const grid = createGrid();
    const allData = await fetchAll(grid);
    
    const apiInfo = yrWeatherService.getApiInfo();
    const outputData = {
      metadata: {
        generated: new Date().toISOString(),
        provider: apiInfo.provider,
        license: apiInfo.license,
        attribution: apiInfo.attribution,
        resolution: 'Adaptive: 4.5km (fiske), 9km (kust), 17km (inland)',
        coverage: {
          bounds: GRID_CONFIG.bounds,
          pointsCount: allData.length
        },
        parameters: [
          'temperature', 'precipitation', 'windSpeed', 'windDirection',
          'windGust', 'cloudCover', 'pressure', 'humidity', 'dewpoint'
        ],
        maxForecastHours: apiInfo.maxForecastHours,
        source: 'Yr/MET Norway API',
        method: 'yr_locationforecast_optimized'
      },
      points: allData
    };
    
    await save(outputData);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    const successRate = Math.round((allData.length / grid.length) * 100);
    
    console.log('✅ Yr väderdata-hämtning slutförd!');
    console.log(`   • Tid: ${duration} sekunder`);
    console.log(`   • Framgång: ${successRate}% (${allData.length}/${grid.length})`);
    console.log(`   • Attribution: ${apiInfo.attribution}`);
    
  } catch(err) {
    console.error('❌ Fel:', err);
    process.exit(1);
  }
})(); 