#!/usr/bin/env node

// HITTA VIKTIGA SJÖAR genom att extrahera koordinater från geometri-JSON

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function extractCoordinatesFromGeometry(geometry: any): { lat: number, lon: number } | null {
  if (!geometry || !geometry.coordinates) return null;
  
  try {
    if (geometry.type === 'Point') {
      return {
        lon: geometry.coordinates[0],
        lat: geometry.coordinates[1]
      };
    }
    
    if (geometry.type === 'LineString' && geometry.coordinates.length > 0) {
      const midIndex = Math.floor(geometry.coordinates.length / 2);
      return {
        lon: geometry.coordinates[midIndex][0],
        lat: geometry.coordinates[midIndex][1]
      };
    }
    
    if (geometry.type === 'Polygon' && geometry.coordinates[0] && geometry.coordinates[0].length > 0) {
      const coords = geometry.coordinates[0];
      const avgLat = coords.reduce((sum: number, coord: number[]) => sum + coord[1], 0) / coords.length;
      const avgLon = coords.reduce((sum: number, coord: number[]) => sum + coord[0], 0) / coords.length;
      return { lat: avgLat, lon: avgLon };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

function isInSkane(lat: number, lon: number): boolean {
  return lat >= 55.0 && lat <= 56.5 && lon >= 12.5 && lon <= 14.5;
}

async function findLakesFromGeometry() {
  console.log('🔍 SÖKER VIKTIGA SJÖAR från geometri-data\n');
  
  try {
    // 1. Sök efter Vombsjön
    console.log('🎯 Söker Vombsjön...');
    const { data: vombResults } = await supabase
      .from('water_bodies')
      .select('name, geometry, water_type')
      .ilike('name', '%vomb%')
      .limit(10);
    
    if (vombResults && vombResults.length > 0) {
      console.log(`✅ HITTAT: ${vombResults.length} träffar för Vomb:`);
      vombResults.forEach(result => {
        const coords = extractCoordinatesFromGeometry(result.geometry);
        console.log(`  ${result.name} (${result.water_type}) - ${coords?.lat.toFixed(4)}, ${coords?.lon.toFixed(4)}`);
        if (coords && isInSkane(coords.lat, coords.lon)) {
          console.log(`    ✅ I Skåne!`);
        }
      });
    } else {
      console.log('❌ Vombsjön hittades inte');
    }
    
    // 2. Sök efter Snogeholm
    console.log('\n🎯 Söker Snogeholm...');
    const { data: snogeResults } = await supabase
      .from('water_bodies')
      .select('name, geometry, water_type')
      .ilike('name', '%snoge%')
      .limit(10);
    
    if (snogeResults && snogeResults.length > 0) {
      console.log(`✅ HITTAT: ${snogeResults.length} träffar för Snoge:`);
      snogeResults.forEach(result => {
        const coords = extractCoordinatesFromGeometry(result.geometry);
        console.log(`  ${result.name} (${result.water_type}) - ${coords?.lat.toFixed(4)}, ${coords?.lon.toFixed(4)}`);
      });
    } else {
      console.log('❌ Snogeholm hittades inte');
    }
    
    // 3. Hitta ALLA sjöar i Skåne-området
    console.log('\n🏞️ Söker ALLA sjöar i Skåne-området...');
    const { data: allWaters } = await supabase
      .from('water_bodies')
      .select('name, geometry, water_type')
      .not('name', 'is', null)
      .limit(1000); // Ta många för att kolla
    
    if (allWaters) {
      const skaneWaters = allWaters
        .map(water => {
          const coords = extractCoordinatesFromGeometry(water.geometry);
          return coords && isInSkane(coords.lat, coords.lon) ? {
            ...water,
            lat: coords.lat,
            lon: coords.lon
          } : null;
        })
        .filter((water): water is NonNullable<typeof water> => water !== null)
        .slice(0, 20); // Visa bara första 20
      
      console.log(`📊 Hittade ${skaneWaters.length} vattendrag i Skåne (av ${allWaters.length} kontrollerade):`);
      skaneWaters.forEach(water => {
        console.log(`  ${water.name} (${water.water_type}) - ${water.lat.toFixed(4)}, ${water.lon.toFixed(4)}`);
      });
    }
    
    // 4. Leta specifikt efter sjöar
    console.log('\n🏔️ Söker specifikt efter SJÖAR...');
    const { data: lakes } = await supabase
      .from('water_bodies')
      .select('name, geometry, water_type')
      .eq('water_type', 'lake')
      .not('name', 'is', null)
      .limit(50);
    
    if (lakes && lakes.length > 0) {
      console.log(`🏞️ Hittade ${lakes.length} namngivna sjöar:`);
      lakes.forEach(lake => {
        const coords = extractCoordinatesFromGeometry(lake.geometry);
        const inSkane = coords && isInSkane(coords.lat, coords.lon) ? ' (SKÅNE)' : '';
        console.log(`  ${lake.name} - ${coords?.lat.toFixed(4)}, ${coords?.lon.toFixed(4)}${inSkane}`);
      });
    }
    
    console.log('\n🎉 ANALYS KLAR!');
    console.log('📍 Koordinater extraherade från geometri-JSON');
    console.log('🗺️ Redo att bygga spatial lookup för väderscript!');
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

findLakesFromGeometry(); 