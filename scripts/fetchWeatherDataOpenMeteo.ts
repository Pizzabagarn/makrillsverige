import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🌤️ Open-Meteo API (GRATIS och kraftfull!)
// Dokumentation: https://open-meteo.com/en/docs

// 🎯 ALLA parametrar du vill ha
const WEATHER_PARAMETERS = {
  // Grundläggande väderdata
  temperature_2m: 'temperature',           // Lufttemperatur 2m
  precipitation: 'precipitation',          // Nederbörd
  windspeed_10m: 'windSpeed',             // Vindhastighet 10m
  winddirection_10m: 'windDirection',     // Vindriktning 10m
  windgusts_10m: 'windGust',              // Vindbyar 10m
  cloudcover: 'cloudCover',               // Molntäcke
  surface_pressure: 'pressure',           // Lufttryck vid ytan
  
  // Bonus parametrar (gratis med Open-Meteo!)
  relativehumidity_2m: 'humidity',        // Luftfuktighet
  dewpoint_2m: 'dewpoint',                // Daggpunkt
  visibility: 'visibility',               // Siktlängd
  uv_index: 'uvIndex',                    // UV-index
};

// 📍 Skapa rutnät av punkter för hela bbox
function createGridPoints(bbox: string, gridSize: number = 20): Array<{lat: number, lon: number}> {
  const [west, south, east, north] = bbox.split(',').map(Number);
  
  const latStep = (north - south) / gridSize;
  const lonStep = (east - west) / gridSize;
  
  const points: Array<{lat: number, lon: number}> = [];
  
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const lat = south + (i * latStep);
      const lon = west + (j * lonStep);
      points.push({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
    }
  }
  
  console.log(`📍 Skapade ${points.length} punkter i rutnät (${gridSize+1}×${gridSize+1})`);
  return points;
}

// 🌤️ Hämta väderdata från Open-Meteo för en batch av punkter
async function fetchOpenMeteoData(points: Array<{lat: number, lon: number}>): Promise<any> {
  const lats = points.map(p => p.lat).join(',');
  const lons = points.map(p => p.lon).join(',');
  
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    hourly: Object.keys(WEATHER_PARAMETERS).join(','),
    timezone: 'Europe/Stockholm',
    forecast_days: '5'  // 5 dagars prognos - använd standardmodeller
  });
  
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  
  console.log(`📡 Open-Meteo URL för ${points.length} punkter:`);
  console.log(`🔗 ${url.substring(0, 100)}...`);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Open-Meteo API fel: ${response.status} - ${await response.text()}`);
  }
  
  return response.json();
}

// 🔄 Bearbeta Open-Meteo data
function processOpenMeteoData(data: any): Array<any> {
  console.log(`📊 Open-Meteo response: ${data.length} platser`);
  
  const processedPoints: Array<any> = [];
  
  // Open-Meteo kan returnera array för flera punkter eller objekt för en punkt
  const locations = Array.isArray(data) ? data : [data];
  
  locations.forEach((location: any, locationIndex: number) => {
    const times = location.hourly?.time || [];
    const hourlyData = location.hourly || {};
    
    console.log(`📍 Plats ${locationIndex + 1}: ${times.length} tidssteg, lat ${location.latitude}, lon ${location.longitude}`);
    
    // Skapa tidsserie-data
    const timeSeriesData = times.map((time: string, timeIndex: number) => {
      const timeData: any = { time };
      
      // Bearbeta alla parametrar
      Object.entries(WEATHER_PARAMETERS).forEach(([openMeteoParam, ourParam]) => {
        const values = hourlyData[openMeteoParam];
        if (values && values[timeIndex] !== null) {
          let value = values[timeIndex];
          
          // Konvertera enheter där det behövs
          switch (ourParam) {
            case 'temperature':
            case 'dewpoint':
              value = Math.round(value * 10) / 10; // °C (redan rätt)
              break;
            case 'precipitation':
              value = Math.round(value * 100) / 100; // mm (redan rätt)
              break;
            case 'windSpeed':
            case 'windGust':
              value = Math.round(value * 36) / 100; // m/s till km/h, sedan tillbaka till m/s för konsistens
              value = Math.round(value * 10) / 10;
              break;
            case 'windDirection':
              value = Math.round(value); // grader
              break;
            case 'cloudCover':
              value = Math.round(value); // procent (redan rätt)
              break;
            case 'pressure':
              value = Math.round(value * 10) / 10; // hPa (redan rätt)
              break;
            case 'humidity':
              value = Math.round(value); // procent
              break;
            case 'visibility':
              value = Math.round(value / 1000 * 10) / 10; // m till km
              break;
            case 'uvIndex':
              value = Math.round(value * 10) / 10;
              break;
          }
          
          timeData[ourParam] = value;
        }
      });
      
      return timeData;
    });
    
    processedPoints.push({
      lat: location.latitude,
      lon: location.longitude,
      data: timeSeriesData
    });
  });
  
  return processedPoints;
}

// 💾 Spara som gzippad JSON
async function saveWeatherData(data: any, outputPath: string) {
  console.log('💾 Sparar kompletta Open-Meteo väderdata som gzip...');
  
  const jsonString = JSON.stringify(data, null, 0);
  const readable = Readable.from([jsonString]);
  const gzipStream = createGzip({ level: 9 });
  const writeStream = (await import('fs')).createWriteStream(outputPath + '.gz');
  
  await pipeline(readable, gzipStream, writeStream);
  
  const stats = await fs.stat(outputPath + '.gz');
  console.log(`✅ KOMPLETTA VÄDERDATA sparade!`);
  console.log(`📁 GZIP: ${outputPath}.gz (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
}

