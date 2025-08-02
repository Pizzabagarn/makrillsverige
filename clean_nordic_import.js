#!/usr/bin/env node

// SMART NORDISK VATTENDRAGS-DATABAS - BARA KVALITETSDATA!
// Rensar först, sedan sparar BARA namngivna vatten utan dubletter

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// FULLSTÄNDIGA NORDISKA REGIONER (samma som tidigare)
const ALL_NORDIC_REGIONS = [
  // SVERIGE
  { name: 'SE-Stockholm', bbox: '58.8,17.6,59.8,18.8', country: 'Sweden' },
  { name: 'SE-Göteborg', bbox: '57.4,11.7,57.9,12.2', country: 'Sweden' },
  { name: 'SE-Skåne-Sydväst', bbox: '55.3,12.5,55.8,13.3', country: 'Sweden' },
  { name: 'SE-Skåne-Sydöst', bbox: '55.3,13.3,55.8,14.4', country: 'Sweden' },
  { name: 'SE-Skåne-Central', bbox: '55.6,12.5,56.3,14.4', country: 'Sweden' },
  { name: 'SE-Skåne-Nord', bbox: '56.3,12.5,56.6,14.4', country: 'Sweden' },
  { name: 'SE-Uppsala', bbox: '59.7,17.4,60.0,17.8', country: 'Sweden' },
  { name: 'SE-Västergötland', bbox: '57.4,11.7,59.1,14.6', country: 'Sweden' },
  { name: 'SE-Östergötland', bbox: '57.7,14.4,59.1,16.9', country: 'Sweden' },
  { name: 'SE-Småland-Väst', bbox: '56.4,13.4,57.3,14.8', country: 'Sweden' },
  { name: 'SE-Småland-Öst', bbox: '56.8,14.7,58.1,16.6', country: 'Sweden' },
  { name: 'SE-Halland', bbox: '56.0,12.0,57.5,13.5', country: 'Sweden' },
  { name: 'SE-Blekinge', bbox: '56.0,14.1,56.8,15.9', country: 'Sweden' },
  { name: 'SE-Dalarna-Syd', bbox: '59.9,13.4,61.2,15.5', country: 'Sweden' },
  { name: 'SE-Dalarna-Nord', bbox: '61.1,13.4,61.9,16.1', country: 'Sweden' },
  { name: 'SE-Gävleborg', bbox: '60.2,15.8,61.8,17.8', country: 'Sweden' },
  { name: 'SE-Värmland', bbox: '58.8,11.9,60.9,14.2', country: 'Sweden' },
  { name: 'SE-Örebro', bbox: '58.9,14.2,59.9,15.8', country: 'Sweden' },
  { name: 'SE-Södermanland', bbox: '58.8,15.8,59.5,17.6', country: 'Sweden' },
  { name: 'SE-Jämtland-Syd', bbox: '62.3,11.9,63.8,15.0', country: 'Sweden' },
  { name: 'SE-Jämtland-Nord', bbox: '63.7,12.0,64.9,16.6', country: 'Sweden' },
  { name: 'SE-Västernorrland', bbox: '62.0,15.8,63.4,18.8', country: 'Sweden' },
  { name: 'SE-Västerbotten-Syd', bbox: '63.4,16.9,65.2,20.5', country: 'Sweden' },
  { name: 'SE-Västerbotten-Nord', bbox: '65.1,17.0,66.1,21.6', country: 'Sweden' },
  { name: 'SE-Norrbotten-Syd', bbox: '64.9,19.9,67.0,23.0', country: 'Sweden' },
  { name: 'SE-Norrbotten-Nord', bbox: '66.9,20.0,69.2,24.3', country: 'Sweden' },
  
  // SAKNADE SVENSKA LÄN - FIXAR LUCKORNA!
  { name: 'SE-Gotland', bbox: '56.9,18.1,57.9,19.4', country: 'Sweden' },
  { name: 'SE-Kronoberg', bbox: '56.2,13.4,57.2,15.0', country: 'Sweden' },
  { name: 'SE-Kalmar-Fastland', bbox: '56.0,15.0,58.0,17.0', country: 'Sweden' },
  { name: 'SE-Öland', bbox: '56.1,16.3,57.4,17.1', country: 'Sweden' },
  { name: 'SE-Jönköping', bbox: '57.2,13.4,58.0,15.0', country: 'Sweden' },
  
  // UTÖKAR STOCKHOLM LÄN (hela länet, inte bara centrum)
  { name: 'SE-Stockholm-Nord', bbox: '59.8,17.2,60.3,19.2', country: 'Sweden' },
  { name: 'SE-Stockholm-Söderort', bbox: '58.7,17.2,59.2,18.2', country: 'Sweden' },
  
  // UTÖKAR GÖTEBORG (hela Västra Götaland)
  { name: 'SE-Västra-Götaland-Nord', bbox: '57.9,11.0,58.9,12.5', country: 'Sweden' },
  { name: 'SE-Dalsland', bbox: '58.5,11.7,59.3,12.8', country: 'Sweden' },
  
  // NORGE
  { name: 'NO-Oslo-Akershus', bbox: '59.3,10.0,60.7,11.8', country: 'Norway' },
  { name: 'NO-Østfold', bbox: '59.0,10.5,59.7,12.0', country: 'Norway' },
  { name: 'NO-Hedmark-Syd', bbox: '60.0,10.5,61.5,12.9', country: 'Norway' },
  { name: 'NO-Hedmark-Nord', bbox: '61.4,10.8,62.8,12.5', country: 'Norway' },
  { name: 'NO-Oppland-Syd', bbox: '60.7,8.7,61.8,10.5', country: 'Norway' },
  { name: 'NO-Oppland-Nord', bbox: '61.7,8.0,62.6,10.2', country: 'Norway' },
  { name: 'NO-Buskerud', bbox: '59.3,8.0,61.0,10.8', country: 'Norway' },
  { name: 'NO-Vestfold', bbox: '58.8,9.8,59.8,10.6', country: 'Norway' },
  { name: 'NO-Telemark', bbox: '58.9,7.9,59.9,9.8', country: 'Norway' },
  { name: 'NO-Aust-Agder', bbox: '58.0,7.8,59.4,9.2', country: 'Norway' },
  { name: 'NO-Vest-Agder', bbox: '57.8,6.5,59.0,8.5', country: 'Norway' },
  { name: 'NO-Rogaland', bbox: '58.0,5.2,59.9,7.2', country: 'Norway' },
  { name: 'NO-Hordaland', bbox: '59.3,4.9,61.2,7.8', country: 'Norway' },
  { name: 'NO-Sogn-Fjordane', bbox: '60.5,4.6,62.2,8.2', country: 'Norway' },
  { name: 'NO-Møre-Romsdal', bbox: '61.7,5.0,63.4,9.2', country: 'Norway' },
  { name: 'NO-Trøndelag-Syd', bbox: '62.4,9.9,63.8,12.9', country: 'Norway' },
  { name: 'NO-Trøndelag-Nord', bbox: '63.7,10.9,64.9,14.2', country: 'Norway' },
  { name: 'NO-Nordland-Syd-A', bbox: '64.9,11.9,66.2,14.5', country: 'Norway' },
  { name: 'NO-Nordland-Syd-B', bbox: '66.1,13.9,67.6,16.1', country: 'Norway' },
  { name: 'NO-Nordland-Nord-A', bbox: '67.5,13.9,68.5,16.8', country: 'Norway' },
  { name: 'NO-Nordland-Nord-B', bbox: '68.4,15.5,69.6,18.6', country: 'Norway' },
  { name: 'NO-Troms', bbox: '68.4,16.2,70.3,21.2', country: 'Norway' },
  { name: 'NO-Finnmark-Vest', bbox: '70.0,20.0,71.2,26.0', country: 'Norway' },
  { name: 'NO-Finnmark-Öst', bbox: '69.8,26.0,71.2,31.0', country: 'Norway' },
  
  // DANMARK
  { name: 'DK-Sjælland', bbox: '55.1,11.0,56.1,12.7', country: 'Denmark' },
  { name: 'DK-Fyn', bbox: '55.0,9.7,55.7,10.9', country: 'Denmark' },
  { name: 'DK-Jylland-Syd', bbox: '54.8,8.0,56.0,10.0', country: 'Denmark' },
  { name: 'DK-Jylland-Vest', bbox: '55.4,7.8,57.8,9.0', country: 'Denmark' },
  { name: 'DK-Jylland-Öst', bbox: '55.8,9.0,57.8,11.2', country: 'Denmark' },
  { name: 'DK-Jylland-Nord', bbox: '56.4,8.1,57.8,10.7', country: 'Denmark' },
  { name: 'DK-Bornholm', bbox: '55.0,14.6,55.4,15.2', country: 'Denmark' }
];

