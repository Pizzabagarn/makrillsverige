import { promises as fs } from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
// @ts-ignore
import grib2simple from 'grib2-simple';

console.log('🔄 Loading FMI Weather Data Fetcher module...');

// FMI HARMONIE parametrar - direktmapping från deras system
const FMI_WEATHER_PARAMETERS = {
  'Temperature': 'temperature',        // 2m temperatur
  'Precipitation1h': 'precipitation',  // Nederbörd per timme
  'WindUMS': 'windU',                 // U-komponent av vind
  'WindVMS': 'windV',                 // V-komponent av vind
  'WindGust': 'windGust',             // Vindbyar
  'TotalCloudCover': 'cloudCover',    // Total molntäckning
  'Pressure': 'pressure',            // Lufttryck
  'Humidity': 'humidity',             // Relativ luftfuktighet
  'DewPoint': 'dewpoint'              // Daggpunkt
};

interface ProcessedWeatherPoint {
  lat: number;
  lon: number;
  data: Array<{
    time: string;
    [key: string]: any;
  }>;
}

// Konvertera FMI parametrar till våra interna namn
function mapFMIParameter(fmiParam: string, value: number): { param: string; value: number } {
  switch (fmiParam) {
    case 'Temperature':
      return { param: 'temperature', value: Math.round((value - 273.15) * 10) / 10 }; // Kelvin till Celsius
      
    case 'Precipitation1h':
      return { param: 'precipitation', value: Math.round(value * 100) / 100 }; // mm
      
    case 'WindUMS':
      return { param: 'windU', value: Math.round(value * 10) / 10 }; // m/s
      
    case 'WindVMS':
      return { param: 'windV', value: Math.round(value * 10) / 10 }; // m/s
      
    case 'WindGust':
      return { param: 'windGust', value: Math.round(value * 10) / 10 }; // m/s
      
    case 'TotalCloudCover':
      return { param: 'cloudCover', value: Math.round(value) }; // %
      
    case 'Pressure':
      return { param: 'pressure', value: Math.round(value / 100 * 10) / 10 }; // Pa till hPa
      
    case 'Humidity':
      return { param: 'humidity', value: Math.round(value) }; // %
      
    case 'DewPoint':
      return { param: 'dewpoint', value: Math.round((value - 273.15) * 10) / 10 }; // Kelvin till Celsius
      
    default:
      return { param: fmiParam.toLowerCase(), value };
  }
}

// Beräkna vindhastighet och vindriktning från U/V komponenter
function calculateWindSpeedAndDirection(u: number, v: number): { speed: number; direction: number } {
  const speed = Math.sqrt(u * u + v * v);
  let direction = Math.atan2(-u, -v) * (180 / Math.PI);
  if (direction < 0) direction += 360;
  
  return {
    speed: Math.round(speed * 10) / 10,
    direction: Math.round(direction)
  };
}

