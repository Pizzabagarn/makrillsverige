import { promises as fs } from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

console.log('🔄 Loading FMI WFS Weather Data Fetcher...');

// FMI WFS endpoint för HARMONIE prognosdata
const FMI_WFS_URL = 'http://opendata.fmi.fi/wfs';

// Parameter mapping för FMI HARMONIE
const FMI_PARAMETERS = [
  'Temperature',      // Lufttemperatur  
  'DewPoint',        // Daggpunkt
  'Humidity',        // Relativ luftfuktighet
  'WindSpeedMS',     // Vindhastighet m/s
  'WindDirection',   // Vindriktning
  'WindGust',        // Vindbyar
  'WindUMS',         // U-komponent
  'WindVMS',         // V-komponent  
  'Pressure',        // Lufttryck
  'PrecipitationAmount', // Nederbörd
  'TotalCloudCover'  // Molntäckning
];

interface WeatherPoint {
  lat: number;
  lon: number;
  data: Array<{
    time: string;
    [key: string]: any;
  }>;
}

// Skapa rutnät av punkter för att täcka hela bbox
function createGridPoints(bbox: string, gridSize: number): Array<{lat: number, lon: number}> {
  const [west, south, east, north] = bbox.split(',').map(Number);
  const latStep = (north - south) / gridSize;
  const lonStep = (east - west) / gridSize;
  
  const points: Array<{lat: number, lon: number}> = [];
  
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const lat = Math.round((south + (i * latStep)) * 100) / 100;
      const lon = Math.round((west + (j * lonStep)) * 100) / 100;
      points.push({ lat, lon });
    }
  }
  
  return points;
}

// Hämta väderdata för en punkt från FMI WFS
async function fetchPointWeatherData(lat: number, lon: number): Promise<any> {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::forecast::harmonie::surface::point::multipointcoverage',
    latlon: `${lat},${lon}`,
    parameters: FMI_PARAMETERS.join(',')
  });
  
  const url = `${FMI_WFS_URL}?${params.toString()}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`FMI WFS API fel: ${response.status}`);
    }
    
    const xmlText = await response.text();
    return parseWFSResponse(xmlText, lat, lon);
    
  } catch (error) {
    console.warn(`⚠️  Kunde inte hämta data för punkt ${lat},${lon}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// Parsa FMI WFS XML response
