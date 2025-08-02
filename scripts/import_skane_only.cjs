#!/usr/bin/env node

// IMPORTERA BARA SKÅNE för att se vad som händer

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// BARA SKÅNE
const SKANE_REGION = {
  name: 'Skåne',
  bbox: '55.3,12.4,56.5,14.6'
};

function createRegionQuery(region) {
  return `
[out:json][timeout:300];
(
  way["natural"="water"](${region.bbox});
  relation["natural"="water"](${region.bbox});
  way["water"="lake"](${region.bbox});
  relation["water"="lake"](${region.bbox});
  way["place"="lake"](${region.bbox});
  relation["place"="lake"](${region.bbox});
  way["waterway"="river"](${region.bbox});
  relation["waterway"="river"](${region.bbox});
  way["waterway"="stream"](${region.bbox});
  
  // SPECIFIKA SÖKNINGAR för kända sjöar
  way["name"~"Vomb",i](${region.bbox});
  relation["name"~"Vomb",i](${region.bbox});
  way["name"~"Snoge",i](${region.bbox});
  relation["name"~"Snoge",i](${region.bbox});
);
out geom;
`;
}

function convertToGeoJSON(osmData) {
  const features = [];
  
  for (const element of osmData.elements) {
    let name = null;
    let water_type = 'unknown';
    let geometry = null;
    
    // Extrahera namn
    if (element.tags) {
      name = element.tags.name || 
             element.tags['name:sv'] || 
             element.tags['name:en'] || 
             element.tags['alt_name'] || 
             null;
      
      // Bestäm vattentyp
      if (element.tags.natural === 'water' || element.tags.water === 'lake' || element.tags.place === 'lake') {
        water_type = 'lake';
      } else if (element.tags.waterway === 'river') {
        water_type = 'river';
      } else if (element.tags.waterway === 'stream') {
        water_type = 'stream';
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
      const outerWays = element.members.filter(m => m.role === 'outer' && m.geometry);
      if (outerWays.length > 0) {
        const coords = outerWays[0].geometry.map(node => [node.lon, node.lat]);
        if (coords.length > 2) {
          geometry = { type: 'Polygon', coordinates: [coords] };
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

async function importSkaneOnly() {
  console.log('🏞️ IMPORTERAR BARA SKÅNE\n');
  
  const query = createRegionQuery(SKANE_REGION);
  console.log('📝 QUERY för Skåne (55.3,12.4,56.5,14.6)');
  
  try {
    console.log(`🔄 Hämtar data för ${SKANE_REGION.name}...`);
    
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
      signal: AbortSignal.timeout(300000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const osmData = await response.json();
    console.log(`✅ ${SKANE_REGION.name}: ${osmData.elements?.length || 0} OSM elements hämtade`);
    
    if (!osmData.elements || osmData.elements.length === 0) {
      console.log(`❌ Inga elements för ${SKANE_REGION.name} - kanske inga vattendrag i området?`);
      return;
    }

    // Konvertera till features
    const features = convertToGeoJSON(osmData);
    console.log(`🗺️ Konverterade ${features.length} features`);
    
    // Visa exempel med koordinater
    console.log('\n📊 EXEMPEL-FEATURES:');
    features.slice(0, 15).forEach(f => {
      const coords = f.geometry.type === 'Polygon' ? 
        f.geometry.coordinates[0][0] : 
        f.geometry.coordinates[0];
      const lat = coords[1];
      const lon = coords[0];
      const inSkane = (lat >= 55.0 && lat <= 56.5 && lon >= 12.0 && lon <= 15.0) ? '✅' : '❌';
      console.log(`  ${f.name || 'unnamed'} (${f.water_type}) - ${lat.toFixed(4)}, ${lon.toFixed(4)} ${inSkane}`);
    });
    
    // Kolla om vi har Vomb eller Snoge
    const vombFeatures = features.filter(f => f.name && f.name.toLowerCase().includes('vomb'));
    const snogeFeatures = features.filter(f => f.name && f.name.toLowerCase().includes('snoge'));
    
    console.log(`\n🎯 SPECIFIKA SÖKNINGAR:`);
    console.log(`Vomb-relaterade: ${vombFeatures.length}`);
    console.log(`Snoge-relaterade: ${snogeFeatures.length}`);
    
    if (vombFeatures.length > 0) {
      console.log('🎉 VOMB-TRÄFFAR:');
      vombFeatures.forEach(f => {
        const coords = f.geometry.type === 'Polygon' ? 
          f.geometry.coordinates[0][0] : 
          f.geometry.coordinates[0];
        console.log(`  ${f.name} (${f.water_type}) - ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`);
      });
    }
    
    if (snogeFeatures.length > 0) {
      console.log('🎉 SNOGE-TRÄFFAR:');
      snogeFeatures.forEach(f => {
        const coords = f.geometry.type === 'Polygon' ? 
          f.geometry.coordinates[0][0] : 
          f.geometry.coordinates[0];
        console.log(`  ${f.name} (${f.water_type}) - ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`);
      });
    }

    // Räkna typer
    const typeCounts = {};
    features.forEach(f => {
      typeCounts[f.water_type] = (typeCounts[f.water_type] || 0) + 1;
    });
    
    console.log('\n📊 TYPER:');
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    
    console.log(`\n💾 ${features.length} features redo för databas`);
    
  } catch (error) {
    console.error('❌ Fel:', error.message);
  }
}

importSkaneOnly(); 