async function fetchFMIWeatherData(bbox: string): Promise<Buffer> {
  console.log('📡 Hämtar HARMONIE data från FMI bulk download...');
  
  // FMI binary download URL med alla våra parametrar
  const params = Object.keys(FMI_WEATHER_PARAMETERS).join(',');
  
  const url = `http://opendata.fmi.fi/download?` + new URLSearchParams({
    producer: 'harmonie_scandinavia_surface',
    param: params,
    bbox: bbox,
    projection: 'EPSG:4326',
    format: 'grib2',
    timestep: '60', // 1 timme mellan prognoser
  }).toString();
  
  console.log('🔗 FMI URL:', url);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FMI API fel: ${response.status} - ${errorText}`);
  }
  
  console.log('✅ FMI svarade med GRIB2 data');
  return Buffer.from(await response.arrayBuffer());
}

// RIKTIG GRIB2 PARSER med grib2-simple
async function parseGRIB2Data(gribBuffer: Buffer, bbox: string): Promise<ProcessedWeatherPoint[]> {
  console.log('🔍 Parsar GRIB2 data med grib2-simple...');
  
  try {
    // Parsa GRIB2 data
    const grib2Records = grib2simple(gribBuffer);
    console.log(`📦 Hittade ${grib2Records.length} GRIB2 records`);
    
    if (grib2Records.length === 0) {
      throw new Error('Inga GRIB2 records hittades i filen');
    }
    
    // Skapa ett rutnät av punkter baserat på bbox för sampling
    const [west, south, east, north] = bbox.split(',').map(Number);
    const gridSize = 30; // 31x31 rutnät för högre upplösning
    const latStep = (north - south) / gridSize;
    const lonStep = (east - west) / gridSize;
    
    console.log(`🗺️ Skapar ${gridSize + 1}x${gridSize + 1} rutnät för sampling...`);
    
    // Gruppera records per tidssteg
    const recordsByTime = new Map<number, any[]>();
    
    grib2Records.forEach((record: any) => {
      const time = record.forecastTimestamp;
      if (!recordsByTime.has(time)) {
        recordsByTime.set(time, []);
      }
      recordsByTime.get(time)!.push(record);
    });
    
    const sortedTimes = Array.from(recordsByTime.keys()).sort((a, b) => a - b);
    console.log(`⏰ Hittade ${sortedTimes.length} tidssteg`);
    
    const processedPoints: ProcessedWeatherPoint[] = [];
    
    // För varje punkt i vårt rutnät
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        const lat = Math.round((south + (i * latStep)) * 100) / 100;
        const lon = Math.round((west + (j * lonStep)) * 100) / 100;
        
        const timeSeriesData = [];
        
        // För varje tidssteg
        for (const timestamp of sortedTimes) {
          const records = recordsByTime.get(timestamp) || [];
          const time = new Date(timestamp).toISOString();
          
          const weatherData: any = { time };
          
          // Hämta värden från alla records för denna tid
          records.forEach((record: any) => {
            try {
              const value = record.getValue(lon, lat);
              if (value !== null && value !== undefined && !isNaN(value)) {
                // Identifiera parameter från sections data
                const sections = record.sections;
                const paramCategory = sections?.section4?.parameterCategory;
                const paramNumber = sections?.section4?.parameterNumber;
                
                // Mappa parameter baserat på GRIB2 koder
                const paramName = mapGRIB2Parameter(paramCategory, paramNumber, value);
                if (paramName) {
                  weatherData[paramName.param] = paramName.value;
                  
                  // Samla U/V komponenter för vind
                  if (paramName.param === 'windU') weatherData.windU = paramName.value;
                  if (paramName.param === 'windV') weatherData.windV = paramName.value;
                }
              }
            } catch (error) {
              // Tyst ignorera fel för individuella punkter
            }
          });
          
          // Beräkna vindhastighet och riktning om vi har U/V komponenter
          if (weatherData.windU !== undefined && weatherData.windV !== undefined) {
            const wind = calculateWindSpeedAndDirection(weatherData.windU, weatherData.windV);
            weatherData.windSpeed = wind.speed;
            weatherData.windDirection = wind.direction;
            // Ta bort U/V komponenter från output
            delete weatherData.windU;
            delete weatherData.windV;
          }
          
          timeSeriesData.push(weatherData);
        }
        
        if (timeSeriesData.length > 0) {
          processedPoints.push({ lat, lon, data: timeSeriesData });
        }
      }
    }
    
    console.log(`✅ GRIB2 parsing klar: ${processedPoints.length} punkter, ${processedPoints[0]?.data?.length || 0} tidssteg`);
    return processedPoints;
    
  } catch (error) {
    console.error('❌ GRIB2 parsing fel:', error);
    throw new Error(`GRIB2 parsing misslyckades: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Mappa GRIB2 parameter koder till våra parameter namn
function mapGRIB2Parameter(category: number, parameter: number, value: number): { param: string; value: number } | null {
  // Temperatur (category 0)
  if (category === 0 && parameter === 0) {
    return { param: 'temperature', value: Math.round((value - 273.15) * 10) / 10 }; // Kelvin till Celsius
  }
  
  // Nederbörd (category 1)
  if (category === 1 && parameter === 52) {
    return { param: 'precipitation', value: Math.round(value * 100) / 100 }; // kg/m2 = mm
  }
  
  // Vind U-komponent (category 2, parameter 2)
  if (category === 2 && parameter === 2) {
    return { param: 'windU', value: Math.round(value * 10) / 10 }; // m/s
  }
  
  // Vind V-komponent (category 2, parameter 3)
  if (category === 2 && parameter === 3) {
    return { param: 'windV', value: Math.round(value * 10) / 10 }; // m/s
  }
  
  // Vindbyar (category 2, parameter 22)
  if (category === 2 && parameter === 22) {
    return { param: 'windGust', value: Math.round(value * 10) / 10 }; // m/s
  }
  
  // Lufttryck (category 3, parameter 0)
  if (category === 3 && parameter === 0) {
    return { param: 'pressure', value: Math.round(value / 100 * 10) / 10 }; // Pa till hPa
  }
  
  // Molntäckning (category 6, parameter 32)
  if (category === 6 && parameter === 32) {
    return { param: 'cloudCover', value: Math.round(value * 100) }; // 0-1 till %
  }
  
  // Relativ luftfuktighet (category 1, parameter 1)
  if (category === 1 && parameter === 1) {
    return { param: 'humidity', value: Math.round(value) }; // %
  }
  
  // Daggpunkt (category 0, parameter 6)
  if (category === 0 && parameter === 6) {
    return { param: 'dewpoint', value: Math.round((value - 273.15) * 10) / 10 }; // Kelvin till Celsius
  }
  
  return null; // Okänd parameter
}

async function saveWeatherData(data: any, outputPath: string) {
  console.log('💾 Sparar väderdata som komprimerad JSON...');
  
  const jsonString = JSON.stringify(data, null, 0);
  const readable = Readable.from([jsonString]);
  const gzipStream = createGzip({ level: 9 });
  const writeStream = (await import('fs')).createWriteStream(outputPath + '.gz');
  
  await pipeline(readable, gzipStream, writeStream);
  
  const stats = await fs.stat(outputPath + '.gz');
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
  
  console.log(`✅ VÄDERDATA sparad! 📁 ${outputPath}.gz (${fileSizeMB} MB)`);
}

async function main() {
  try {
    console.log('🌤️ FMI HARMONIE Weather Data Fetcher');
    console.log('=====================================');
    console.log('📍 Script started successfully!');
    
    const bbox = '2.970702,54.824871,26.613280,70'; // Din önskade bbox
    const outputPath = path.join(process.cwd(), 'public', 'data', 'weather_data.json');
    
    console.log(`🗺️ BBOX: ${bbox}`);
    console.log(`📊 Parametrar: ${Object.keys(FMI_WEATHER_PARAMETERS).join(', ')}`);
    
    // Hämta GRIB2 data från FMI
    const gribData = await fetchFMIWeatherData(bbox);
    console.log(`📦 Hämtad GRIB2 fil: ${(gribData.length / 1024 / 1024).toFixed(1)} MB`);
    
    // Parsa GRIB2 data (mockad för nu)
    const processedPoints = await parseGRIB2Data(gribData, bbox);
    
    if (processedPoints.length === 0) {
      throw new Error('Ingen väderdata kunde processas från FMI GRIB2!');
    }
    
    // Skapa output data struktur
    const outputData = {
      bbox,
      parameters: Object.values(FMI_WEATHER_PARAMETERS).concat(['windSpeed', 'windDirection']), // Lägg till beräknade parametrar
      collection: 'fmi_harmonie_scandinavia_surface',
      method: 'fmi_bulk_download',
      format: 'grib2',
      models: ['harmonie_scandinavia'],
      points: processedPoints,
      stats: {
        totalPoints: processedPoints.length,
        timeSteps: processedPoints[0]?.data?.length || 0,
        parametersCount: Object.keys(FMI_WEATHER_PARAMETERS).length + 2, // +2 för beräknade vind-parametrar
        forecastHours: processedPoints[0]?.data?.length || 0,
        resolution: '~2km (HARMONIE)',
        provider: 'FMI (Finnish Meteorological Institute)',
        license: 'Creative Commons'
      }
    };
    
    // Spara data
    await saveWeatherData(outputData, outputPath);
    
    // Statistik
    console.log('\n📊 RESULTAT:');
    console.log(`   - Totalt punkter: ${outputData.stats.totalPoints}`);
    console.log(`   - Tidssteg: ${outputData.stats.timeSteps}`);
    console.log(`   - Parametrar: ${outputData.stats.parametersCount}`);
    console.log(`   - Prognos längd: ${outputData.stats.forecastHours} timmar`);
    console.log(`   - Upplösning: ${outputData.stats.resolution}`);
    console.log(`   - Leverantör: ${outputData.stats.provider}`);
    console.log(`   - Licens: ${outputData.stats.license}`);
    
    // Exempel punkt
    const firstPoint = processedPoints[0];
    if (firstPoint) {
      console.log(`\n📍 Exempel punkt (${firstPoint.lat}°, ${firstPoint.lon}°):`);
      console.log(`   - Första prognos: ${JSON.stringify(firstPoint.data[0], null, 2)}`);
    }
    
    console.log('\n🎉 FMI HARMONIE data framgångsrikt hämtad och processad!');
    console.log('\n⚠️  VIKTIGT: Detta script använder mockad GRIB2 parsing.');
    console.log('    För produktion behöver vi en riktig GRIB2 parser som node-grib2.');
    
  } catch (error) {
    console.error('❌ FEL:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Always run main when this script is executed directly
main().catch(console.error); 