function parseWFSResponse(xmlText: string, lat: number, lon: number): WeatherPoint | null {
  try {
    // Extrakta tidsserier från XML (förenklad parsing)
    const timeSeriesData: Array<{time: string; [key: string]: any}> = [];
    
    // Hitta doubleOrNilReasonTupleList som innehåller alla värden
    const dataMatch = xmlText.match(/<gml:doubleOrNilReasonTupleList>([\s\S]*?)<\/gml:doubleOrNilReasonTupleList>/);
    if (!dataMatch) {
      console.warn(`⚠️  Ingen data hittades i WFS response för ${lat},${lon}`);
      return null;
    }
    
    // Hitta positions som innehåller tidsstämplar
    const positionsMatch = xmlText.match(/<gmlcov:positions>([\s\S]*?)<\/gmlcov:positions>/);
    if (!positionsMatch) {
      console.warn(`⚠️  Inga positioner hittades i WFS response för ${lat},${lon}`);
      return null;
    }
    
    // Parsa tidsstämplar (sista värdet i varje position är UNIX timestamp)
    const positions = positionsMatch[1].trim().split(/\s+/);
    const timestamps: number[] = [];
    for (let i = 2; i < positions.length; i += 3) { // Varje tredje värde är timestamp
      timestamps.push(parseInt(positions[i]));
    }
    
    // Parsa datavärden
    const dataValues = dataMatch[1].trim().split(/\s+/).map(v => parseFloat(v));
    const parametersPerTimestamp = FMI_PARAMETERS.length;
    
    // Skapa tidsserier
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = new Date(timestamps[i] * 1000).toISOString();
      const weatherData: any = { time: timestamp };
      
      // Hämta värden för denna tidpunkt
      const startIndex = i * parametersPerTimestamp;
      
      FMI_PARAMETERS.forEach((param, paramIndex) => {
        const value = dataValues[startIndex + paramIndex];
        if (!isNaN(value)) {
          const mappedParam = mapFMIParameter(param, value);
          if (mappedParam) {
            weatherData[mappedParam.param] = mappedParam.value;
          }
        }
      });
      
      // Beräkna vindhastighet och riktning från U/V komponenter
      if (weatherData.windU !== undefined && weatherData.windV !== undefined) {
        const wind = calculateWindSpeedAndDirection(weatherData.windU, weatherData.windV);
        weatherData.windSpeed = wind.speed;
        weatherData.windDirection = wind.direction;
        delete weatherData.windU;
        delete weatherData.windV;
      }
      
      timeSeriesData.push(weatherData);
    }
    
    return {
      lat,
      lon,
      data: timeSeriesData
    };
    
  } catch (error) {
    console.warn(`⚠️  Fel vid parsing av WFS response för ${lat},${lon}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// Mappa FMI parametrar till våra interna namn
function mapFMIParameter(fmiParam: string, value: number): { param: string; value: number } | null {
  switch (fmiParam) {
    case 'Temperature':
      // FMI returnerar redan Celsius, inte Kelvin
      return { param: 'temperature', value: Math.round(value * 10) / 10 };
    case 'DewPoint':
      // FMI returnerar redan Celsius, inte Kelvin
      return { param: 'dewpoint', value: Math.round(value * 10) / 10 };
    case 'Humidity':
      return { param: 'humidity', value: Math.round(value) }; // %
    case 'WindSpeedMS':
      return { param: 'windSpeed', value: Math.round(value * 10) / 10 }; // m/s
    case 'WindDirection':
      return { param: 'windDirection', value: Math.round(value) }; // grader
    case 'WindGust':
      return { param: 'windGust', value: Math.round(value * 10) / 10 }; // m/s
    case 'WindUMS':
      return { param: 'windU', value: Math.round(value * 10) / 10 }; // m/s
    case 'WindVMS':
      return { param: 'windV', value: Math.round(value * 10) / 10 }; // m/s
    case 'Pressure':
      // FMI returnerar redan hPa, inte Pa
      return { param: 'pressure', value: Math.round(value * 10) / 10 };
    case 'PrecipitationAmount':
      return { param: 'precipitation', value: Math.round(value * 100) / 100 }; // mm
    case 'TotalCloudCover':
      return { param: 'cloudCover', value: Math.round(value) }; // %
    default:
      return null;
  }
}

// Beräkna vindhastighet och riktning från U/V komponenter
function calculateWindSpeedAndDirection(u: number, v: number): { speed: number; direction: number } {
  const speed = Math.sqrt(u * u + v * v);
  let direction = Math.atan2(-u, -v) * (180 / Math.PI);
  if (direction < 0) direction += 360;
  
  return {
    speed: Math.round(speed * 10) / 10,
    direction: Math.round(direction)
  };
}

// Spara väderdata som komprimerad JSON
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
    console.log('🌤️ FMI WFS HARMONIE Weather Data Fetcher');
    console.log('==========================================');
    
    const bbox = '2.970702,54.824871,26.613280,70';
    const outputPath = path.join(process.cwd(), 'public', 'data', 'weather_data.json');
    
    console.log(`🗺️ BBOX: ${bbox}`);
    console.log(`📊 Parametrar: ${FMI_PARAMETERS.join(', ')}`);
    console.log(`🌐 API: FMI WFS (GRATIS & KOMMERSIELLT)`);
    console.log(`🏷️ Modell: HARMONIE (2 km upplösning)`);
    
    // Skapa rutnät - PROFESSIONELL KVALITET!
    const gridSize = 150; // 151×151 = 22,801 punkter (~3 km upplösning - ÄNNU MER PROFESSIONELL!)
    const gridPoints = createGridPoints(bbox, gridSize);
    
    console.log(`\n📍 Skapade ${gridPoints.length} punkter i rutnät (${gridSize + 1}×${gridSize + 1})`);
    console.log('📡 Hämtar väderdata från FMI WFS...');
    
    const allPointsData: WeatherPoint[] = [];
    const batchSize = 5; // Små batchar för att inte överbelasta FMI
    
    // Processa i batchar
    for (let i = 0; i < gridPoints.length; i += batchSize) {
      const batch = gridPoints.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(gridPoints.length / batchSize);
      
      console.log(`\n📦 Batch ${batchNumber}/${totalBatches}: ${batch.length} punkter`);
      
      // Hämta data för alla punkter i batchen parallellt
      const batchPromises = batch.map(point => 
        fetchPointWeatherData(point.lat, point.lon)
      );
      
      try {
        const batchResults = await Promise.all(batchPromises);
        
        // Lägg till framgångsrika resultat
        batchResults.forEach(result => {
          if (result) {
            allPointsData.push(result);
          }
        });
        
        console.log(`✅ Batch ${batchNumber} klar: ${batchResults.filter(r => r !== null).length}/${batch.length} framgångsrika`);
        
        // Vänta mellan batchar för att inte överbelasta FMI
        if (i + batchSize < gridPoints.length) {
          console.log('⏳ Väntar 2 sekunder...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`❌ Batch ${batchNumber} misslyckades:`, error instanceof Error ? error.message : String(error));
        
        // Vänta längre vid fel
        console.log('⏳ Väntar 5 sekunder efter fel...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (allPointsData.length === 0) {
      throw new Error('Ingen väderdata kunde hämtas från FMI WFS!');
    }
    
    // Skapa output data struktur
    const outputData = {
      bbox,
      parameters: ['temperature', 'precipitation', 'windSpeed', 'windDirection', 'windGust', 'cloudCover', 'pressure', 'humidity', 'dewpoint'],
      collection: 'fmi_harmonie_wfs',
      method: 'fmi_wfs_point_queries',
      format: 'xml_parsed_to_json',
      models: ['harmonie_scandinavia_surface'],
      points: allPointsData,
      stats: {
        totalPoints: allPointsData.length,
        requestedPoints: gridPoints.length,  
        successRate: `${Math.round(allPointsData.length / gridPoints.length * 100)}%`,
        timeSteps: allPointsData[0]?.data?.length || 0,
        parametersCount: FMI_PARAMETERS.length,
        forecastHours: allPointsData[0]?.data?.length || 0,
        resolution: '~15-25 km (grid sampling)',
        provider: 'FMI (Finnish Meteorological Institute)',
        license: 'Creative Commons',
        dataSource: 'HARMONIE 2km model via WFS'
      }
    };
    
    // Spara data
    await saveWeatherData(outputData, outputPath);
    
    // Statistik
    console.log('\n📊 RESULTAT:');
    console.log(`   - Begärda punkter: ${outputData.stats.requestedPoints}`);
    console.log(`   - Erhållna punkter: ${outputData.stats.totalPoints}`);
    console.log(`   - Framgångsrate: ${outputData.stats.successRate}`);
    console.log(`   - Tidssteg: ${outputData.stats.timeSteps}`);
    console.log(`   - Parametrar: ${outputData.stats.parametersCount}`);
    console.log(`   - Prognos längd: ${outputData.stats.forecastHours} timmar`);
    console.log(`   - Upplösning: ${outputData.stats.resolution}`);
    console.log(`   - Datakälla: ${outputData.stats.dataSource}`);
    console.log(`   - Leverantör: ${outputData.stats.provider}`);
    console.log(`   - Licens: ${outputData.stats.license}`);
    
    // Exempel punkt
    const firstPoint = allPointsData[0];
    if (firstPoint) {
      console.log(`\n📍 Exempel punkt (${firstPoint.lat}°, ${firstPoint.lon}°):`);
      const firstData = firstPoint.data[0];
      if (firstData) {
        console.log(`   - Tid: ${firstData.time}`);
        console.log(`   - Temperatur: ${firstData.temperature}°C`);
        console.log(`   - Vind: ${firstData.windSpeed} m/s från ${firstData.windDirection}°`);
        console.log(`   - Tryck: ${firstData.pressure} hPa`);
        console.log(`   - Molntäckning: ${firstData.cloudCover}%`);
      }
    }
    
    console.log('\n🎉 FMI WFS HARMONIE data framgångsrikt hämtad!');
    console.log('💪 Ingen GRIB2 parsing behövdes - rakt från WFS till JSON!');
    
  } catch (error) {
    console.error('❌ FEL:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Kör main
main().catch(console.error); 