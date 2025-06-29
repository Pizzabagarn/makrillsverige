import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const API_KEY = process.env.DMI_API_KEY;
if (!API_KEY) throw new Error('DMI_API_KEY saknas i .env.local');

// 📋 Konfiguration - matchar exakt hur systemet fungerar
const config = {
  collection: 'dkss_nsbs', // Prova North Sea Baltic Sea (större område)
  parameters: ['current-u', 'current-v', 'water-temperature', 'salinity'], 
  bbox: '7.5,54.0,13.5,58.0', // Vårt önskade område (inom dkss_nsbs bounds)
  outputPath: path.join(process.cwd(), 'public', 'data', 'area-parameters.json'),
  crs: 'crs84',
  format: 'CoverageJSON',
  batchSize: 1, // Max 1 parameter åt gången för att undvika rate limit
  delayBetweenRequests: 1500 // 1.5 sekunder mellan anrop (under 5 req/sek limit)
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

  // VIKTIGT: Ingen datetime-filtrering - hämta ALLA tillgängliga tidssteg precis som systemet gör
  return `${url}?${params.toString()}`;
}

// 🌊 Hämta data för en batch av parametrar
async function fetchParameterBatch(parameters: string[]): Promise<any> {
  const url = buildCubeUrl(config.collection, config.bbox, parameters, config.format, config.crs);
  console.log(`📡 Hämtar parametrar: ${parameters.join(', ')}`);
  console.log(`🔗 URL: ${url.replace(API_KEY!, '[API_KEY]')}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Makrill Sverige Parameter Fetcher'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ API-fel för ${parameters.join(', ')}:`, errorText);
    throw new Error(`API-fel: ${res.status} - ${res.statusText}\n${errorText}`);
  }

  return await res.json() as any;
}

