// Hämta väderdata för hela bbox-området - samma struktur som fetchAreaParametersExtended
// Kör med: npx tsx scripts/fetchWeatherData.ts

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const API_KEY = process.env.DMI_API_KEY;
if (!API_KEY) throw new Error('DMI_API_KEY saknas i .env.local');

// 📋 Konfiguration för väderdata - samma bbox som du specificerade
const config = {
  collection: 'harmonie_dini_sf', // HARMONIE vädermodell
  // Bara parametrar som fungerar med cube-endpointen
  parameters: ['temperature-2m', 'total-precipitation'], // Fungerar säkert 
  bbox: '2.970702,54.824871,26.613280,70', // Din specificerade bbox
  outputPath: path.join(process.cwd(), 'public', 'data', 'weather_data.json'),
  crs: 'native',
  format: 'CoverageJSON',
  batchSize: 2, // Max 2 parametrar åt gången för att undvika rate limit
  delayBetweenRequests: 2000 // 2 sekunder mellan anrop
};

// 🔧 Bygg API URL för cube-anrop (hela bbox-området)
function buildCubeUrl(collection: string, bbox: string, parameters: string[], format: string, crs: string): string {
  const baseUrl = 'https://dmigw.govcloud.dk/v1/forecastedr/collections';
  const url = `${baseUrl}/${collection}/cube`;

  // Använd samma tidsspann som ditt exempel-anrop (utan datetime för att få max data)
  // Vi utelämnar datetime för att få standardintervallet som API:et ger

  const params = new URLSearchParams({
    bbox: bbox,
    crs: crs,
    'parameter-name': parameters.join(','),
    // Utelämna datetime för att få standardintervallet (mer data)
    'format': format,
    'api-key': API_KEY!
  });

  return `${url}?${params.toString()}`;
}

// 🌊 Hämta data för en batch av parametrar (hela bbox-området)
async function fetchParameterBatch(parameters: string[]): Promise<any> {
  const url = buildCubeUrl(config.collection, config.bbox, parameters, config.format, config.crs);
  console.log(`📡 Hämtar väderparametrar: ${parameters.join(', ')}`);
  console.log(`🗺️  VÄDER BBOX: ${config.bbox} (hela området)`);
  console.log(`🔗 URL: ${url.replace(API_KEY!, '[API_KEY]')}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Makrill Sverige Weather Grid Fetcher'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ API-fel för ${parameters.join(', ')}:`, errorText);
    throw new Error(`API-fel: ${res.status} - ${res.statusText}\n${errorText}`);
  }

  return await res.json() as any;
}