// GLOBAL DUBLETT-TRACKER
const seenOsmIds = new Set();

// KONTROLLERA DATABAS-STATUS
async function checkDatabaseStatus() {
  console.log('📊 KOLLAR DATABAS-STATUS...\n');
  
  const { count: currentCount } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  console.log(`💧 Nuvarande databas: ${currentCount || 0} poster`);
  
  if (currentCount && currentCount > 0) {
    console.log('⚠️ DATABAS INTE TOM!');
    console.log('🔥 Kör först: node safe_database_cleanup.js');
    console.log('🎯 Sedan: node clean_nordic_import.js\n');
    process.exit(1);
  }
  
  console.log('✅ Databas är ren - fortsätter med smart import!\n');
  
  // Rensa vår dublett-tracker
  seenOsmIds.clear();
}

// SMART OVERPASS QUERY - BARA NAMNGIVNA VATTEN
function createSmartQuery(bbox) {
  return `
[out:json][timeout:200];
(
  // WAYS - Med namn
  way["natural"="water"]["name"](${bbox});
  way["water"="lake"]["name"](${bbox});
  way["waterway"="river"]["name"](${bbox});
  way["waterway"="stream"]["name"](${bbox});
  way["landuse"="reservoir"]["name"](${bbox});
  
  // RELATIONS - Med namn (stora sjöar)
  relation["natural"="water"]["name"](${bbox});
  relation["water"="lake"]["name"](${bbox});
  relation["place"="lake"]["name"](${bbox});
  relation["landuse"="reservoir"]["name"](${bbox});
);
out geom;
`;
}

