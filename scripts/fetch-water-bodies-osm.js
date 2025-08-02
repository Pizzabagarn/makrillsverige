#!/usr/bin/env node
// Hämta svenska vattendrag från OpenStreetMap Overpass API
// Skapar water_bodies.geojson för användning i väder-scriptet

// import fetch from 'node-fetch'; // Node 18+ har inbyggd fetch
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';

// Testa olika Overpass-servrar om första misslyckas
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter', 
  'https://overpass.openstreetmap.fr/api/interpreter'
];
let OVERPASS_URL = OVERPASS_URLS[0];
const OUTPUT_FILE = path.join(process.cwd(), 'public', 'data', 'water_bodies.geojson');

// Sverige uppdelat i MINDRE regioner (för att undvika minnesfel)
const SWEDEN_REGIONS = [
  // Södra Sverige (små regioner)
  { name: 'Stockholm-region', bbox: '59.0,17.5,59.7,18.8' },
  { name: 'Göteborg-region', bbox: '57.4,11.5,58.1,12.5' },
  { name: 'Malmö-region', bbox: '55.3,12.5,56.2,13.5' },
  
  // Mellansverige uppdelat
  { name: 'Uppsala-region', bbox: '59.7,17.0,60.5,18.0' },
  { name: 'Värmland-region', bbox: '59.0,12.0,60.5,14.0' },
  { name: 'Dalarna-region', bbox: '60.0,14.0,61.5,16.0' },
  { name: 'Gävleborg-region', bbox: '60.5,16.0,62.0,18.0' },
  
  // Norra Sverige uppdelat i MINDRE bitar
  { name: 'Västernorrland', bbox: '62.0,15.0,64.0,18.0' },
  { name: 'Jämtland', bbox: '62.5,12.0,64.5,16.0' },
  { name: 'Västerbotten-syd', bbox: '63.5,15.0,65.0,20.0' },
  { name: 'Västerbotten-nord', bbox: '65.0,18.0,66.5,22.0' },
  { name: 'Norrbotten-syd', bbox: '65.5,20.0,67.0,23.0' },
  { name: 'Norrbotten-nord', bbox: '67.0,20.0,69.1,24.2' },
  
  // Västra Sverige
  { name: 'Halland-region', bbox: '56.0,12.0,57.5,13.5' },
  { name: 'Småland-region', bbox: '56.2,13.5,58.0,16.0' }
];

function createRegionQuery(region) {
  return `
[out:json][timeout:120];
(
  way["natural"="water"](${region.bbox});
  relation["natural"="water"](${region.bbox});
  way["waterway"="river"](${region.bbox});
  way["waterway"="stream"](${region.bbox});
);
out geom;
`;
}

// Konvertera Overpass JSON till GeoJSON
function convertToGeoJSON(overpassData) {
  const features = [];
  
  for (const element of overpassData.elements) {
    if (element.type === 'way' && element.geometry) {
      // För ways (enkla polygoner/linjer)
      const coordinates = element.geometry.map(node => [node.lon, node.lat]);
      
      // Skapa polygon för sjöar, linestring för floder
      const isWater = element.tags?.natural === 'water' || element.tags?.landuse === 'reservoir';
      const geometry = {
        type: isWater ? 'Polygon' : 'LineString',
        coordinates: isWater ? [coordinates] : coordinates
      };
      
      features.push({
        type: 'Feature',
        properties: {
          name: element.tags?.name || 'Okänd',
          type: element.tags?.natural || element.tags?.waterway || element.tags?.landuse,
          area_km2: null, // Beräknas senare
          osm_id: element.id
        },
        geometry
      });
    }
    
    else if (element.type === 'relation') {
      // För relations (multipolygons)
      const outerWays = [];
      const innerWays = [];
      
      // Gruppera members
      for (const member of element.members || []) {
        if (member.type === 'way' && member.geometry) {
          const coords = member.geometry.map(node => [node.lon, node.lat]);
          if (member.role === 'outer') {
            outerWays.push(coords);
          } else if (member.role === 'inner') {
            innerWays.push(coords);
          }
        }
      }
      
      if (outerWays.length > 0) {
        features.push({
          type: 'Feature',
          properties: {
            name: element.tags?.name || 'Okänd',
            type: element.tags?.natural || element.tags?.waterway || element.tags?.landuse,
            area_km2: null,
            osm_id: element.id
          },
          geometry: {
            type: 'MultiPolygon',
            coordinates: outerWays.map(outer => [outer, ...innerWays])
          }
        });
      }
    }
  }
  
  return {
    type: 'FeatureCollection',
    features
  };
}

// Beräkna ungefärlig area för sjöar
function calculateApproximateArea(geometry) {
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null;
  
  // Enkel approximation - räkna antal koordinater * genomsnittlig area per punkt
  let totalPoints = 0;
  
  if (geometry.type === 'Polygon') {
    totalPoints = geometry.coordinates[0].length;
  } else {
    for (const polygon of geometry.coordinates) {
      totalPoints += polygon[0].length;
    }
  }
  
  // Grov uppskattning: ~0.1 km² per koordinatpunkt för typisk sjö
  return Math.max(0.01, totalPoints * 0.05);
}