// 📊 Bearbeta CoverageJSON väderdata (samma struktur som fetchAreaParametersExtended)
async function processCoverageJSON(coverageData: any, parameterNames: string[]) {
  console.log('📊 Bearbetar väderdata CoverageJSON...');
  
  if (!coverageData.domain || !coverageData.ranges) {
    console.error('❌ Ogiltig CoverageJSON struktur');
    throw new Error('Ogiltig CoverageJSON struktur');
  }

  // Debug: Lista tillgängliga parametrar
  console.log('🔍 Tillgängliga parametrar i API-svar:', Object.keys(coverageData.ranges || {}));
  console.log('🔍 Efterfrågade parametrar:', parameterNames);

  // Extrahera tidsstämplar
  const times: string[] = coverageData.domain.axes?.t?.values || [];
  if (times.length === 0) {
    throw new Error('Inga tidsstämplar hittades i väderdata');
  }

  // Extrahera geografiska koordinater
  let xValues: number[] = [];
  let yValues: number[] = [];
  
  // Grid domainType (DMI använder detta)
  if (coverageData.domain?.domainType === 'Grid') {
    console.log('🔍 Grid domainType detekterat, bygger koordinat-arrays...');
    
    const xAxis = coverageData.domain.axes?.x;
    const yAxis = coverageData.domain.axes?.y;
    
    if (xAxis && typeof xAxis.start !== 'undefined' && xAxis.stop && xAxis.num) {
      const xStart = xAxis.start || 0;
      const xStep = (xAxis.stop - xStart) / (xAxis.num - 1);
      xValues = Array.from({length: xAxis.num}, (_, i) => xStart + i * xStep);
      console.log(`  - x: ${xAxis.num} punkter från ${xStart} till ${xAxis.stop}`);
    }
    
    if (yAxis && typeof yAxis.start !== 'undefined' && yAxis.stop && yAxis.num) {
      const yStart = yAxis.start || 0;
      const yStep = (yAxis.stop - yStart) / (yAxis.num - 1);
      yValues = Array.from({length: yAxis.num}, (_, i) => yStart + i * yStep);
      console.log(`  - y: ${yAxis.num} punkter från ${yStart} till ${yAxis.stop}`);
    }
  }
  // Standardnamn (explicit values)
  else if (coverageData.domain.axes?.x?.values && coverageData.domain.axes?.y?.values) {
    xValues = coverageData.domain.axes.x.values;
    yValues = coverageData.domain.axes.y.values;
  }
  // Alternativa namn för lon/lat
  else if (coverageData.domain.axes?.lon?.values && coverageData.domain.axes?.lat?.values) {
    xValues = coverageData.domain.axes.lon.values;
    yValues = coverageData.domain.axes.lat.values;
  }
  
  if (xValues.length === 0 || yValues.length === 0) {
    console.error('❌ Kunde inte hitta geografiska koordinater');
    throw new Error('Inga geografiska koordinater hittades');
  }

  console.log(`📈 VÄDER dimensioner: ${times.length} tidssteg, ${xValues.length}×${yValues.length} = ${xValues.length * yValues.length} punkter`);
  console.log(`📅 Tidsperiod: ${times[0]} → ${times[times.length - 1]}`);
  console.log(`🗺️  Geografisk täckning: lat ${Math.min(...yValues).toFixed(2)}° - ${Math.max(...yValues).toFixed(2)}°, lon ${Math.min(...xValues).toFixed(2)}° - ${Math.max(...xValues).toFixed(2)}°`);

  // Organisera data per geografisk punkt
  const pointsMap = new Map<string, any>();

  // Iterera genom alla geografiska punkter
  for (let yIdx = 0; yIdx < yValues.length; yIdx++) {
    for (let xIdx = 0; xIdx < xValues.length; xIdx++) {
      const lat = yValues[yIdx];
      const lon = xValues[xIdx];
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;

      if (!pointsMap.has(key)) {
        pointsMap.set(key, {
          lat,
          lon,
          data: []
        });
      }

      const pointData = pointsMap.get(key);

      // Lägg till data för varje tidssteg
      for (let tIdx = 0; tIdx < times.length; tIdx++) {
        const flatIndex = tIdx * (yValues.length * xValues.length) + yIdx * xValues.length + xIdx;

        let timeData = pointData.data.find((d: any) => d.time === times[tIdx]);
        if (!timeData) {
          timeData = { time: times[tIdx] };
          pointData.data.push(timeData);
        }

        // Lägg till väderparametrar
        for (const paramName of parameterNames) {
          const parameterData = coverageData.ranges[paramName];
          if (parameterData && parameterData.values) {
            let value = parameterData.values[flatIndex];
            
            // Konvertera enheter baserat på DMI HARMONIE dokumentation
            if (value !== null && value !== undefined) {
              if (paramName === '2t' || paramName === 'temperature-2m') {
                value = Math.round((value - 273.15) * 10) / 10; // K till °C
                timeData.temperature = value;
              } else if (paramName === 'tp' || paramName === 'total-precipitation') {
                value = Math.round(value * 100) / 100; // kg m**-2 (≈ mm)
                timeData.precipitation = value;
              } else if (paramName === '10si') {
                value = Math.round(value * 10) / 10; // m/s
                timeData.windSpeed = value;
              } else if (paramName === '10wdir') {
                value = Math.round(value); // Degree true
                timeData.windDirection = value;
              } else if (paramName === '10u') {
                value = Math.round(value * 10) / 10; // m s**-1
                if (!timeData.wind) timeData.wind = {};
                timeData.wind.u = value;
              } else if (paramName === '10v') {
                value = Math.round(value * 10) / 10; // m s**-1
                if (!timeData.wind) timeData.wind = {};
                timeData.wind.v = value;
              } else if (paramName === 'cc') {
                value = Math.round(value * 100); // (0-1) till procent
                timeData.cloudCover = value;
              } else if (paramName === 'gust') {
                value = Math.round(value * 10) / 10; // m s**-1
                timeData.windGust = value;
              } else if (paramName === 'pres') {
                value = Math.round(value / 100); // Pa till hPa
                timeData.pressure = value;
              } else {
                // För nya parametrar vi inte känner till än
                console.log(`🔍 Okänd parameter ${paramName}: ${value} (enhet från DMI docs)`);
              }
            }
          }
        }
      }

      // Sortera tidssteg för denna punkt
      pointData.data.sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }
  }

  return {
    timestamps: times,
    points: Array.from(pointsMap.values())
  };
}

