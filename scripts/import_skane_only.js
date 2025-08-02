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
  way["waterway"="canal"](${region.bbox});
  way["landuse"="reservoir"](${region.bbox});
  relation["landuse"="reservoir"](${region.bbox});
  way["man_made"="reservoir_covered"](${region.bbox});
  way["leisure"="fishing"](${region.bbox});
  relation["leisure"="fishing"](${region.bbox});
  
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
      } else if (element.tags.waterway === 'canal') {
        water_type = 'canal';
      } else if (element.tags.landuse === 'reservoir' || element.tags.man_made === 'reservoir_covered') {
        water_type = 'reservoir';
      } else if (element.tags.leisure === 'fishing') {
        water_type = 'fishing';
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

function geometryToWKT(geometry) {
  if (geometry.type === 'Point') {
    return `POINT(${geometry.coordinates[0]} ${geometry.coordinates[1]})`;
  } else if (geometry.type === 'LineString') {
    const coords = geometry.coordinates.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
    return `LINESTRING(${coords})`;
  } else if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0].map(coord => `${coord[0]} ${coord[1]}`).join(', ');
    return `POLYGON((${coords}))`;
  }
  return null;
}

async function importSkaneOnly() {
  console.log('🏞️ IMPORTERAR BARA SKÅNE\n');
  
  const query = createRegionQuery(SKANE_REGION);
  console.log('📝 QUERY:', query.substring(0, 200) + '...');
  
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
    console.log(`✅ ${SKANE_REGION.name}: ${osmData.elements?.length || 0} elements hämtade`);
    
    if (!osmData.elements || osmData.elements.length === 0) {
      console.log(`❌ Inga elements för ${SKANE_REGION.name}`);
      return;
    }

    // Konvertera till features
    const features = convertToGeoJSON(osmData);
    console.log(`🗺️ Konverterade ${features.length} features`);
    
    // Visa exempel
    console.log('\n📊 EXEMPEL-FEATURES:');
    features.slice(0, 10).forEach(f => {
      const coords = f.geometry.type === 'Polygon' ? 
        f.geometry.coordinates[0][0] : 
        f.geometry.coordinates[0];
      console.log(`  ${f.name || 'unnamed'} (${f.water_type}) - ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`);
    });
    
    // Kolla om vi har Vomb eller Snoge
    const vombFeatures = features.filter(f => f.name && f.name.toLowerCase().includes('vomb'));
    const snogeFeatures = features.filter(f => f.name && f.name.toLowerCase().includes('snoge'));
    
    console.log(`\n🎯 SPECIFIKA SÖKNINGAR:`);
    console.log(`Vomb-relaterade: ${vombFeatures.length}`);
    console.log(`Snoge-relaterade: ${snogeFeatures.length}`);
    
    if (vombFeatures.length > 0) {
      console.log('🎉 VOMB-TRÄFFAR:');
      vombFeatures.forEach(f => console.log(`  ${f.name} (${f.water_type})`));
    }
    
    if (snogeFeatures.length > 0) {
      console.log('🎉 SNOGE-TRÄFFAR:');
      snogeFeatures.forEach(f => console.log(`  ${f.name} (${f.water_type})`));
    }

    // Spara till databas om vi vill
    console.log(`\n💾 Ska vi spara ${features.length} features till databas? (kommentera ut för att aktivera)`);
    
    /*
    // Spara till databas
    const BATCH_SIZE = 1000;
    for (let i = 0; i < features.length; i += BATCH_SIZE) {
      const batch = features.slice(i, i + BATCH_SIZE);
      
      const dbRecords = batch.map(feature => {
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
      
      const { error } = await supabase
        .from('water_bodies')
        .insert(dbRecords);
        
      if (error) {
        console.error(`❌ Databas-fel för batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error);
      } else {
        console.log(`✅ Sparade batch ${Math.floor(i/BATCH_SIZE) + 1}`);
      }
    }
    */
    
  } catch (error) {
    console.error('❌ Fel:', error.message);
  }
}

importSkaneOnly(); 