// 📊 Bearbeta CoverageJSON data - samma struktur som precomputed-grid.json
async function processCoverageJSON(coverageData: any, parameterNames: string[]) {
  console.log('📊 Bearbetar CoverageJSON data...');
  
  // Debug: visa strukturen
  console.log('🔍 CoverageJSON struktur:');
  console.log(`  - type: ${coverageData.type}`);
  console.log(`  - domain keys: ${coverageData.domain ? Object.keys(coverageData.domain) : 'saknas'}`);
  console.log(`  - ranges keys: ${coverageData.ranges ? Object.keys(coverageData.ranges) : 'saknas'}`);
  
  if (coverageData.domain?.axes) {
    console.log(`  - axes keys: ${Object.keys(coverageData.domain.axes)}`);
    Object.keys(coverageData.domain.axes).forEach(key => {
      const axis = coverageData.domain.axes[key];
      console.log(`    - ${key}: ${axis.values?.length || 0} värden`);
      if (key === 'x' || key === 'y') {
        console.log(`      - ${key} data:`, JSON.stringify(axis, null, 2));
      }
    });
  }
  
  // Visa en bit av ranges också
  if (coverageData.ranges) {
    Object.keys(coverageData.ranges).forEach(key => {
      const range = coverageData.ranges[key];
      console.log(`  - range ${key}: ${range.values?.length || 0} värden`);
      if (range.values?.length > 0) {
        console.log(`    - första 5: [${range.values.slice(0, 5).join(', ')}]`);
      }
    });
  }
  
  // Visa domainType för att förstå strukturen
  console.log(`  - domainType: ${coverageData.domain?.domainType}`);
  
  // Spara hela strukturen till debug-fil
  await fs.writeFile('debug-coverage.json', JSON.stringify(coverageData, null, 2), 'utf-8');
  
  if (!coverageData.domain || !coverageData.ranges) {
    console.error('❌ Ogiltig CoverageJSON struktur');
    console.log('Raw data:', JSON.stringify(coverageData, null, 2).slice(0, 1000) + '...');
    throw new Error('Ogiltig CoverageJSON struktur');
  }

  // Extrahera tidsstämplar (samma som i TimeSliderContext)
  const times: string[] = coverageData.domain.axes?.t?.values || [];
  if (times.length === 0) {
    throw new Error('Inga tidsstämplar hittades i data');
  }

  // Extrahera geografiska koordinater - stöd för Grid domainType
  let xValues: number[] = [];
  let yValues: number[] = [];
  
  // Grid domainType (DMI använder detta)
  if (coverageData.domain?.domainType === 'Grid') {
    console.log('🔍 Grid domainType detekterat, bygger koordinat-arrays...');
    
    const xAxis = coverageData.domain.axes?.x;
    const yAxis = coverageData.domain.axes?.y;
    
    if (xAxis && typeof xAxis.start !== 'undefined' && xAxis.stop && xAxis.num) {
      // Bygga x-koordinater från start, stop, num
      const xStart = xAxis.start || 0;
      const xStep = (xAxis.stop - xStart) / (xAxis.num - 1);
      xValues = Array.from({length: xAxis.num}, (_, i) => xStart + i * xStep);
      console.log(`  - x: ${xAxis.num} punkter från ${xStart} till ${xAxis.stop}`);
    }
    
    if (yAxis && typeof yAxis.start !== 'undefined' && yAxis.stop && yAxis.num) {
      // Bygga y-koordinater från start, stop, num
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
    console.log('Tillgängliga axlar:', Object.keys(coverageData.domain.axes || {}));
    console.log('X-axel:', JSON.stringify(coverageData.domain.axes?.x, null, 2));
    console.log('Y-axel:', JSON.stringify(coverageData.domain.axes?.y, null, 2));
    throw new Error('Inga geografiska koordinater hittades');
  }

  console.log(`📈 Data dimensioner: ${times.length} tidssteg, ${xValues.length}×${yValues.length} = ${xValues.length * yValues.length} punkter`);
  console.log(`📅 Tidsperiod: ${times[0]} → ${times[times.length - 1]}`);

  // Organisera data per geografisk punkt (samma struktur som precomputed-grid.json)
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
          data: [] // Array av tidssteg med all data
        });
      }

      const pointData = pointsMap.get(key);

      // Lägg till data för varje tidssteg
      for (let tIdx = 0; tIdx < times.length; tIdx++) {
        // Beräkna index i flattened array (t, y, x)
        const flatIndex = tIdx * (yValues.length * xValues.length) + yIdx * xValues.length + xIdx;

        // Hitta eller skapa data för denna tid
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
            
            // Specialhantering för current (samma som i systemet)
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
            } else if (paramName === 'seaLevel') {
              timeData.seaLevel = value;
            } else {
              // Generisk parameter
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

// 🚀 Huvudfunktion
async function main() {
  try {
    console.log('🌊 Makrill Sverige - DMI Parameter Fetcher');
    console.log('==========================================');
    console.log(`📋 Collection: ${config.collection}`);
    console.log(`🌍 BBox: ${config.bbox}`);
    console.log(`📊 Parametrar: ${config.parameters.join(', ')}`);
    console.log(`📏 Batch-storlek: ${config.batchSize} parametrar åt gången`);

    let allResults: any = {
      metadata: {
        collection: config.collection,
        parameters: config.parameters,
        bbox: config.bbox,
        fetchedAt: new Date().toISOString(),
        format: config.format
      },
      points: []
    };

    // Dela upp parametrar i batches för att undvika timeout
    const parameterBatches: string[][] = [];
    for (let i = 0; i < config.parameters.length; i += config.batchSize) {
      parameterBatches.push(config.parameters.slice(i, i + config.batchSize));
    }

    console.log(`🔄 Kommer att hämta ${parameterBatches.length} batches`);

    // Hämta första batchen för att få grundstrukturen
    const firstBatch = parameterBatches[0];
    console.log(`\n📦 Batch 1/${parameterBatches.length}: ${firstBatch.join(', ')}`);
    
    const firstData = await fetchParameterBatch(firstBatch);
    const firstResults = await processCoverageJSON(firstData, firstBatch);
    
    // Initiera resultat med första batchen
    allResults.points = firstResults.points;
    allResults.metadata.timestamps = firstResults.timestamps;
    allResults.metadata.totalPoints = firstResults.points.length;

    console.log(`✅ Batch 1 klar: ${firstResults.points.length} punkter, ${firstResults.timestamps.length} tidssteg`);

    // Hämta resterande batches och merga data
    for (let i = 1; i < parameterBatches.length; i++) {
      const batch = parameterBatches[i];
      console.log(`\n📦 Batch ${i + 1}/${parameterBatches.length}: ${batch.join(', ')}`);
      
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
                      // Specialhantering för current - merga u och v
                      if (!existingTimeData.current) {
                        existingTimeData.current = {};
                      }
                      if (newTimeData.current) {
                        Object.assign(existingTimeData.current, newTimeData.current);
                      }
                    } else {
                      // Andra parametrar kopieras direkt
                      existingTimeData[key] = newTimeData[key];
                    }
                  }
                });
              }
            }
          }
        }
        
        console.log(`✅ Batch ${i + 1} mergad`);
        
        // Vänta för att respektera rate limit (max 5 requests per sekund)
        console.log(`⏱️  Väntar ${config.delayBetweenRequests}ms innan nästa batch...`);
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
        
      } catch (error) {
        console.error(`❌ Fel i batch ${i + 1}:`, error);
        console.log('⚠️  Fortsätter med nästa batch...');
      }
    }

    // Beräkna final statistik
    const validPoints = allResults.points.filter((point: any) => 
      point.data.some((d: any) => 
        d.current?.u !== null || d.temperature !== null || d.salinity !== null
      )
    );

    console.log(`\n📊 Slutlig statistik:`);
    console.log(`  📍 Totala punkter: ${allResults.points.length}`);
    console.log(`  ✅ Giltiga punkter: ${validPoints.length}`);
    console.log(`  📅 Tidssteg: ${allResults.metadata.timestamps?.length || 0}`);
    console.log(`  📏 Tidsperiod: ${allResults.metadata.timestamps?.[0]} → ${allResults.metadata.timestamps?.[allResults.metadata.timestamps.length - 1]}`);

    // Spara och komprimera resultatet
    await fs.mkdir(path.dirname(config.outputPath), { recursive: true });
    
    // Komprimera direkt utan att spara okomprimerad fil
    const { gzip } = await import('zlib');
    const { promisify } = await import('util');
    const gzipAsync = promisify(gzip);
    
    console.log(`\n🗜️ Komprimerar data...`);
    const jsonData = JSON.stringify(allResults, null, 2);
    const originalSize = Buffer.byteLength(jsonData, 'utf-8');
    const compressedData = await gzipAsync(jsonData);
    
    // Spara komprimerad fil
    const compressedPath = config.outputPath + '.gz';
    await fs.writeFile(compressedPath, compressedData);
    
    console.log(`💾 Komprimerad data sparad till: ${compressedPath}`);
    console.log(`📊 Storlek: ${(compressedData.length / 1024 / 1024).toFixed(2)} MB (${((1 - compressedData.length / originalSize) * 100).toFixed(1)}% mindre än okomprimerad)`);
    console.log('🎉 Klart! Data är redo för användning.');
    
  } catch (error) {
    console.error('💥 Fel vid körning:', error);
    process.exit(1);
  }
}

// Kör scriptet
main();