async function main() {
  try {
    console.log('🌤️  Hämtar väderdata för hela bbox-området...\n');
    console.log(`🗺️  BBOX: ${config.bbox}`);
    console.log(`📊 Parametrar: ${config.parameters.join(', ')}\n`);
    
    const allResults = {
      points: [] as any[],
      timestamps: [] as string[]
    };

    // Hämta alla parametrar i batches (samma som fetchAreaParametersExtended)
    const batches = [];
    for (let i = 0; i < config.parameters.length; i += config.batchSize) {
      batches.push(config.parameters.slice(i, i + config.batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        console.log(`\n📦 Batch ${batchIndex + 1}/${batches.length}: ${batch.join(', ')}`);
        const batchData = await fetchParameterBatch(batch);
        
        if (batchData) {
          const processedData = await processCoverageJSON(batchData, batch);
          
          if (processedData) {
            // Första batch sätter timestamps
            if (batchIndex === 0) {
              allResults.timestamps = processedData.timestamps;
            }
            
            // Merga punkter från denna batch
            if (allResults.points.length === 0) {
              allResults.points = processedData.points;
            } else {
              // Merga ny data in i befintliga punkter
              for (let pointIdx = 0; pointIdx < allResults.points.length; pointIdx++) {
                const existingPoint = allResults.points[pointIdx];
                const newPoint = processedData.points[pointIdx];
                
                if (existingPoint && newPoint) {
                  // Merga data för varje tidssteg
                  for (let timeIdx = 0; timeIdx < existingPoint.data.length; timeIdx++) {
                    const existingTimeData = existingPoint.data[timeIdx];
                    const newTimeData = newPoint.data[timeIdx];
                    
                    if (existingTimeData && newTimeData && existingTimeData.time === newTimeData.time) {
                      // Kopiera nya parametrar
                      Object.keys(newTimeData).forEach(key => {
                        if (key !== 'time') {
                          existingTimeData[key] = newTimeData[key];
                        }
                      });
                    }
                  }
                }
              }
            }
            
            console.log(`✅ Batch ${batchIndex + 1} klar: ${processedData.points.length} punkter`);
          }
        }
      } catch (error) {
        console.error(`❌ Batch ${batchIndex + 1} misslyckades:`, error);
        throw error; // Avbryt om någon batch misslyckas
      }

      // Vänta mellan batches
      if (batchIndex < batches.length - 1) {
        console.log(`⏳ Väntar ${config.delayBetweenRequests}ms...`);
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
      }
    }

    // Sammanställ final metadata (samma struktur som fetchAreaParametersExtended)
    const finalData = {
      metadata: {
        collection: config.collection,
        parameters: config.parameters,
        bbox: config.bbox,
        fetchedAt: new Date().toISOString(),
        format: config.format,
        timestamps: allResults.timestamps,
        totalPoints: allResults.points.length,
        description: 'Väderdata för hela bbox-området från DMI HARMONIE'
      },
      points: allResults.points
    };

    // Spara som gzippad version precis som fetchAreaParametersExtended
    console.log('\n💾 Sparar väderdata som gzip (optimerat för Git deployment)...');
    const gzipPath = config.outputPath.replace('.json', '.json.gz');
    
    try {
      // Skriv direkt till gzip stream för att undvika minnesanvändning
      const gzipStream = createGzip({ level: 9 });
      const writeStream = (await import('fs')).createWriteStream(gzipPath);
      
      // Skriv data i chunks för att undvika minnesfel
      const jsonString = JSON.stringify(finalData, (key, value) => {
        // Minimal JSON för att spara minne
        return value;
      });
      
      const jsonStream = Readable.from([jsonString]);
      await pipeline(jsonStream, gzipStream, writeStream);

      const gzipStats = await fs.stat(gzipPath);
      
      console.log(`✅ VÄDERDATA sparad!
📁 GZIP: ${gzipPath} (${(gzipStats.size / 1024 / 1024).toFixed(1)} MB) - optimerat för Git deployment
📊 Statistik:
   - Totalt punkter: ${finalData.points.length}
   - Tidssteg: ${finalData.metadata.timestamps.length}
   - Parametrar: ${finalData.metadata.parameters.join(', ')}
   - VÄDER geografisk täckning: ${config.bbox}
   - Kollektion: ${config.collection}`);
      
      // Visa exempel på första punktens data
      if (finalData.points.length > 0) {
        const firstPoint = finalData.points[0];
        console.log(`📍 Exempel punkt (${firstPoint.lat.toFixed(3)}, ${firstPoint.lon.toFixed(3)}):
   - Tidssteg: ${firstPoint.data.length}
   - Första prognos: ${JSON.stringify(firstPoint.data[0], null, 2)}`);
      }
      
    } catch (error) {
      console.error('❌ Kunde inte spara fil:', error);
    }

  } catch (error) {
    console.error('❌ Fel vid hämtning av väderdata:', error);
    process.exit(1);
  }
}

// Kör script
main().catch(console.error); 