// 🚀 Huvudfunktion
async function main() {
  console.log('🌤️ Hämtar ALLA väderparametrar med Open-Meteo API...\n');
  
  const bbox = '2.970702,54.824871,26.613280,70'; // Din bbox
  const outputPath = path.join(process.cwd(), 'public', 'data', 'weather_data.json');
  
  console.log('🗺️ BBOX:', bbox);
  console.log('📊 Parametrar:', Object.values(WEATHER_PARAMETERS).join(', '));
  console.log('🌐 API: Open-Meteo (GRATIS)');
  console.log('🏷️ Modeller: Standardmodeller (bästa täckning)');
  console.log('📅 Prognosperiod: 5 dagar');
  console.log('');
  
  try {
    // Skapa rutnät av punkter - extremt hög upplösning 
    const gridPoints = createGridPoints(bbox, 50); // 51x51 = 2601 punkter (högre än havsdata för bästa möjliga precision)
    
    const allPointsData = [];
    const batchSize = 5; // Mindre batchar för högre upplösning, för att inte överbelasta API:et
    
    console.log(`📡 Hämtar väderdata i batchar om ${batchSize} punkter...\n`);
    
    // Bearbeta i batchar
    for (let i = 0; i < gridPoints.length; i += batchSize) {
      const batch = gridPoints.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(gridPoints.length / batchSize);
      
      console.log(`📦 Batch ${batchNum}/${totalBatches}: ${batch.length} punkter`);
      
      try {
        const batchData = await fetchOpenMeteoData(batch);
        const processedBatch = processOpenMeteoData(batchData);
        
        allPointsData.push(...processedBatch);
        
        console.log(`✅ Batch ${batchNum} klar: ${processedBatch.length} punkter\n`);
        
        // Kort paus mellan batchar för att vara snäll mot API:et
        if (i + batchSize < gridPoints.length) {
          console.log('⏳ Väntar 1 sekund...\n');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Batch ${batchNum} misslyckades:`, error instanceof Error ? error.message : String(error));
        console.log('⏳ Väntar 5 sekunder innan nästa batch...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (allPointsData.length === 0) {
      throw new Error('Ingen väderdata kunde hämtas från Open-Meteo!');
    }
    
    // Skapa output-struktur
    const outputData = {
      bbox,
      parameters: Object.values(WEATHER_PARAMETERS),
      collection: 'open_meteo_forecast',
      method: 'open_meteo_api',
      points: allPointsData,
      stats: {
        totalPoints: allPointsData.length,
        timeSteps: allPointsData[0]?.data?.length || 0,
        parametersCount: Object.keys(WEATHER_PARAMETERS).length,
        forecastDays: 5
      }
    };
    
    // Spara data
    await saveWeatherData(outputData, outputPath);
    
    console.log('\n🎯 SAMMANFATTNING:');
    console.log(`✅ Totalt punkter: ${allPointsData.length}`);
    console.log(`📊 Tidssteg: ${outputData.stats.timeSteps}`);
    console.log(`🌤️ Parametrar per punkt: ${outputData.stats.parametersCount}`);
    console.log(`📅 Prognosperiod: ${outputData.stats.forecastDays} dagar`);
    console.log(`🌐 API: Open-Meteo (GRATIS!)`);
    
    // Visa exempel på första punktens data
    if (allPointsData.length > 0 && allPointsData[0].data.length > 0) {
      console.log('\n📍 Exempel - första punkt, första tidssteg:');
      const example = allPointsData[0].data[0];
      Object.entries(example).forEach(([key, value]) => {
        if (key !== 'time') {
          console.log(`   - ${key}: ${value}`);
        }
      });
      
      console.log(`\n📅 Tidsspan: ${allPointsData[0].data[0].time} → ${allPointsData[0].data[allPointsData[0].data.length - 1].time}`);
    }
    
  } catch (error) {
    console.error('❌ ALLMÄNT FEL:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error); 