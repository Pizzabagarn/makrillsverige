#!/usr/bin/env node

// KOMPLETT VATTENIMPORT - HÄMTAR BÅDE WAYS OCH RELATIONS
// FÅR ALLA STORA SJÖAR SOM VOMBSJÖN, IVÖSJÖN ETC

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// TEST MED SKÅNE - KOMPLETT QUERY
const TEST_REGION = { 
  name: 'SE-Skåne', 
  bbox: '55.2,12.3,56.6,14.8' 
};

// KOMPLETT OVERPASS QUERY - BÅDE WAYS OCH RELATIONS
function createCompleteQuery(bbox) {
  return `
[out:json][timeout:180];
(
  // WAYS - Mindre sjöar och årar
  way["natural"="water"](${bbox});
  way["water"="lake"](${bbox});
  way["waterway"="river"](${bbox});
  way["landuse"="reservoir"](${bbox});
  
  // RELATIONS - STORA SJÖAR FINNS HÄR!
  relation["natural"="water"](${bbox});
  relation["water"="lake"](${bbox});
  relation["place"="lake"](${bbox});
  relation["landuse"="reservoir"](${bbox});
);
out geom;
`;
}

// ROBUST DATAHÄMTNING
async function fetchCompleteWaterData(region) {
  const query = createCompleteQuery(region.bbox);
  
  console.log(`🔄 ${region.name}: Hämtar ALLA vatten (ways + relations)...`);
  
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query.trim(),
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      signal: AbortSignal.timeout(240000) // 4 min
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log(`✅ ${region.name}: ${data.elements?.length || 0} element (ways + relations)`);
    
    // Räkna ways vs relations
    const ways = data.elements.filter(e => e.type === 'way').length;
    const relations = data.elements.filter(e => e.type === 'relation').length;
    console.log(`   📊 ${ways} ways, ${relations} relations`);
    
    return data;
    
  } catch (error) {
    console.error(`❌ ${region.name}: ${error.message}`);
    throw error;
  }
}