async function fetchRegionData(region) {
  const query = createRegionQuery(region);
  let regionData = null;
  let lastError = null;
  
  // Testa olika servrar för denna region
  for (let i = 0; i < OVERPASS_URLS.length; i++) {
    const url = OVERPASS_URLS[i];
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Makrill Sverige Water Bodies Fetcher/1.0'
        },
        body: `data=${encodeURIComponent(query)}`
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      regionData = await response.json();
      console.log(`✅ ${region.name}: ${regionData.elements.length} vattendrag`);
      break;
      
    } catch (error) {
      lastError = error;
      console.log(`❌ ${region.name} misslyckades på server ${i + 1}: ${error.message}`);
      if (i < OVERPASS_URLS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Kort paus
      }
    }
  }
  
  if (!regionData) {
    console.log(`⚠️ Kunde inte hämta data för ${region.name}: ${lastError?.message}`);
    return { elements: [] };
  }
  
  return regionData;
}

async function fetchWaterBodies() {
  console.log('🌊 Hämtar svenska vattendrag från OpenStreetMap...');
  console.log(`📡 Hämtar data från ${SWEDEN_REGIONS.length} regioner...`);
  
  try {
    const allElements = [];
    
    for (const region of SWEDEN_REGIONS) {
      console.log(`🗺️ Hämtar: ${region.name}...`);
      const regionData = await fetchRegionData(region);
      allElements.push(...regionData.elements);
      
      // Paus mellan regioner för att inte överbelasta servern  
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const overpassData = { elements: allElements };
    console.log(`📊 Totalt: ${overpassData.elements.length} vattendragselement från alla regioner`);
    
    // RIKTIGT MINNESEFFEKTIV STREAMING - SKRIV DIREKT UTAN SORTERING
    console.log(`🔄 Bearbetar och skriver ${overpassData.elements.length} vattendrag direkt till fil...`);
    
    await fsPromises.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    const writeStream = fs.createWriteStream(OUTPUT_FILE);
    
    // Skriv början av GeoJSON
    writeStream.write('{\n  "type": "FeatureCollection",\n  "features": [\n');
    
    const CHUNK_SIZE = 10000; // Bearbeta 10k vattendrag i taget
    let processedCount = 0;
    let totalWritten = 0;
    let firstFeature = true;
    
    // Funktion för att skriva feature säkert MED ERROR HANDLING
    const writeFeature = (feature) => {
      return new Promise((resolve, reject) => {
        // Försök JSON.stringify FÖRST för att fånga RangeError
        let featureStr;
        try {
          featureStr = JSON.stringify(feature);
        } catch (error) {
          return reject(error); // Skicka felet uppåt
        }
        
        if (!firstFeature) {
          writeStream.write(',\n', (err) => {
            if (err) return reject(err);
            
            writeStream.write('    ' + featureStr, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        } else {
          firstFeature = false;
          writeStream.write('    ' + featureStr, (err) => {
            if (err) reject(err);
            else resolve();
          });
        }
      });
    };
    
    // Bearbeta i chunks
    for (let i = 0; i < overpassData.elements.length; i += CHUNK_SIZE) {
      const chunk = overpassData.elements.slice(i, i + CHUNK_SIZE);
      console.log(`📦 Bearbetar chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(overpassData.elements.length/CHUNK_SIZE)} (${chunk.length} element)`);
      
      // Konvertera chunk till GeoJSON
      const chunkGeoJSON = convertToGeoJSON({ elements: chunk });
      
      // Skriv varje feature DIREKT till fil (ingen minneslagring)
      for (const feature of chunkGeoJSON.features) {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          feature.properties.area_km2 = calculateApproximateArea(feature.geometry);
        }
        
        // Försök skriva feature, skippa om för stor
        try {
          await writeFeature(feature);
          totalWritten++;
        } catch (error) {
          if (error.message.includes('Invalid string length')) {
            console.log(`⚠️ Skippar för stor feature (${feature.properties?.name || 'okänd'})`);
            continue; // Hoppa över denna feature
          } else {
            throw error; // Andra fel ska krascha
          }
        }
        
        if (totalWritten % 10000 === 0) {
          console.log(`📝 Skrivit ${totalWritten} vattendrag till fil...`);
          if (global.gc) global.gc();
        }
      }
      
      processedCount += chunkGeoJSON.features.length;
      
      // Frigör minne från chunk DIREKT
      chunk.length = 0;
      chunkGeoJSON.features = [];
      if (global.gc) global.gc();
    }
    
    // Avsluta GeoJSON
    writeStream.write('\n  ]\n}');
    writeStream.end();
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    console.log(`✅ Sparade ${totalWritten} vattendrag till: ${OUTPUT_FILE} (utan sortering för minnesbesparing)`);
    
    // Statistik baserad på processedCount (inte detaljerad pga streaming)
    console.log(`📈 Totalt bearbetade: ${totalWritten} vattendrag från hela Sverige`);
    console.log(`🗂️ GeoJSON-fil skapad och redo för användning i väder-scriptet!`);
    
  } catch (error) {
    console.error('❌ Fel vid hämtning av vattendrag:', error);
    process.exit(1);
  }
}

// Kör om detta är huvudscriptet
console.log('🌊 Startar OSM-hämtning...');
fetchWaterBodies().catch(error => {
  console.error('❌ Kritiskt fel:', error);
  process.exit(1);
}); 