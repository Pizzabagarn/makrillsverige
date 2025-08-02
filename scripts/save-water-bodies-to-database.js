#!/usr/bin/env node
// Sparar ALLA svenska vattendrag direkt till Supabase-databasen
// Ingen JSON-fil som kraschar - direkt till PostgreSQL!

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ladda .env.local fil
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
config({ path: join(projectRoot, '.env.local') });

// Supabase konfiguration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

console.log(`🔗 Supabase URL: ${SUPABASE_URL.substring(0, 30)}...`);
console.log(`🔑 Service Key: ${SUPABASE_SERVICE_KEY ? 'LOADED ✅' : 'MISSING ❌'}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// OpenStreetMap Overpass API servrar
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

// HELA SVERIGE - RIKTIGA LANDSKAP OCH LÄN (inte jävla städer!)
const SWEDEN_REGIONS = [
  // GÖTALAND
  { name: 'Skåne', bbox: '55.3,12.4,56.5,14.6' },
  { name: 'Halland', bbox: '56.0,12.0,57.5,13.5' },
  { name: 'Blekinge', bbox: '56.0,14.2,56.7,15.8' },
  { name: 'Småland', bbox: '56.5,13.5,58.0,16.5' },
  { name: 'Öland', bbox: '56.1,16.3,57.4,17.1' },
  { name: 'Gotland', bbox: '56.9,18.1,57.9,19.4' },
  { name: 'Västergötland', bbox: '57.5,11.8,59.0,14.5' },
  { name: 'Östergötland', bbox: '57.8,14.5,59.0,16.8' },
  { name: 'Bohuslän', bbox: '57.9,10.8,59.0,12.5' },
  { name: 'Dalsland', bbox: '58.7,11.7,59.4,12.8' },
  
  // SVEALAND  
  { name: 'Närke', bbox: '58.8,14.5,59.5,15.8' },
  { name: 'Södermanland', bbox: '58.7,15.8,59.6,17.8' },
  { name: 'Stockholms län', bbox: '58.8,17.5,60.2,19.0' },
  { name: 'Uppsala län', bbox: '59.4,16.8,60.8,18.8' },
  { name: 'Västmanland', bbox: '59.4,15.2,60.2,17.0' },
  { name: 'Värmland', bbox: '59.0,12.0,60.9,14.5' },
  { name: 'Dalarna', bbox: '60.0,13.5,61.8,16.0' },
  
  // NORRLAND
  { name: 'Gävleborg', bbox: '60.2,15.5,62.0,17.8' },
  { name: 'Västernorrland', bbox: '62.0,15.5,63.8,19.0' },
  { name: 'Jämtland', bbox: '62.4,12.0,64.8,16.5' },
  { name: 'Västerbotten', bbox: '63.5,17.0,66.0,21.5' },
  { name: 'Norrbotten', bbox: '65.0,20.0,69.1,24.2' },
  
  // LAPPLAND (uppdelat för storlek)
  { name: 'Lappland-syd', bbox: '65.0,15.0,67.0,20.0' },
  { name: 'Lappland-nord', bbox: '67.0,18.0,69.1,24.2' }
];

function createRegionQuery(region) {
  return `
[out:json][timeout:300];
(
  // NATURLIGA VATTENDRAG
  way["natural"="water"](${region.bbox});
  relation["natural"="water"](${region.bbox});
  
  // SJÖAR - viktigaste taggarna
  way["water"="lake"](${region.bbox});
  relation["water"="lake"](${region.bbox});
  way["place"="lake"](${region.bbox});
  relation["place"="lake"](${region.bbox});
  
  // ÅRAR OCH VATTENDRAG
  way["waterway"="river"](${region.bbox});
  relation["waterway"="river"](${region.bbox});
  way["waterway"="stream"](${region.bbox});
  way["waterway"="canal"](${region.bbox});
  
  // RESERVOIRER
  way["landuse"="reservoir"](${region.bbox});
  relation["landuse"="reservoir"](${region.bbox});
  way["man_made"="reservoir_covered"](${region.bbox});
  
  // FISKVATTEN
  way["leisure"="fishing"](${region.bbox});
  relation["leisure"="fishing"](${region.bbox});
);
out geom;
`;
}

async function fetchFromOverpass(query, region) {
  for (let i = 0; i < OVERPASS_URLS.length; i++) {
    const url = OVERPASS_URLS[i];
    try {
      console.log(`🔄 Försöker server ${i + 1} för ${region.name}...`);
      
      // AbortController för 120s timeout (stor query)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Timeout efter 120s för ${region.name} på server ${i + 1}`);
        controller.abort();
      }, 120000);
      
      const response = await fetch(url, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ ${region.name}: ${data.elements.length} vattendrag`);
      return data;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`⏰ ${region.name} timeout på server ${i + 1} - försöker nästa server...`);
      } else {
        console.log(`❌ ${region.name} misslyckades på server ${i + 1}: ${error.message}`);
      }
      if (i === OVERPASS_URLS.length - 1) {
        throw error;
      }
    }
  }
}

function convertToGeoJSON(overpassData) {
  const features = [];
  
  for (const element of overpassData.elements) {
    let geometry = null;
    let water_type = 'unknown';
    let name = null;
    
    // Bestäm vattentyp från tags (UTÖKAD för alla sjötyper)
    if (element.tags) {
      // SJÖAR (prioritet 1)
      if (element.tags.water === 'lake') water_type = 'lake';
      else if (element.tags.place === 'lake') water_type = 'lake';
      else if (element.tags.natural === 'water' && element.tags.name && 
               (element.tags.name.includes('sjön') || element.tags.name.includes('Sjön'))) water_type = 'lake';
      // NATURLIGT VATTEN
      else if (element.tags.natural === 'water') water_type = 'water';
      // ÅRAR OCH BÄCKAR
      else if (element.tags.waterway === 'river') water_type = 'river';
      else if (element.tags.waterway === 'stream') water_type = 'stream';
      else if (element.tags.waterway === 'canal') water_type = 'canal';
      // RESERVOIRER
      else if (element.tags.landuse === 'reservoir') water_type = 'reservoir';
      else if (element.tags.man_made === 'reservoir_covered') water_type = 'reservoir';
      // FISKVATTEN
      else if (element.tags.leisure === 'fishing') water_type = 'fishing';
      
      name = element.tags.name || element.tags['name:sv'] || element.tags['name:en'] || null;
      
      // Extra kontroll för kända stora sjöar
      if (name && (name.includes('Vänern') || name.includes('Vättern') || 
                   name.includes('Mälaren') || name.includes('Hjälmaren') ||
                   name.includes('Storsjön') || name.includes('Siljan'))) {
        water_type = 'lake'; // Säkerställ att stora sjöar blir 'lake'
      }
    }

    // Konvertera geometri
    if (element.type === 'way' && element.geometry) {
      const coords = element.geometry.map(node => [node.lon, node.lat]);
      
      if (coords.length > 2 && coords[0][0] === coords[coords.length-1][0] && 
          coords[0][1] === coords[coords.length-1][1]) {
        geometry = { type: 'Polygon', coordinates: [coords] };
      } else {
        geometry = { type: 'LineString', coordinates: coords };
      }
    }
    
    if (element.type === 'relation' && element.members) {
      const polygons = [];
      // Förenklad hantering av relationer - ta bara first outer way
      const outerWays = element.members.filter(m => m.role === 'outer' && m.geometry);
      if (outerWays.length > 0) {
        const coords = outerWays[0].geometry.map(node => [node.lon, node.lat]);
        if (coords.length > 2) {
          polygons.push(coords);
          geometry = polygons.length === 1 ? 
            { type: 'Polygon', coordinates: polygons } :
            { type: 'MultiPolygon', coordinates: polygons.map(p => [p]) };
        }
      }
    }

    if (geometry) {
      features.push({
        osm_id: element.id,
        osm_type: element.type,
        name: name,
        water_type: water_type,
        geometry: geometry,
        tags: element.tags || {}
      });
    }
  }
  
  return features;
}

async function saveToDB(features, region) {
  console.log(`💾 Sparar ${features.length} vattendrag från ${region.name} till databas...`);
  
  const BATCH_SIZE = 1000;
  let saved = 0;
  
  for (let i = 0; i < features.length; i += BATCH_SIZE) {
    const batch = features.slice(i, i + BATCH_SIZE);
    
    // Konvertera till Supabase-format
    const dbRecords = batch.map(feature => {
      // BERÄKNA LAT/LON från geometri
      let lat = null, lon = null;
      if (feature.geometry.type === 'Point') {
        lon = feature.geometry.coordinates[0];
        lat = feature.geometry.coordinates[1];
      } else if (feature.geometry.type === 'Polygon' && feature.geometry.coordinates[0].length > 0) {
        const coords = feature.geometry.coordinates[0];
        lat = coords.reduce((sum, coord) => sum + coord[1], 0) / coords.length;
        lon = coords.reduce((sum, coord) => sum + coord[0], 0) / coords.length;
      } else if (feature.geometry.type === 'LineString' && feature.geometry.coordinates.length > 0) {
        const midIndex = Math.floor(feature.geometry.coordinates.length / 2);
        lon = feature.geometry.coordinates[midIndex][0];
        lat = feature.geometry.coordinates[midIndex][1];
      }
      
      return {
        osm_id: feature.osm_id,
        osm_type: feature.osm_type,
        name: feature.name,
        water_type: feature.water_type,
        geometry: `SRID=4326;${geometryToWKT(feature.geometry)}`,
        tags: feature.tags,
        lat: lat,
        lon: lon
      };
    });
    
          try {
        // ENKEL INSERT - lägger till nya vattendrag
        const { data, error } = await supabase
          .from('water_bodies')
          .insert(dbRecords);
        
      if (error) {
        console.error(`❌ Databas-fel för batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error);
        continue;
      }
      
      saved += batch.length;
      console.log(`✅ Sparade batch ${Math.floor(i/BATCH_SIZE) + 1} - totalt ${saved}/${features.length}`);
      
    } catch (error) {
      console.error(`❌ Kritiskt fel vid sparning:`, error);
    }
  }
  
  console.log(`🎉 ${region.name} klar: ${saved} vattendrag sparade i databas!`);
  return saved;
}