// AVANCERAD DATAPROCESSING - HANTERAR BÅDE WAYS OCH RELATIONS
function processCompleteWaterData(osmData, region) {
  const processed = [];
  
  for (const element of osmData.elements) {
    if (!element.tags) continue;
    
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
    
    // HANTERA GEOMETRI - BÅDE WAYS OCH RELATIONS
    let geometry = null;
    
    if (element.type === 'way' && element.geometry && element.geometry.length >= 2) {
      // WAY GEOMETRI
      const coords = element.geometry.map(node => [node.lon, node.lat]);
      
      const isPolygon = coords.length > 2 && 
                       coords[0][0] === coords[coords.length-1][0] && 
                       coords[0][1] === coords[coords.length-1][1];
      
      const wktCoords = coords.map(coord => `${coord[0]} ${coord[1]}`).join(',');
      
      if (isPolygon) {
        geometry = `SRID=4326;POLYGON((${wktCoords}))`;
      } else {
        geometry = `SRID=4326;LINESTRING(${wktCoords})`;
      }
      
    } else if (element.type === 'relation' && element.members) {
      // RELATION GEOMETRI - HÄR ÄR DE STORA SJÖARNA!
      const outerWays = element.members.filter(m => 
        (m.role === 'outer' || m.role === '') && 
        m.geometry && 
        m.geometry.length > 2
      );
      
      if (outerWays.length > 0) {
        // Ta första outer way för geometri
        const coords = outerWays[0].geometry.map(node => [node.lon, node.lat]);
        
        if (coords.length >= 3) {
          // Se till att det är stängt
          if (coords[0][0] !== coords[coords.length-1][0] || 
              coords[0][1] !== coords[coords.length-1][1]) {
            coords.push(coords[0]); // Stäng polygonen
          }
          
          const wktCoords = coords.map(coord => `${coord[0]} ${coord[1]}`).join(',');
          geometry = `SRID=4326;POLYGON((${wktCoords}))`;
          
          console.log(`  🏞️ Relation: ${name || 'Unnamed'} (${water_type})`);
        }
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
  
  // Räkna typer
  const lakes = processed.filter(w => w.water_type === 'lake').length;
  const rivers = processed.filter(w => w.water_type === 'river').length;
  const waters = processed.filter(w => w.water_type === 'water').length;
  const reservoirs = processed.filter(w => w.water_type === 'reservoir').length;
  
  console.log(`🎣 ${region.name}: ${processed.length} vatten processade`);
  console.log(`   📊 Sjöar: ${lakes}, Årar: ${rivers}, Vatten: ${waters}, Reservoirer: ${reservoirs}`);
  
  return processed;
}

// SÄKER DATABAS-INSERTION
async function saveCompleteWaterData(waters, region) {
  if (waters.length === 0) return 0;
  
  console.log(`💾 ${region.name}: Sparar ${waters.length} vatten...`);
  
  // RENSA GAMLA - men bara för denna region/bbox
  console.log(`🧹 Rensar gamla data...`);
  
  const osmIds = waters.map(w => w.osm_id);
  if (osmIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('water_bodies')
      .delete()
      .in('osm_id', osmIds);
    
    if (deleteError) {
      console.log(`⚠️ Rensning: ${deleteError.message}`);
    }
  }
  
  // SPARA I BATCHAR
  const BATCH_SIZE = 50; // Mindre batchar för stabilitet
  let saved = 0;
  
  for (let i = 0; i < waters.length; i += BATCH_SIZE) {
    const batch = waters.slice(i, i + BATCH_SIZE);
    
    try {
      const { data, error } = await supabase
        .from('water_bodies')
        .insert(batch)
        .select('id');
      
      if (error) {
        console.error(`❌ Batch ${i}: ${error.message}`);
        continue;
      }
      
      saved += data?.length || 0;
      if (saved % 200 === 0 || saved === waters.length) {
        console.log(`✅ Sparat: ${saved}/${waters.length}`);
      }
      
    } catch (error) {
      console.error(`💥 Batch ${i}: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return saved;
}

// KOMPLETT VERIFIERING
async function verifyCompleteResults() {
  console.log('\n🔍 VERIFIERAR ALLA STORA SJÖAR...');
  
  const { count: totalCount } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Total: ${totalCount} vatten i databas`);
  
  // TESTA SKÅNES STORA SJÖAR
  const skåneLakes = [
    'Vombsjön', 'Ivösjön', 'Finjasjön', 'Snogeholm', 
    'Hammarsjön', 'Åsnen', 'Filkesjön'
  ];
  
  console.log('\n🏞️ SKÅNES STORA SJÖAR:');
  for (const lake of skåneLakes) {
    const { data } = await supabase
      .from('water_bodies')
      .select('name, water_type, osm_type')
      .ilike('name', `%${lake}%`)
      .limit(3);
    
    if (data && data.length > 0) {
      console.log(`✅ ${lake}: ${data.length} träff(ar)`);
      data.forEach(d => {
        console.log(`   • ${d.name} (${d.water_type}, ${d.osm_type})`);
      });
    } else {
      console.log(`❌ ${lake}: Inte hittad`);
    }
  }
  
  // VISA ALLA RELATIONS (STORA SJÖAR)
  const { data: relations } = await supabase
    .from('water_bodies')
    .select('name, water_type, osm_id')
    .eq('osm_type', 'relation')
    .not('name', 'is', null)
    .order('name')
    .limit(15);
  
  console.log('\n🏛️ STORA SJÖAR (RELATIONS):');
  relations?.forEach(water => {
    console.log(`  • ${water.name} (${water.water_type}) [${water.osm_id}]`);
  });
}

// HUVUDFUNKTION
async function runCompleteImport() {
  console.log('🌊 KOMPLETT VATTENIMPORT - WAYS + RELATIONS');
  console.log('🎯 NU FÅR VI VOMBSJÖN, IVÖSJÖN OCH ALLA STORA SJÖAR!\n');
  
  try {
    // Hämta ALLT från Skåne
    const osmData = await fetchCompleteWaterData(TEST_REGION);
    
    // Processera med avancerad geometri-hantering
    const processedWaters = processCompleteWaterData(osmData, TEST_REGION);
    
    // Spara säkert
    const savedCount = await saveCompleteWaterData(processedWaters, TEST_REGION);
    
    // Verifiera att vi får de stora sjöarna
    await verifyCompleteResults();
    
    console.log('\n🎉 KOMPLETT SKÅNE-IMPORT KLAR!');
    console.log(`✅ Sparade: ${savedCount} vatten`);
    console.log('\n💡 NU ska Vombsjön, Ivösjön etc finnas med!');
    
  } catch (error) {
    console.error('💥 KOMPLETT IMPORT KRASCHADE:', error.message);
    console.error('📋 Stack:', error.stack);
    process.exit(1);
  }
}

// START
console.log('🚀 STARTAR KOMPLETT LÖSNING MED RELATIONS...');
runCompleteImport(); 