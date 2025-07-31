import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DMI API key från tidigare
const DMI_API_KEY = '3b4b0175-aa4b-472f-8795-716342712936';

// Mapping av våra väderparametrar till DMI HARMONIE parametrar
const DMI_WEATHER_PARAMETERS = {
  '2t': 'temperature',           // 2 metre temperature
  'tp': 'precipitation',         // Total precipitation
  '10si': 'windSpeed',          // 10 metre wind speed
  '10wdir': 'windDirection',    // 10 metre wind direction
  'gust': 'windGust',           // Wind speed (gust)
  'cc': 'cloudCover',           // Fraction of cloud cover
  'pres': 'pressure',           // Pressure
  '2r': 'humidity',             // 2 metre relative humidity
  '2d': 'dewpoint',            // 2 metre dewpoint temperature
  'vis': 'visibility'           // Visibility
};

function createGridPoints(bbox: string, gridSize: number = 20): Array<{lat: number, lon: number}> {
  const [west, south, east, north] = bbox.split(',').map(Number);
  const latStep = (north - south) / gridSize;
  const lonStep = (east - west) / gridSize;
  
  const points: Array<{lat: number, lon: number}> = [];
  
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const lat = south + (i * latStep);
      const lon = west + (j * lonStep);
      points.push({ 
        lat: Math.round(lat * 100) / 100, 
        lon: Math.round(lon * 100) / 100 
      });
    }
  }
  
  return points;
}

