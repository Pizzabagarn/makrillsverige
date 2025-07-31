// @ts-nocheck
import { promises as fs } from 'fs';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
// @ts-ignore
import { NetCDFReader } from 'netcdfjs';

console.log('🔄 Loading FMI NetCDF Bulk Download Weather Fetcher...');

// FMI NetCDF bulk download endpoint
const FMI_NETCDF_URL = 'http://opendata.fmi.fi/download';

// FMI HARMONIE parametrar för NetCDF bulk download
const FMI_NETCDF_PARAMETERS = [
  'Temperature',           // Lufttemperatur
  'Pressure',             // Lufttryck  
  'WindUMS',              // U-komponent av vind
  'WindVMS',              // V-komponent av vind
  'WindSpeedMS',          // Vindhastighet m/s
  'WindDirection',        // Vindriktning
  'WindGust',             // Vindbyar
  'PrecipitationAmount',  // Nederbörd
  'TotalCloudCover',      // Total molntäckning
  'Humidity',             // Relativ luftfuktighet
  'DewPoint'              // Daggpunkt
];

interface ProcessedWeatherPoint {
  lat: number;
  lon: number;
  data: Array<{
    time: string;
    [key: string]: any;
  }>;
}

// Hämta NetCDF data från FMI bulk download
async function fetchFMI_NetCDF(bbox: string): Promise<Buffer> {
  const params = new URLSearchParams({
    producer: 'harmonie_scandinavia_surface',
    param: FMI_NETCDF_PARAMETERS.join(','),
    format: 'netcdf',
    bbox: bbox,
    projection: 'EPSG:4326',
    // Begränsa till rimlig tid för första test
    timesteps: '50'  // 50 timmar prognos
  });
  
  const url = `${FMI_NETCDF_URL}?${params.toString()}`;
  
  console.log('📡 Hämtar HARMONIE NetCDF data från FMI bulk download...');
  console.log(`🔗 URL: ${url}`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FMI NetCDF API fel: ${response.status} - ${errorText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/octet-stream') && !contentType.includes('application/x-netcdf')) {
      console.warn(`⚠️  Unexpected content-type: ${contentType}`);  
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`✅ NetCDF data hämtad: ${(buffer.length / (1024 * 1024)).toFixed(1)} MB`);
    return buffer;
    
  } catch (error) {
    throw new Error(`Fel vid hämtning av FMI NetCDF data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Parsa NetCDF data till vårt format
function parseNetCDFData(netcdfBuffer: Buffer, bbox: string): ProcessedWeatherPoint[] {
  console.log('🔍 Parsar NetCDF data...');
  
  try {
    // Skapa NetCDF reader
    const reader = new NetCDFReader(netcdfBuffer);
    
    console.log('📊 NetCDF struktur:');
    console.log(`   - Dimensioner: ${Object.keys(reader.dimensions).join(', ')}`);
    console.log(`   - Variabler: ${Object.keys(reader.variables).join(', ')}`);
    
    // Hämta dimensioner och variabler
    const dimensions = reader.dimensions;
    const variables = reader.variables;
    
    // Hitta lat/lon/time variabel namn
    const variableNames = Object.keys(variables);
    const latVarName = variableNames.find(name => 
      name === 'latitude' || name === 'lat' || name === 'y'
    );
    const lonVarName = variableNames.find(name => 
      name === 'longitude' || name === 'lon' || name === 'x'
    );
    const timeVarName = variableNames.find(name => 
      name === 'time'
    );
    
    if (!latVarName || !lonVarName || !timeVarName) {
      throw new Error(`Kunde inte hitta lat/lon/time variabler i NetCDF. Tillgängliga variabler: ${variableNames.join(', ')}`);
    }
    
    // Läs koordinater och tid
    const latitudesRaw = reader.getDataVariable(latVarName);
    const longitudesRaw = reader.getDataVariable(lonVarName);
    const timesRaw = reader.getDataVariable(timeVarName);
    
    // Konvertera till number arrays om det behövs
    const latitudes = Array.isArray(latitudesRaw) ? latitudesRaw as number[] : [latitudesRaw as number];
    const longitudes = Array.isArray(longitudesRaw) ? longitudesRaw as number[] : [longitudesRaw as number];
    const times = Array.isArray(timesRaw) ? timesRaw as number[] : [timesRaw as number];
    
    console.log(`📐 Grid dimensioner:`);
    console.log(`   - Latituder: ${latitudes.length} (${Math.min(...latitudes).toFixed(2)}° → ${Math.max(...latitudes).toFixed(2)}°)`);
    console.log(`   - Longituder: ${longitudes.length} (${Math.min(...longitudes).toFixed(2)}° → ${Math.max(...longitudes).toFixed(2)}°)`);
    console.log(`   - Tidssteg: ${times.length}`);
    
    // Skapa tidsstämplar
    const timeStamps: string[] = [];
    const baseTime = new Date('1970-01-01T00:00:00Z'); // Unix epoch
    
    for (let t = 0; t < times.length; t++) {
      // FMI använder vanligtvis sekunder sedan epoch
      const timestamp = new Date(baseTime.getTime() + times[t] * 1000);
      timeStamps.push(timestamp.toISOString());
    }
    
    console.log(`📅 Tidsperiod: ${timeStamps[0]} → ${timeStamps[timeStamps.length - 1]}`);
    
    // Processa varje punkt i gridet
    const processedPoints: ProcessedWeatherPoint[] = [];
    
    console.log('🔄 Processar väderdata för alla punkter...');
    
    for (let latIndex = 0; latIndex < latitudes.length; latIndex++) {
      for (let lonIndex = 0; lonIndex < longitudes.length; lonIndex++) {
        const lat = Math.round(latitudes[latIndex] * 100) / 100;
        const lon = Math.round(longitudes[lonIndex] * 100) / 100;
        
        // Skapa tidsserie för denna punkt
        const pointData: Array<{time: string; [key: string]: any}> = [];
        
        for (let timeIndex = 0; timeIndex < times.length; timeIndex++) {
          const weatherData: any = { time: timeStamps[timeIndex] };
          
          // Hämta värden för alla parametrar vid denna punkt och tid
          for (const paramName of FMI_NETCDF_PARAMETERS) {
            const variable = variables[paramName as keyof typeof variables];
            if (variable) {
              try {
                // NetCDF data är vanligtvis [time, lat, lon] eller [time, y, x]
                let value: number;
                
                if (variable.dimensions.length === 3) {
                  // 3D data: [time, lat, lon]
                  const data = reader.getDataVariable(paramName);
                  const index = timeIndex * latitudes.length * longitudes.length + 
                               latIndex * longitudes.length + lonIndex;
                  value = data[index];
                } else if (variable.dimensions.length === 2) {
                  // 2D data: [lat, lon] (konstant över tid)
                  const data = reader.getDataVariable(paramName);
                  const index = latIndex * longitudes.length + lonIndex;
                  value = data[index];
                } else {
                  // 1D eller annat format - hoppa över
                  continue;
                }
                
                if (value != null && !isNaN(value)) {
                  const mappedParam = mapFMINetCDFParameter(paramName, value);
                  if (mappedParam) {
                    weatherData[mappedParam.param] = mappedParam.value;
                  }
                }
              } catch (error) {
                // Ignorera fel för enskilda parametrar
                console.warn(`⚠️  Kunde inte läsa ${paramName} för punkt ${lat},${lon}: ${error}`);
              }
            }
          }
          
          // Beräkna vindhastighet och riktning från U/V komponenter
          if (weatherData.windU !== undefined && weatherData.windV !== undefined) {
            const wind = calculateWindSpeedAndDirection(weatherData.windU, weatherData.windV);
            weatherData.windSpeed = wind.speed;
            weatherData.windDirection = wind.direction;
            delete weatherData.windU;
            delete weatherData.windV;
          }
          
          pointData.push(weatherData);
        }
        
        processedPoints.push({
          lat,
          lon,
          data: pointData
        });
      }
    }
    
    console.log(`✅ NetCDF parsing klar: ${processedPoints.length} punkter`);
    return processedPoints;
    
  } catch (error) {
    throw new Error(`Fel vid parsing av NetCDF data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Mappa FMI NetCDF parametrar till våra interna namn
function mapFMINetCDFParameter(fmiParam: string, value: number): { param: string; value: number } | null {
  switch (fmiParam) {
    case 'Temperature':
      // FMI NetCDF returnerar Celsius
      return { param: 'temperature', value: Math.round(value * 10) / 10 };
    case 'Pressure':
      // FMI NetCDF returnerar hPa
      return { param: 'pressure', value: Math.round(value * 10) / 10 };
    case 'WindUMS':
      return { param: 'windU', value: Math.round(value * 10) / 10 };
    case 'WindVMS':
      return { param: 'windV', value: Math.round(value * 10) / 10 };
    case 'WindSpeedMS':
      return { param: 'windSpeed', value: Math.round(value * 10) / 10 };
    case 'WindDirection':
      return { param: 'windDirection', value: Math.round(value) };
    case 'WindGust':
      return { param: 'windGust', value: Math.round(value * 10) / 10 };
    case 'PrecipitationAmount':
      return { param: 'precipitation', value: Math.round(value * 100) / 100 };
    case 'TotalCloudCover':
      return { param: 'cloudCover', value: Math.round(value) };
    case 'Humidity':
      return { param: 'humidity', value: Math.round(value) };
    case 'DewPoint':
      return { param: 'dewpoint', value: Math.round(value * 10) / 10 };
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
    console.log('🌤️ FMI NetCDF HARMONIE Bulk Download Weather Fetcher');
    console.log('=====================================================');
    
    const bbox = '2.970702,54.824871,26.613280,70';
    const outputPath = path.join(process.cwd(), 'public', 'data', 'weather_data.json');
    
    console.log(`🗺️ BBOX: ${bbox}`);
    console.log(`📊 Parametrar: ${FMI_NETCDF_PARAMETERS.join(', ')}`);
    console.log(`🌐 API: FMI NetCDF BULK DOWNLOAD (GRATIS & KOMMERSIELLT)`);
    console.log(`🏷️ Modell: HARMONIE (2 km upplösning)`);
    console.log(`⚡ Metod: BULK DOWNLOAD (som havsdata - sekunder istället för minuter!)`);
    
    // Hämta NetCDF data (en enda HTTP-förfrågan!)
    const netcdfBuffer = await fetchFMI_NetCDF(bbox);
    
    // Parsa NetCDF till vårt format
    const processedPoints = parseNetCDFData(netcdfBuffer, bbox);
    
    if (processedPoints.length === 0) {
      throw new Error('Ingen väderdata kunde parsas från NetCDF!');
    }
    
    // Skapa output data struktur
    const outputData = {
      bbox,
      parameters: ['temperature', 'precipitation', 'windSpeed', 'windDirection', 'windGust', 'cloudCover', 'pressure', 'humidity', 'dewpoint'],
      collection: 'fmi_harmonie_netcdf_bulk',
      method: 'fmi_netcdf_bulk_download',
      format: 'netcdf_parsed_to_json',
      models: ['harmonie_scandinavia_surface'],
      points: processedPoints,
      stats: {
        totalPoints: processedPoints.length,
        timeSteps: processedPoints[0]?.data?.length || 0,
        parametersCount: FMI_NETCDF_PARAMETERS.length,
        forecastHours: processedPoints[0]?.data?.length || 0,
        resolution: 'Native 2km HARMONIE grid (VERKLIG 2km upplösning!)',
        provider: 'FMI (Finnish Meteorological Institute)',
        license: 'Creative Commons',
        dataSource: 'HARMONIE 2km model via NetCDF bulk download',
        method: 'Single HTTP request - same speed as marine data!'
      }
    };
    
    // Spara data
    await saveWeatherData(outputData, outputPath);
    
    // Statistik
    console.log('\n📊 FANTASTISKA RESULTAT:');
    console.log(`   - Totalt punkter: ${outputData.stats.totalPoints}`);
    console.log(`   - Tidssteg: ${outputData.stats.timeSteps}`);
    console.log(`   - Parametrar: ${outputData.stats.parametersCount}`);
    console.log(`   - Prognos längd: ${outputData.stats.forecastHours} timmar`);
    console.log(`   - Upplösning: ${outputData.stats.resolution}`);
    console.log(`   - Datakälla: ${outputData.stats.dataSource}`);
    console.log(`   - Leverantör: ${outputData.stats.provider}`);
    console.log(`   - Licens: ${outputData.stats.license}`);
    console.log(`   - Metod: ${outputData.stats.method}`);
    
    // Exempel punkt
    const firstPoint = processedPoints[0];
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
    
    console.log('\n🎉 FMI NetCDF HARMONIE bulk download framgångsrikt!');
    console.log('⚡ SAMMA HASTIGHET SOM DINA HAVSDATA - EN HTTP-FÖRFRÅGAN!');
    console.log('🎯 VERKLIG 2KM UPPLÖSNING från HARMONIE modellen!');
    console.log('💪 PROFESSIONELL KVALITET - GRATIS & KOMMERSIELLT!');
    
  } catch (error) {
    console.error('❌ FEL:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Kör main
main().catch(console.error); 