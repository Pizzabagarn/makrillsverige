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

// Flagga för att skippa manuella punkter (används av cronjob)
const SKIP_MANUAL_POINTS = process.env.SKIP_MANUAL_POINTS === 'true';

// CI mode - ingen user interaction (GitHub Actions, etc)
const IS_CI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

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
  delayBetweenRequests: 5000, // 5 sekunder mellan anrop för att respektera rate limit
  delayBetweenBatches: 10000 // 10 sekunder mellan batches för extra säkerhet
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

// 🔄 Retry-helper med exponential backoff och jitter
async function fetchWithRetry(url: string, maxRetries: number = 5): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Makrill Sverige Extended Parameter Fetcher'
        }
      });

      if (res.ok) {
        return await res.json() as any;
      }

      // Hantera 429 (Too Many Requests) speciellt
      if (res.status === 429) {
        const errorText = await res.text();
        
        // Beräkna exponential backoff: 5s, 10s, 20s, 40s, 80s
        const baseDelay = 5000;
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        
        // Lägg till jitter (slumpmässig variation ±20%)
        const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
        const delayMs = exponentialDelay + jitter;
        
        if (attempt < maxRetries - 1) {
          console.log(`⏳ 429 Rate limit! Försök ${attempt + 1}/${maxRetries}`);
          console.log(`⏰ Väntar ${(delayMs / 1000).toFixed(1)}s innan nästa försök...`);
          console.log(`💡 TIP: DMI API har 500 req/5s limit. Vid högt tryck kan det ta tid.`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        } else {
          console.error(`❌ Rate limit nått efter ${maxRetries} försök:`, errorText);
          throw new Error(`API Rate Limit: ${res.status}\n${errorText}`);
        }
      }

      // Andra fel
      const errorText = await res.text();
      console.error(`❌ API-fel (${res.status}):`, errorText);
      throw new Error(`API-fel: ${res.status} - ${res.statusText}\n${errorText}`);

    } catch (error: any) {
      // Nätverksfel eller annat
      if (error.message.includes('API Rate Limit')) {
        throw error; // Kasta vidare rate limit errors
      }
      
      if (attempt < maxRetries - 1) {
        const retryDelay = 3000 * (attempt + 1);
        console.warn(`⚠️  Nätverksfel, försöker igen om ${retryDelay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Max retries nådda');
}

// 🌊 Hämta data för en batch av parametrar
async function fetchParameterBatch(parameters: string[]): Promise<any> {
  const url = buildCubeUrl(config.collection, config.bbox, parameters, config.format, config.crs);
  console.log(`📡 Hämtar parametrar: ${parameters.join(', ')}`);
  console.log(`🗺️  FOKUS BBOX: ${config.bbox} (svenska västkusten + Öresund + sydkusten)`);
  console.log(`🔗 URL: ${url.replace(API_KEY!, '[API_KEY]')}`);

  return await fetchWithRetry(url, 5);
}

// ⭐ NYTT: Hämta punktspecifik data för kritiska passager MED TIMEOUT och RETRY
async function fetchPointSpecificData(lat: number, lon: number, name: string, parameters: string[]): Promise<any> {
  const url = buildPositionUrl(config.pointCollection, lat, lon, parameters, config.format, config.crs);
  console.log(`📍 Hämtar punktdata för ${name} (${lat.toFixed(3)}, ${lon.toFixed(3)})`);

  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // TIMEOUT CONTROLLER - Max 30 sekunder per punkt
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 sekunder timeout

    try {
      const startTime = Date.now();
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Makrill Sverige Point Data Fetcher'
        },
        signal: controller.signal // Lägg till abort signal
      });

      clearTimeout(timeoutId); // Rensa timeout om lyckad
      
      const elapsed = (Date.now() - startTime) / 1000;
      
      // Hantera 429 med retry
      if (res.status === 429) {
        const delayMs = 5000 * Math.pow(2, attempt);
        console.warn(`⏳ 429 för punkt ${name}, väntar ${(delayMs/1000).toFixed(1)}s... (försök ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      if (!res.ok) {
        console.warn(`⚠️  Misslyckades för punkt ${name}: ${res.status} - ${res.statusText} (${elapsed.toFixed(1)}s)`);
        return null;
      }

      console.log(`✅ Punkt ${name} hämtad på ${elapsed.toFixed(1)}s`);
      return await res.json() as any;
      
    } catch (error: any) {
      clearTimeout(timeoutId); // Rensa timeout
      
      if (error.name === 'AbortError') {
        console.warn(`⏰ TIMEOUT för punkt ${name} efter 30s - hoppar över`);
        return null;
      } else if (attempt < maxRetries - 1) {
        console.warn(`⚠️  Fel för punkt ${name}, försöker igen...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      } else {
        console.warn(`❌ Nätverksfel för punkt ${name}:`, error.message);
        return null;
      }
    }
  }
  
  return null;
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
      
      // Vänta mellan batches (inte första)
      if (batchIndex > 0) {
        console.log(`\n⏳ Väntar ${config.delayBetweenBatches / 1000}s mellan batches för att respektera rate limit...`);
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
      }
      
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
        
        // I CI mode - avbryt direkt, annars fråga användaren
        if (IS_CI) {
          console.log('❌ CI Mode: Avbryter vid batch-fel');
          process.exit(1);
        } else {
          // Fråga om användaren vill fortsätta eller avbryta
          const shouldContinue = await askUser(`Vill du fortsätta med nästa batch? (y/n): `);
          if (!shouldContinue) {
            console.log('❌ Avbryter på användarens begäran');
            process.exit(1);
          }
          console.log('🔄 Fortsätter med nästa batch...');
        }
      }
    }

    // 📍 STEG 2: Hämta punktspecifik data
    console.log('\n🎯 STEG 2: Hämtar punktspecifik data...');
    
    // Filtrera bort manuella punkter om SKIP_MANUAL_POINTS är satt
    let pointsToFetch = DMI_GRID_POINTS;
    if (SKIP_MANUAL_POINTS) {
      pointsToFetch = DMI_GRID_POINTS.filter(p => !p.isManualPoint);
      console.log(`⚠️  CRONJOB MODE: Skippar manuella punkter`);
      console.log(`📍 Hämtar endast ${pointsToFetch.length} fördefinierade punkter (${DMI_GRID_POINTS.length - pointsToFetch.length} manuella punkter skippade)`);
    } else {
      console.log(`📍 Punkter att hämta: ${DMI_GRID_POINTS.length} st`);
    }

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

    // Hämta data för alla punkter MED RETRY för manuella punkter
    for (let i = 0; i < pointsToFetch.length; i++) {
      const point = pointsToFetch[i];
      const isManualPoint = point.id && point.id.startsWith('manual-');
      
      console.log(`\n📍 Punkt ${i + 1}/${pointsToFetch.length}: ${point.name} (${point.lat.toFixed(3)}, ${point.lon.toFixed(3)})`);
      if (isManualPoint) {
        console.log(`   🔧 Manuell punkt - kommer försöka med timeout och retry`);
      }
      
      // Vänta mellan requests
      if (i > 0) {
        console.log(`⏳ Väntar ${config.delayBetweenRequests}ms...`);
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
      }
      
      // RETRY-LOGIK - Speciellt för manuella punkter
      const maxRetries = isManualPoint ? 2 : 1; // Manuella punkter får 2 försök
      let success = false;
      
      for (let retry = 0; retry < maxRetries && !success; retry++) {
        if (retry > 0) {
          console.log(`   🔄 Försök ${retry + 1}/${maxRetries} för ${point.name}...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2s paus mellan försök
        }
        
        try {
          const pointData = await fetchPointSpecificData(point.lat, point.lon, point.name || 'Unnamed', config.parameters);
          
          if (pointData) {
            const processedPoint = await processPointCoverageJSON(pointData, point.lat, point.lon, point.name || 'Unnamed', config.parameters);
            
            if (processedPoint) {
              pointSpecificResults.push(processedPoint);
              successfulPoints++;
              success = true;
              
              // Räkna manuella punkter
              if (isManualPoint) {
                manualPointsSuccessful++;
                console.log(`   ✅ Manuell punkt ${point.name} lyckades!`);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Försök ${retry + 1} misslyckades för punkt ${point.name}:`, error);
          
          // Om det är sista försöket för en manuell punkt
          if (retry === maxRetries - 1 && isManualPoint) {
            console.warn(`💔 Ger upp manuell punkt ${point.name} efter ${maxRetries} försök`);
          }
        }
      }
      
      // Progress report
      const progress = ((i + 1) / pointsToFetch.length * 100).toFixed(1);
      console.log(`   📊 Progress: ${progress}% (${successfulPoints}/${i + 1} lyckades)`);
    }

    console.log(`\n📊 Punktspecifik data klar: ${successfulPoints}/${pointsToFetch.length} lyckades`);
    
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

    // 🧹 Interaktiv rensning av misslyckade manuella punkter (endast om inte SKIP_MANUAL_POINTS)
    if (manualPoints.length > 0 && !SKIP_MANUAL_POINTS) {
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
        
        // I CI mode - skippa cleanup, annars fråga
        if (IS_CI) {
          console.log(`ℹ️  CI Mode: Skippar automatisk cleanup av misslyckade punkter`);
        } else {
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