// Konvertera GeoJSON geometry till WKT för PostGIS
function geometryToWKT(geometry) {
  switch (geometry.type) {
    case 'Point':
      return `POINT(${geometry.coordinates[0]} ${geometry.coordinates[1]})`;
      
    case 'LineString':
      const lineCoords = geometry.coordinates.map(coord => `${coord[0]} ${coord[1]}`).join(',');
      return `LINESTRING(${lineCoords})`;
      
    case 'Polygon':
      const ringCoords = geometry.coordinates[0].map(coord => `${coord[0]} ${coord[1]}`).join(',');
      return `POLYGON((${ringCoords}))`;
      
    case 'MultiPolygon':
      const polygons = geometry.coordinates.map(polygon => {
        const ring = polygon[0].map(coord => `${coord[0]} ${coord[1]}`).join(',');
        return `((${ring}))`;
      }).join(',');
      return `MULTIPOLYGON(${polygons})`;
      
    default:
      return null;
  }
}

async function main() {
  console.log('🌊 Startar lagring av svenska vattendrag till databas...');
  console.log(`📊 ${SWEDEN_REGIONS.length} regioner att bearbeta (uppdelade för timeout-säkerhet)`);
  
  let totalSaved = 0;
  
  // Lämnar befintlig data - lägger bara till ny
  console.log('📋 Lägger till nya vattendrag (behåller befintliga)...');
  
  for (const region of SWEDEN_REGIONS) {
    try {
      console.log(`\n🗺️ Bearbetar: ${region.name}...`);
      
      const query = createRegionQuery(region);
      const overpassData = await fetchFromOverpass(query, region);
      
      if (overpassData.elements.length === 0) {
        console.log(`⚠️ Inga vattendrag hittades i ${region.name}`);
        continue;
      }
      
      const features = convertToGeoJSON(overpassData);
      const saved = await saveToDB(features, region);
      totalSaved += saved;
      
      console.log(`✅ ${region.name} klar! Sparade ${saved} vattendrag`);
      
      // Kort paus mellan regioner
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ ${region.name} misslyckades:`, error.message);
      continue;
    }
  }
  
  console.log(`\n🎉 KLART! Totalt sparade: ${totalSaved} vattendrag i databasen!`);
  console.log('🔧 Nu kan väder-scriptet använda databas-queries istället för JSON!');
}

// Kör scriptet
main().catch(error => {
  console.error('💥 Kritiskt fel:', error);
  process.exit(1);
}); 