// SMART DATA PROCESSING - BARA KVALITETSDATA
function processSmartWaterData(osmData, region) {
  const qualityWaters = [];
  
  for (const element of osmData.elements) {
    if (!element.tags) continue;
    
    // Relations kan ha members istället för geometry
    if (!element.geometry && !element.members) continue;
    

    
    // KRAV 1: MÅSTE HA NAMN
    const name = element.tags.name || 
                 element.tags['name:sv'] || 
                 element.tags['name:no'] || 
                 element.tags['name:da'];
    
    if (!name || name.trim() === '' || name === 'null') {
      continue; // Hoppa över namnlösa
    }
    
    // KRAV 2: INTE DUBLETT
    const osmKey = `${element.id}-${element.type}`;
    if (seenOsmIds.has(osmKey)) {
      console.log(`   🔄 Dublett hoppas över: ${name} (${osmKey})`);
      continue;
    }
    
    // KRAV 3: INTE DIKE/AVLOPP/SMÅ DAMMAR (både taggar och namn)
    const lowername = name.toLowerCase();
    if (element.tags.water === 'ditch' || 
        element.tags.water === 'drain' ||
        element.tags.waterway === 'ditch' ||
        element.tags.waterway === 'drain' ||
        lowername.includes('dike') ||
        lowername.includes('ditch') ||
        lowername.includes('drain') ||
        lowername.includes('avlopp') ||
        // Filtrerar bort småputtiga dammar (men inte kända fiskevatten)
        (lowername.includes('damm') && 
         !lowername.includes('rögledamm') &&
         !lowername.includes('fiskdamm') &&
         !lowername.includes('kvarndam') &&
         !lowername.includes('sågdam') &&
         !lowername.includes('kraftdam') &&
         !lowername.includes('industridam'))) {
      continue;
    }
    
    // Smart typbestämning
    let water_type = 'water';
    if (element.tags.water === 'lake' || element.tags.place === 'lake') {
      water_type = 'lake';
    } else if (element.tags.waterway === 'river') {
      water_type = 'river';
    } else if (element.tags.waterway === 'stream') {
      water_type = 'stream';
    } else if (element.tags.landuse === 'reservoir') {
      water_type = 'reservoir';
    }
    
    // Hantera geometri (samma som tidigare)
    let geometry = null;
    
    if (element.type === 'way' && element.geometry.length >= 2) {
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
      const outerWays = element.members.filter(m => 
        (m.role === 'outer' || m.role === '') && 
        m.geometry && 
        m.geometry.length > 2
      );
      
      if (outerWays.length > 0) {
        const coords = outerWays[0].geometry.map(node => [node.lon, node.lat]);
        if (coords.length >= 3) {
          if (coords[0][0] !== coords[coords.length-1][0] || 
              coords[0][1] !== coords[coords.length-1][1]) {
            coords.push(coords[0]);
          }
          const wktCoords = coords.map(coord => `${coord[0]} ${coord[1]}`).join(',');
          geometry = `SRID=4326;POLYGON((${wktCoords}))`;
        }
      }
    }

    // ENDAST SPARA OM ALLT ÄR OK
    if (geometry && element.id && element.type && water_type && name) {
      // Markera som sedd
      seenOsmIds.add(osmKey);
      
      qualityWaters.push({
        osm_id: element.id,
        osm_type: element.type,
        name: name.trim(),
        water_type: water_type,
        geometry: geometry,
        tags: element.tags || {}
      });
      
      console.log(`  ✅ "${name}" (${water_type}, ${element.type})`);
    }
  }
  
  return qualityWaters;
}

