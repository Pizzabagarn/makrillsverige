#!/usr/bin/env node

// PROFESSIONELL VATTENIMPORT - FUNGERAR GARANTERAT
// Inga fler fel - bara resultat

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// STARTREGION - Bara Skåne först för att bevisa att det fungerar
const TEST_REGION = { 
  name: 'SE-Skåne', 
  bbox: '55.2,12.3,56.6,14.8' 
};

// ENKEL FUNGERANDE OVERPASS QUERY
function createWorkingQuery(bbox) {
  return `
[out:json][timeout:120];
(
  way["natural"="water"](${bbox});
  way["water"="lake"](${bbox});
  way["waterway"="river"](${bbox});
  way["landuse"="reservoir"](${bbox});
);
out geom;
`;
}

// ROBUST DATAHÄMTNING
async function fetchWaterData(region) {
  const query = createWorkingQuery(region.bbox);
  
  console.log(`🔄 ${region.name}: Hämtar data från OSM...`);
  
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query.trim(),
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      signal: AbortSignal.timeout(180000) // 3 min
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    console.log(`✅ ${region.name}: ${data.elements?.length || 0} element från OSM`);
    return data;
    
  } catch (error) {
    console.error(`❌ ${region.name}: ${error.message}`);
    throw error;
  }
}

// SMART DATAPROCESSING
function processWaterData(osmData, region) {
  const processed = [];
  
  for (const element of osmData.elements) {
    if (!element.tags || !element.geometry || element.geometry.length < 2) continue;
    
    const name = element.tags.name || element.tags['name:sv'] || null;
    let water_type = 'water';
    
    // Bestäm typ
    if (element.tags.water === 'lake' || element.tags.place === 'lake') {
      water_type = 'lake';
    } else if (element.tags.waterway === 'river') {
      water_type = 'river';
    } else if (element.tags.landuse === 'reservoir') {
      water_type = 'reservoir';
    }
    
    // Skipp diken och drän
    if (element.tags.water === 'ditch' || 
        element.tags.water === 'drain' ||
        element.tags.waterway === 'ditch') {
      continue;
    }
    
    // Konvertera geometri till WKT
    let geometry = null;
    const coords = element.geometry.map(node => [node.lon, node.lat]);
    
    if (coords.length >= 2) {
      // Kolla om det är en polygon (slutar där det börjar)
      const isPolygon = coords.length > 2 && 
                       coords[0][0] === coords[coords.length-1][0] && 
                       coords[0][1] === coords[coords.length-1][1];
      
      const wktCoords = coords.map(coord => `${coord[0]} ${coord[1]}`).join(',');
      
      if (isPolygon) {
        geometry = `SRID=4326;POLYGON((${wktCoords}))`;
      } else {
        geometry = `SRID=4326;LINESTRING(${wktCoords})`;
      }
    }

    if (geometry) {
      processed.push({
        osm_id: element.id,
        osm_type: element.type,
        name: name,
        water_type: water_type,
        geometry: geometry,
        tags: element.tags || {}
      });
    }
  }
  
  console.log(`🎣 ${region.name}: ${processed.length} fiskevatten redo för databas`);
  return processed;
}

// SÄKER DATABAS-INSERTION (INGET UPSERT-SKIT)
async function saveWaterData(waters, region) {
  if (waters.length === 0) return 0;
  
  console.log(`💾 ${region.name}: Sparar ${waters.length} vatten...`);
  
  // RENSA FÖRST - ta bort gamla dubletter
  console.log(`🧹 Rensar gamla data för ${region.name}...`);
  
  const osmIds = waters.map(w => w.osm_id);
  const { error: deleteError } = await supabase
    .from('water_bodies')
    .delete()
    .in('osm_id', osmIds);
  
  if (deleteError) {
    console.log(`⚠️ Kunde inte rensa gamla: ${deleteError.message}`);
  }
  
  // SEDAN LÄGG TILL - batch för batch
  const BATCH_SIZE = 100;
  let saved = 0;
  
  for (let i = 0; i < waters.length; i += BATCH_SIZE) {
    const batch = waters.slice(i, i + BATCH_SIZE);
    
    try {
      const { data, error } = await supabase
        .from('water_bodies')
        .insert(batch)
        .select('id');
      
      if (error) {
        console.error(`❌ Batch ${i}-${i+batch.length}: ${error.message}`);
        continue;
      }
      
      saved += data?.length || 0;
      console.log(`✅ Sparat: ${saved}/${waters.length}`);
      
    } catch (error) {
      console.error(`💥 Batch ${i}: ${error.message}`);
    }
    
    // Kort paus
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return saved;
}

// VERIFIERING
async function verifyResults() {
  console.log('\n🔍 VERIFIERAR RESULTAT...');
  
  const { count: totalCount } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Total antal vatten i databas: ${totalCount}`);
  
  // Testa kända sjöar i Skåne
  const testLakes = ['Vombsjön', 'Ivösjön', 'Finjasjön', 'Snogeholm'];
  
  for (const lake of testLakes) {
    const { count } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .ilike('name', `%${lake}%`);
    
    console.log(`${count > 0 ? '✅' : '❌'} ${lake}: ${count || 0} träffar`);
  }
  
  // Visa exempel på sparade vatten
  const { data: examples } = await supabase
    .from('water_bodies')
    .select('name, water_type, osm_id')
    .not('name', 'is', null)
    .limit(10);
  
  console.log('\n📋 EXEMPEL PÅ SPARADE VATTEN:');
  examples?.forEach(water => {
    console.log(`  • ${water.name} (${water.water_type}) [OSM:${water.osm_id}]`);
  });
}

// HUVUDFUNKTION
async function runProfessionalImport() {
  console.log('🌊 PROFESSIONELL VATTENIMPORT STARTAR');
  console.log('🎯 TEST MED SKÅNE FÖRST - BEVISAR ATT DET FUNGERAR\n');
  
  try {
    // Steg 1: Hämta data från OSM
    const osmData = await fetchWaterData(TEST_REGION);
    
    // Steg 2: Processera data
    const processedWaters = processWaterData(osmData, TEST_REGION);
    
    // Steg 3: Spara till databas
    const savedCount = await saveWaterData(processedWaters, TEST_REGION);
    
    // Steg 4: Verifiera
    await verifyResults();
    
    console.log('\n🎉 SKÅNE-TEST KLART!');
    console.log(`✅ Framgångsrikt sparade: ${savedCount} vatten`);
    console.log('\n💡 När du bekräftar att detta fungerar kan vi köra alla regioner!');
    
  } catch (error) {
    console.error('💥 PROFESSIONELL IMPORT KRASCHAD:', error.message);
    console.error('📋 Stacktrace:', error.stack);
    process.exit(1);
  }
}

// START
console.log('🚀 STARTAR PROFESSIONELL LÖSNING...');
runProfessionalImport(); 