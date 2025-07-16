// Hämta area-parameters för ett utökat område som täcker hela svenska västkusten och Östersjön
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import * as readline from 'readline';
// ⭐ NYTT: Importera kritiska punkter
import { DMI_GRID_POINTS } from '../src/lib/points.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔧 Haversine-distansfunktion för att beräkna avståndet mellan två punkter
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Jordens radie i km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}



dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Hjälpfunktion för att fråga användaren y/n
function askUser(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
    });
  });
}

const API_KEY = process.env.DMI_API_KEY;
if (!API_KEY) throw new Error('DMI_API_KEY saknas i .env.local');

// 📋 Utökad konfiguration för större geografisk täckning
const config = {
  collection: 'dkss_nsbs', // North Sea Baltic Sea (större område)
  pointCollection: 'dkss_idw', // För punktspecifik data
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

// ⭐ NYTT: Bygg API URL för punktspecifikt anrop
function buildPositionUrl(collection: string, lat: number, lon: number, parameters: string[], format: string, crs: string): string {
  const baseUrl = 'https://dmigw.govcloud.dk/v1/forecastedr/collections';
  const url = `${baseUrl}/${collection}/position`;

  const params = new URLSearchParams({
    coords: `POINT(${lon} ${lat})`,
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

// ⭐ NYTT: Hämta punktspecifik data för kritiska passager
async function fetchPointSpecificData(lat: number, lon: number, name: string, parameters: string[]): Promise<any> {
  const url = buildPositionUrl(config.pointCollection, lat, lon, parameters, config.format, config.crs);
  console.log(`📍 Hämtar punktdata för ${name} (${lat.toFixed(3)}, ${lon.toFixed(3)})`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Makrill Sverige Point Data Fetcher'
    }
  });

  if (!res.ok) {
    console.warn(`⚠️  Misslyckades för punkt ${name}: ${res.status} - ${res.statusText}`);
    return null;
  }

  return await res.json() as any;
}

// ⭐ NYTT: Bearbeta punktspecifik CoverageJSON data
async function processPointCoverageJSON(coverageData: any, lat: number, lon: number, name: string, parameterNames: string[]) {
  if (!coverageData || !coverageData.domain || !coverageData.ranges) {
    console.warn(`⚠️  Ogiltig punktdata för ${name}`);
    return null;
  }

  // Extrahera tidsstämplar
  const times: string[] = coverageData.domain.axes?.t?.values || [];
  if (times.length === 0) {
    console.warn(`⚠️  Inga tidsstämplar för punkt ${name}`);
    return null;
  }

  const pointData = {
    lat,
    lon,
    name,
    isPointSpecific: true, // Flagga för att identifiera punktspecifik data
    data: [] as any[]
  };

  // Lägg till data för varje tidssteg
  for (let tIdx = 0; tIdx < times.length; tIdx++) {
    const timeData: any = { time: times[tIdx] };

    // Lägg till parametervärden
    for (const paramName of parameterNames) {
      const parameterData = coverageData.ranges[paramName];
      if (parameterData && parameterData.values && parameterData.values[tIdx] !== null) {
        const value = parameterData.values[tIdx];
        
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

    pointData.data.push(timeData);
  }

  return pointData;
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
          isPointSpecific: false, // Grid-data
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
  try {
    // 📍 STEG 1: Hämta grid-data (cube-anrop)
    console.log('🌊 STEG 1: Hämtar grid-data för utökad area...');
    const allResults = {
      points: [] as any[],
      timestamps: [] as string[]
    };

    // Hämta alla parametrar i batches
    const batches = [];
    for (let i = 0; i < config.parameters.length; i += 2) {
      batches.push(config.parameters.slice(i, i + 2));
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
             }
            
            console.log(`✅ Batch ${batchIndex + 1} klar: ${processedData.points.length} punkter`);
          }
        }
      } catch (error) {
        console.error(`❌ Batch ${batchIndex + 1} misslyckades:`, error);
        
        // Fråga om användaren vill fortsätta eller avbryta
        const shouldContinue = await askUser(`Vill du fortsätta med nästa batch? (y/n): `);
        if (!shouldContinue) {
          console.log('❌ Avbryter på användarens begäran');
          process.exit(1);
        }
        console.log('🔄 Fortsätter med nästa batch...');
      }
    }

    // 📍 STEG 2: Hämta punktspecifik data
    console.log('\n🎯 STEG 2: Hämtar punktspecifik data...');
    console.log(`📍 Punkter att hämta: ${DMI_GRID_POINTS.length} st`);

    // Förbättrad feedback - visa vilka punkter som är manuella
    const manualPoints = DMI_GRID_POINTS.filter(p => p.id && p.id.startsWith('manual-'));
    const regularPoints = DMI_GRID_POINTS.filter(p => !p.id || !p.id.startsWith('manual-'));
    
    if (manualPoints.length > 0) {
      console.log(`\n🔧 Manuella punkter: ${manualPoints.length} st`);
      manualPoints.forEach(point => {
        console.log(`   🎯 ${point.name} (${point.lat.toFixed(3)}, ${point.lon.toFixed(3)})`);
      });
    }
    
    if (regularPoints.length > 0) {
      console.log(`\n📍 Fördefinierade punkter: ${regularPoints.length} st`);
    }

    const pointSpecificResults: any[] = [];
    let successfulPoints = 0;
    let manualPointsSuccessful = 0;

    // Hämta data för alla punkter
    for (let i = 0; i < DMI_GRID_POINTS.length; i++) {
      const point = DMI_GRID_POINTS[i];
      console.log(`\n📍 Punkt ${i + 1}/${DMI_GRID_POINTS.length}: ${point.name} (${point.lat.toFixed(3)}, ${point.lon.toFixed(3)})`);
      
      // Vänta mellan requests
      if (i > 0) {
        console.log(`⏳ Väntar ${config.delayBetweenRequests}ms...`);
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
      }
      
      try {
        const pointData = await fetchPointSpecificData(point.lat, point.lon, point.name || 'Unnamed', config.parameters);
        
        if (pointData) {
          const processedPoint = await processPointCoverageJSON(pointData, point.lat, point.lon, point.name || 'Unnamed', config.parameters);
          
          if (processedPoint) {
            pointSpecificResults.push(processedPoint);
            successfulPoints++;
            
            // Räkna manuella punkter
            if (point.id && point.id.startsWith('manual-')) {
              manualPointsSuccessful++;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Fel vid hämtning av punkt ${point.name}:`, error);
      }
    }

    console.log(`\n📊 Punktspecifik data klar: ${successfulPoints}/${DMI_GRID_POINTS.length} lyckades`);
    
    if (manualPoints.length > 0) {
      console.log(`🎯 Manuella punkter: ${manualPointsSuccessful}/${manualPoints.length} lyckades`);
      
      // Visa vilka punkter som lyckades/misslyckades
      manualPoints.forEach(point => {
        const wasSuccessful = pointSpecificResults.some(result => 
          result.name === point.name && Math.abs(result.lat - point.lat) < 0.001 && Math.abs(result.lon - point.lon) < 0.001
        );
        
        if (wasSuccessful) {
          console.log(`   ✅ ${point.name} - Data hämtad och kommer att inkluderas i visualiseringen`);
        } else {
          console.log(`   ❌ ${point.name} - Ingen data hämtad (punkt kan vara på land eller utanför datatäckning)`);
        }
      });
    }

    // 🔄 STEG 3: Merga grid-data + punktspecifik data
    console.log('\n🔄 STEG 3: Mergar grid-data med punktspecifik data...');
    
    // Lägg till punktspecifik data till allResults
    allResults.points.push(...pointSpecificResults);

    console.log(`📊 Total täckning efter merge: ${allResults.points.length} punkter (${allResults.points.length - pointSpecificResults.length} grid + ${pointSpecificResults.length} punkt-specifika)`);

    // Sammanställ final metadata
    const finalData = {
      metadata: {
        collection: config.collection,
        pointCollection: config.pointCollection,
        parameters: config.parameters,
        bbox: config.bbox, // UTÖKAD BBOX
        fetchedAt: new Date().toISOString(),
        format: config.format,
        timestamps: allResults.timestamps,
        gridPoints: allResults.points.length - pointSpecificResults.length,
        pointSpecificPoints: pointSpecificResults.length,
        totalPoints: allResults.points.length
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

    // 🧹 Interaktiv rensning av misslyckade manuella punkter
    if (manualPoints.length > 0) {
      const failedManualPoints = manualPoints.filter(point => {
        const wasSuccessful = pointSpecificResults.some(result => 
          result.name === point.name && Math.abs(result.lat - point.lat) < 0.001 && Math.abs(result.lon - point.lon) < 0.001
        );
        return !wasSuccessful;
      });

      if (failedManualPoints.length > 0) {
        console.log(`\n🧹 Upptäckte ${failedManualPoints.length} misslyckade manuella punkter:`);
        failedManualPoints.forEach(point => {
          console.log(`   ❌ ${point.name} (${point.lat.toFixed(6)}, ${point.lon.toFixed(6)})`);
        });
        
        const shouldCleanup = await askUser(`\nVill du ta bort dessa misslyckade punkter från points.ts? (y/n): `);
        
        if (shouldCleanup) {
          console.log('\n🔧 Renser misslyckade punkter...');
          
          // Uppdatera points.ts filen
          const pointsPath = path.resolve(__dirname, '../src/lib/points.ts');
          let pointsContent = await fs.readFile(pointsPath, 'utf-8');
          
          // Ta bort de misslyckade punkterna
          const failedIds = failedManualPoints.map(p => p.id).filter(id => id != null);
          
          let newPointsContent = pointsContent;
          failedIds.forEach(id => {
            const regex = new RegExp(`\\s*{[^}]*id:\\s*['"]${id}['"][^}]*},?\\s*`, 'g');
            newPointsContent = newPointsContent.replace(regex, '');
          });
          
          // Rensa upp extra komman
          newPointsContent = newPointsContent.replace(/,(\s*[\]\}])/g, '$1');
          
          await fs.writeFile(pointsPath, newPointsContent, 'utf-8');
          
          console.log(`✅ ${failedManualPoints.length} misslyckade punkter har tagits bort från points.ts`);
        }
      } else {
        console.log(`✅ Alla manuella punkter lyckades - ingen rensning behövs`);
      }
    }

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
