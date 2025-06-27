// Hämta area-parameters för ett utökat område som täcker hela svenska västkusten och Östersjön
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

// 📋 Utökad konfiguration för större geografisk täckning
const config = {
  collection: 'dkss_nsbs', // North Sea Baltic Sea (större område)
  parameters: ['current-u', 'current-v', 'water-temperature', 'salinity'], 
  // FOKUS OMRÅDE: Svenska västkusten, Öresund och sydkusten
  // Västkusten: Skagerrak/Kattegatt (Göteborg-området)
  // Öresund: Mellan Sverige och Danmark  
  // Sydkusten: Södra Östersjön öster om Malmö
  bbox: '10.3,54.9,16.6,59.6', // Baserat på specifika koordinater: västkusten till Stockholm
  outputPath: path.join(process.cwd(), 'public', 'data', 'area-parameters-extended.json'),
  crs: 'crs84',
  format: 'CoverageJSON',
  batchSize: 1, // Max 1 parameter åt gången för att undvika rate limit
  delayBetweenRequests: 2000 // 2 sekunder mellan anrop (större område = längre svarstid)
};

// 🔧 Bygg API URL för cube-anrop
function buildCubeUrl(collection: string, bbox: string, parameters: string[], format: string, crs: string): string {
  const baseUrl = 'https://dmigw.govcloud.dk/v1/forecastedr/collections';
  const url = `${baseUrl}/${collection}/cube`;

  const params = new URLSearchParams({
    bbox: bbox,
    crs: crs,
    'parameter-name': parameters.join(','),
    'format': format,
    'api-key': API_KEY!
  });

  return `${url}?${params.toString()}`;
}

// 🌊 Hämta data för en batch av parametrar
async function fetchParameterBatch(parameters: string[]): Promise<any> {
  const url = buildCubeUrl(config.collection, config.bbox, parameters, config.format, config.crs);
  console.log(`📡 Hämtar parametrar: ${parameters.join(', ')}`);
  console.log(`🗺️  FOKUS BBOX: ${config.bbox} (svenska västkusten + Öresund + sydkusten)`);
  console.log(`🔗 URL: ${url.replace(API_KEY!, '[API_KEY]')}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Makrill Sverige Extended Parameter Fetcher'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ API-fel för ${parameters.join(', ')}:`, errorText);
    throw new Error(`API-fel: ${res.status} - ${res.statusText}\n${errorText}`);
  }

  return await res.json() as any;
}