async function fetchDMI_EDR_Data(points: Array<{lat: number, lon: number}>, parameters: string[]): Promise<any> {
  console.log(`📡 Hämtar DMI HARMONIE data för ${points.length} punkter...`);
  
  const allPointsData: any[] = [];
  const batchSize = 10; // Mindre batchar för DMI API
  
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    
    try {
      console.log(`📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(points.length / batchSize)}: ${batch.length} punkter`);
      
      // För varje punkt i batchen, hämta data från DMI EDR position endpoint
      for (const point of batch) {
        try {
          const coords = `POINT(${point.lon} ${point.lat})`;
          const paramString = parameters.join(',');
          
          const url = `https://dmigw.govcloud.dk/v1/forecastedr/collections/harmonie_dini_sf/position?coords=${encodeURIComponent(coords)}&parameter-name=${paramString}&crs=crs84&f=CoverageJSON&api-key=${DMI_API_KEY}`;
          
          console.log(`📍 Hämtar punkt ${point.lat}, ${point.lon}`);
          
          const response = await fetch(url);
          
          if (!response.ok) {
            console.error(`❌ API-fel för punkt ${point.lat}, ${point.lon}: ${response.status}`);
            const errorText = await response.text();
            console.error('Felmeddelande:', errorText);
            continue;
          }
          
          const data = await response.json();
          
          // Process DMI CoverageJSON data
          const processedPoint = processDMI_CoverageJSON(data, point);
          if (processedPoint) {
            allPointsData.push(processedPoint);
          }
          
          // Vänta mellan anrop för att inte överbelasta DMI API
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`❌ Fel vid hämtning för punkt ${point.lat}, ${point.lon}:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      // Längre paus mellan batchar
      if (i + batchSize < points.length) {
        console.log('⏳ Väntar 2 sekunder mellan batchar...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} misslyckades:`, error instanceof Error ? error.message : String(error));
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  return allPointsData;
}

function processDMI_CoverageJSON(data: any, point: {lat: number, lon: number}): any | null {
  try {
    if (!data.ranges || !data.domain || !data.domain.axes) {
      console.error('❌ Ogiltig CoverageJSON struktur från DMI');
      return null;
    }
    
    const timeAxis = data.domain.axes.t || data.domain.axes.time;
    const times = timeAxis?.values || [];
    
    if (times.length === 0) {
      console.error('❌ Inga tidssteg hittades i DMI data');
      return null;
    }
    
    const timeSeriesData: any[] = [];
    
    times.forEach((time: string, timeIndex: number) => {
      const timeData: any = { time };
      
      // Process varje parameter
      Object.entries(DMI_WEATHER_PARAMETERS).forEach(([dmiParam, ourParam]) => {
        const range = data.ranges[dmiParam];
        if (range && range.values && range.values[timeIndex] !== null && range.values[timeIndex] !== undefined) {
          let value = range.values[timeIndex];
          
          // Konvertera enheter
          switch (ourParam) {
            case 'temperature':
            case 'dewpoint':
              value = Math.round((value - 273.15) * 10) / 10; // Kelvin till Celsius
              break;
            case 'precipitation':
              value = Math.round(value * 100) / 100; // kg/m² (samma som mm)
              break;
            case 'windSpeed':
            case 'windGust':
              value = Math.round(value * 10) / 10; // m/s
              break;
            case 'windDirection':
              value = Math.round(value); // grader
              break;
            case 'cloudCover':
              value = Math.round(value * 100); // 0-1 till 0-100%
              break;
            case 'pressure':
              value = Math.round(value / 100 * 10) / 10; // Pascal till hPa
              break;
            case 'humidity':
              value = Math.round(value); // %
              break;
            case 'visibility':
              value = Math.round(value / 1000 * 10) / 10; // meter till km
              break;
          }
          
          timeData[ourParam] = value;
        }
      });
      
      timeSeriesData.push(timeData);
    });
    
    console.log(`✅ Punkt ${point.lat}, ${point.lon}: ${timeSeriesData.length} tidssteg`);
    
    return {
      lat: point.lat,
      lon: point.lon,
      data: timeSeriesData
    };
    
  } catch (error) {
    console.error('❌ Fel vid bearbetning av DMI CoverageJSON:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function saveWeatherData(data: any, outputPath: string) {
  console.log('💾 Sparar DMI HARMONIE väderdata som gzip...');
  
  const jsonString = JSON.stringify(data, null, 0);
  const readable = Readable.from([jsonString]);
  const gzipStream = createGzip({ level: 9 });
  const writeStream = (await import('fs')).createWriteStream(outputPath + '.gz');
  
  await pipeline(readable, gzipStream, writeStream);
  
  const stats = (await import('fs')).statSync(outputPath + '.gz');
  console.log(`📁 GZIP: ${outputPath}.gz (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
}

async function main() {
  const bbox = '2.970702,54.824871,26.613280,70';
  const outputPath = path.join(process.cwd(), 'public', 'data', 'weather_data_dmi.json');
  
  console.log('🌤️ Hämtar DMI HARMONIE väderdata...');
  console.log(`🗺️ BBOX: ${bbox}`);
  console.log(`📊 Parametrar: ${Object.keys(DMI_WEATHER_PARAMETERS).join(', ')}`);
  
  try {
    // Skapa rutnät av punkter - 21x21 = 441 punkter för hög upplösning
    const gridPoints = createGridPoints(bbox, 20);
    console.log(`🎯 Skapar ${gridPoints.length} punkter (21×21 rutnät)`);
    
    const parameters = Object.keys(DMI_WEATHER_PARAMETERS);
    const allPointsData = await fetchDMI_EDR_Data(gridPoints, parameters);
    
    if (allPointsData.length === 0) {
      throw new Error('Ingen väderdata kunde hämtas från DMI HARMONIE!');
    }
    
    const outputData = {
      bbox,
      parameters: Object.values(DMI_WEATHER_PARAMETERS),
      collection: 'harmonie_dini_sf',
      method: 'dmi_edr_position',
      model: 'DMI HARMONIE DINI',
      resolution: '2km',
      points: allPointsData,
      stats: {
        totalPoints: allPointsData.length,
        timeSteps: allPointsData[0]?.data?.length || 0,
        parametersCount: Object.keys(DMI_WEATHER_PARAMETERS).length,
        forecastHours: 60
      }
    };
    
    await saveWeatherData(outputData, outputPath);
    
    console.log('\n🎯 SAMMANFATTNING:');
    console.log(`✅ Totalt punkter: ${allPointsData.length}`);
    console.log(`📊 Tidssteg: ${outputData.stats.timeSteps}`);
    console.log(`🌤️ Parametrar per punkt: ${outputData.stats.parametersCount}`);
    console.log(`📅 Prognoslängd: ${outputData.stats.forecastHours} timmar (2.5 dagar)`);
    console.log(`🌐 API: DMI HARMONIE DINI (2km upplösning)`);
    console.log(`💰 Kostnad: GRATIS!`);
    
    // Visa exempel på första punkt
    if (allPointsData.length > 0 && allPointsData[0].data.length > 0) {
      console.log('\n📍 Exempel - första punkt, första tidssteg:');
      const firstPoint = allPointsData[0];
      const firstData = firstPoint.data[0];
      Object.entries(firstData).forEach(([key, value]) => {
        if (key !== 'time') {
          console.log(`   - ${key}: ${value}`);
        }
      });
      
      const firstTime = firstData.time;
      const lastTime = firstPoint.data[firstPoint.data.length - 1].time;
      console.log(`\n📅 Tidsspan: ${firstTime} → ${lastTime}`);
    }
    
  } catch (error) {
    console.error('❌ ALLMÄNT FEL:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error); 