// SÄKER SPARNING UTAN DUBLETTER
async function saveSmartWaterData(waters, region) {
  if (waters.length === 0) return 0;
  
  console.log(`💾 ${region.name}: Sparar ${waters.length} kvalitetsvatten...`);
  
  const BATCH_SIZE = 50; // Mindre batchar för säkerhet
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
      
    } catch (error) {
      console.error(`💥 Batch ${i}: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return saved;
}

// ROBUST DATA FETCH
async function fetchSmartWaterData(region) {
  const query = createSmartQuery(region.bbox);
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 ${region.name}: Försök ${attempt}/${maxRetries}...`);
      
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query.trim(),
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        signal: AbortSignal.timeout(300000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ ${region.name}: ${data.elements?.length || 0} namngivna element`);
      
      return data;
      
    } catch (error) {
      console.error(`❌ ${region.name} försök ${attempt}: ${error.message}`);
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// HUVUDFUNKTION
async function runSmartNordicImport() {
  console.log('🎯 SMART NORDISK VATTENDRAGS-DATABAS');
  console.log('✨ Bara namngivna vatten, inga dubletter från början!\n');
  
  // Steg 1: Kontrollera databas
  await checkDatabaseStatus();
  
  // Steg 2: Smart import
  console.log(`🚀 STARTAR SMART IMPORT AV ${ALL_NORDIC_REGIONS.length} REGIONER\n`);
  
  let totalSaved = 0;
  let successful = 0;
  const results = [];
  
  for (const region of ALL_NORDIC_REGIONS) {
    try {
      console.log(`\n🗺️ ${region.name} (${region.country})`);
      
      const osmData = await fetchSmartWaterData(region);
      const qualityWaters = processSmartWaterData(osmData, region);
      const saved = await saveSmartWaterData(qualityWaters, region);
      
      totalSaved += saved;
      successful++;
      results.push({ region: region.name, country: region.country, saved });
      
      console.log(`✅ ${region.name}: ${saved} kvalitetsvatten sparade`);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`❌ ${region.name} MISSLYCKADES: ${error.message}`);
      results.push({ region: region.name, country: region.country, saved: 0, error: error.message });
    }
  }
  
  // SLUTRAPPORT
  console.log('\n🎉 SMART NORDISK IMPORT KLAR!');
  console.log(`✅ Framgångsrika regioner: ${successful}/${ALL_NORDIC_REGIONS.length}`);
  console.log(`💎 Kvalitetsvatten sparade: ${totalSaved}`);
  console.log(`🎯 100% namngivna, 0% dubletter!`);
  
  // Visa per land
  const byCountry = results.reduce((acc, r) => {
    acc[r.country] = (acc[r.country] || 0) + r.saved;
    return acc;
  }, {});
  
  console.log('\n📊 PER LAND:');
  Object.entries(byCountry).forEach(([country, count]) => {
    console.log(`   ${country}: ${count} vatten`);
  });
  
  console.log('\n🏆 PERFEKT KVALITETSDATABAS KLAR FÖR VÄDERDATA! 🌦️');
}

// START
runSmartNordicImport().catch(error => {
  console.error('💥 Smart import kraschade:', error);
  process.exit(1);
}); 