// 📊 Bearbeta CoverageJSON data
async function processCoverageJSON(coverageData: any, parameterNames: string[]) {
  console.log('📊 Bearbetar utökad CoverageJSON data...');
  
  if (!coverageData.domain || !coverageData.ranges) {
    console.error('❌ Ogiltig CoverageJSON struktur');
    throw new Error('Ogiltig CoverageJSON struktur');
  }

  // Extrahera tidsstämplar
  const times: string[] = coverageData.domain.axes?.t?.values || [];
  if (times.length === 0) {
    throw new Error('Inga tidsstämplar hittades i data');
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
  // Alternativa namn för DKSS
  else if (coverageData.domain.axes?.lon?.values && coverageData.domain.axes?.lat?.values) {
    xValues = coverageData.domain.axes.lon.values;
    yValues = coverageData.domain.axes.lat.values;
  }
  
  if (xValues.length === 0 || yValues.length === 0) {
    console.error('❌ Kunde inte hitta geografiska koordinater');
    throw new Error('Inga geografiska koordinater hittades');
  }

  console.log(`📈 UTÖKADE dimensioner: ${times.length} tidssteg, ${xValues.length}×${yValues.length} = ${xValues.length * yValues.length} punkter`);
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

        // Lägg till parametervärden
        for (const paramName of parameterNames) {
          const parameterData = coverageData.ranges[paramName];
          if (parameterData && parameterData.values) {
            const value = parameterData.values[flatIndex];
            
            if (paramName === 'current-u') {
              if (!timeData.current) timeData.current = {};
              timeData.current.u = value;
            } else if (paramName === 'current-v') {
              if (!timeData.current) timeData.current = {};
              timeData.current.v = value;
            } else if (paramName === 'water-temperature') {
              timeData.temperature = value;
            } else if (paramName === 'salinity') {
              timeData.salinity = value;
            } else {
              timeData[paramName] = value;
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
  console.log('🚀 Startar utökad area-parameters hämtning...');
  console.log(`📊 Konfiguration:
  - Kollektion: ${config.collection}
  - Parametrar: ${config.parameters.join(', ')}
  - FOKUS BBOX: ${config.bbox} (svenska västkusten + Öresund + sydkusten)
  - Format: ${config.format}
  - Batch-storlek: ${config.batchSize}
  - Fördröjning: ${config.delayBetweenRequests}ms`);

  try {
    // Dela upp parametrar i batches för att undvika rate limiting
    const parameterBatches: string[][] = [];
    for (let i = 0; i < config.parameters.length; i += config.batchSize) {
      parameterBatches.push(config.parameters.slice(i, i + config.batchSize));
    }

    console.log(`📦 Kommer att hämta ${parameterBatches.length} batches...`);

    // Hämta första batch
    const firstBatch = parameterBatches[0];
    console.log(`\n📦 Batch 1/${parameterBatches.length}: ${firstBatch.join(', ')}`);
    
    const firstData = await fetchParameterBatch(firstBatch);
    let allResults = await processCoverageJSON(firstData, firstBatch);

    // Hämta resterande batches och merga data
    for (let i = 1; i < parameterBatches.length; i++) {
      const batch = parameterBatches[i];
      console.log(`\n📦 Batch ${i + 1}/${parameterBatches.length}: ${batch.join(', ')}`);
      
      // Vänta mellan requests
      console.log(`⏳ Väntar ${config.delayBetweenRequests}ms...`);
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
      
      try {
        const batchData = await fetchParameterBatch(batch);
        const batchResults = await processCoverageJSON(batchData, batch);
        
        // Merga data in i befintliga punkter
        for (let pointIdx = 0; pointIdx < allResults.points.length; pointIdx++) {
          const existingPoint = allResults.points[pointIdx];
          const newPoint = batchResults.points[pointIdx];
          
          if (existingPoint && newPoint) {
            // Merga data för varje tidssteg
            for (let timeIdx = 0; timeIdx < existingPoint.data.length; timeIdx++) {
              const existingTimeData = existingPoint.data[timeIdx];
              const newTimeData = newPoint.data[timeIdx];
              
              if (existingTimeData && newTimeData && existingTimeData.time === newTimeData.time) {
                // Kopiera nya parametrar
                Object.keys(newTimeData).forEach(key => {
                  if (key !== 'time') {
                    if (key === 'current') {
                      if (!existingTimeData.current) {
                        existingTimeData.current = {};
                      }
                      if (newTimeData.current) {
                        Object.assign(existingTimeData.current, newTimeData.current);
                      }
                    } else {
                      existingTimeData[key] = newTimeData[key];
                    }
                  }
                });
              }
            }
          }
        }
        
        console.log(`✅ Batch ${i + 1} mergad`);
      } catch (batchError) {
        console.error(`❌ Batch ${i + 1} misslyckades:`, batchError);
        console.log('🔄 Fortsätter med nästa batch...');
      }
    }

    // Sammanställ final metadata
    const finalData = {
      metadata: {
        collection: config.collection,
        parameters: config.parameters,
        bbox: config.bbox, // UTÖKAD BBOX
        fetchedAt: new Date().toISOString(),
        format: config.format,
        timestamps: allResults.timestamps
      },
      points: allResults.points
    };

    // Spara bara som gzippad version för Git/Vercel deployment
    console.log('\n💾 Sparar utökad data som gzip (optimerat för Git deployment)...');
    const gzipPath = config.outputPath.replace('.json', '.json.gz');
    
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
    
    console.log(`✅ UTÖKAD area-parameters data sparad!
📁 GZIP: ${gzipPath} (${(gzipStats.size / 1024 / 1024).toFixed(1)} MB) - optimerat för Git deployment
📊 Statistik:
   - Totalt punkter: ${finalData.points.length}
   - Tidssteg: ${finalData.metadata.timestamps.length}
   - Parametrar: ${finalData.metadata.parameters.join(', ')}
   - UTÖKAD geografisk täckning: ${config.bbox}
   - Kollektion: ${config.collection}`);

    // Visa geografisk täckning
    const lats = finalData.points.map(p => p.lat);
    const lons = finalData.points.map(p => p.lon);
    console.log(`🗺️  Faktisk täckning:
   - Latitud: ${Math.min(...lats).toFixed(2)}° till ${Math.max(...lats).toFixed(2)}°
   - Longitud: ${Math.min(...lons).toFixed(2)}° till ${Math.max(...lons).toFixed(2)}°`);

    // Visa exempel på första punktens data
    if (finalData.points.length > 0) {
      const firstPoint = finalData.points[0];
      console.log(`📍 Exempel punkt (${firstPoint.lat.toFixed(3)}, ${firstPoint.lon.toFixed(3)}):
   - Tidssteg: ${firstPoint.data.length}
   - Första data: ${JSON.stringify(firstPoint.data[0], null, 2)}`);
    }

  } catch (error) {
    console.error('❌ Fel vid hämtning av utökad area-parameters data:', error);
    process.exit(1);
  }
}

// Run main function directly in ES module
main(); 