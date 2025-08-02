#!/usr/bin/env node

// LÄGG TILL KOORDINATER till befintliga vattendrag från geometrier

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ladda .env.local fil
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function extractCoordinatesFromWKT(wktGeometry: string): { lat: number, lon: number } | null {
  try {
    // Ta bort SRID prefix
    const cleanWKT = wktGeometry.replace(/^SRID=\d+;/, '');
    
    // POINT(lon lat)
    const pointMatch = cleanWKT.match(/POINT\(([^)]+)\)/);
    if (pointMatch) {
      const [lon, lat] = pointMatch[1].split(' ').map(Number);
      return { lat, lon };
    }
    
    // POLYGON((lon lat, lon lat, ...))
    const polygonMatch = cleanWKT.match(/POLYGON\(\(([^)]+)\)\)/);
    if (polygonMatch) {
      const coords = polygonMatch[1].split(',').map(pair => {
        const [lon, lat] = pair.trim().split(' ').map(Number);
        return { lat, lon };
      });
      
      if (coords.length > 0) {
        // Beräkna centroid
        const avgLat = coords.reduce((sum, coord) => sum + coord.lat, 0) / coords.length;
        const avgLon = coords.reduce((sum, coord) => sum + coord.lon, 0) / coords.length;
        return { lat: avgLat, lon: avgLon };
      }
    }
    
    // LINESTRING(lon lat, lon lat, ...)
    const lineMatch = cleanWKT.match(/LINESTRING\(([^)]+)\)/);
    if (lineMatch) {
      const coords = lineMatch[1].split(',').map(pair => {
        const [lon, lat] = pair.trim().split(' ').map(Number);
        return { lat, lon };
      });
      
      if (coords.length > 0) {
        // Ta mittpunkten
        const midIndex = Math.floor(coords.length / 2);
        return coords[midIndex];
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function addCoordinatesToExisting() {
  console.log('🗺️ LÄGGER TILL KOORDINATER TILL BEFINTLIGA VATTENDRAG\n');
  
  try {
    // Kolla hur många som saknar koordinater
    const { count: withoutCoords } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .is('lat', null);
    
    console.log(`📊 Vattendrag utan koordinater: ${withoutCoords || 0}`);
    
    if (!withoutCoords || withoutCoords === 0) {
      console.log('✅ Alla har redan koordinater!');
      return;
    }
    
    console.log('🔄 Bearbetar i batches om 1000...\n');
    
    const BATCH_SIZE = 1000;
    let processed = 0;
    let updated = 0;
    let errors = 0;
    
    let from = 0;
    while (from < withoutCoords) {
      console.log(`📦 Batch ${Math.floor(from/BATCH_SIZE) + 1}/${Math.ceil(withoutCoords/BATCH_SIZE)}...`);
      
      // Hämta batch utan koordinater
      const { data: batch } = await supabase
        .from('water_bodies')
        .select('id, geometry')
        .is('lat', null)
        .range(from, from + BATCH_SIZE - 1);
      
      if (!batch || batch.length === 0) {
        console.log('   ✅ Inga fler att bearbeta');
        break;
      }
      
      // Bearbeta varje post
      for (const water of batch) {
        processed++;
        
        if (!water.geometry) {
          errors++;
          continue;
        }
        
        const coords = extractCoordinatesFromWKT(water.geometry);
        
        if (coords) {
          // Uppdatera med koordinater
          const { error } = await supabase
            .from('water_bodies')
            .update({ 
              lat: coords.lat, 
              lon: coords.lon 
            })
            .eq('id', water.id);
          
          if (error) {
            errors++;
            console.error(`   ❌ Fel för ID ${water.id}:`, error.message);
          } else {
            updated++;
          }
        } else {
          errors++;
        }
        
        // Progress uppdatering
        if (processed % 100 === 0) {
          console.log(`   📈 ${processed}/${withoutCoords} (${Math.round(processed/withoutCoords*100)}%) - ${updated} uppdaterade`);
        }
      }
      
      from += BATCH_SIZE;
      
      // Paus mellan batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n📊 RESULTAT:');
    console.log(`✅ Bearbetade: ${processed}`);
    console.log(`🗺️ Uppdaterade: ${updated}`);
    console.log(`❌ Fel: ${errors}`);
    console.log(`📈 Framgång: ${Math.round(updated/processed*100)}%`);
    
    // Verifiera
    const { count: stillWithoutCoords } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .is('lat', null);
    
    console.log(`\n🔍 VERIFIERING:`);
    console.log(`Fortfarande utan koordinater: ${stillWithoutCoords || 0}`);
    
    if (stillWithoutCoords === 0) {
      console.log('🎉 ALLA HAR NU KOORDINATER!');
      console.log('✅ Redo att testa viktiga sjöar igen!');
    }
    
  } catch (error) {
    console.error('❌ Kritiskt fel:', error);
  }
}

addCoordinatesToExisting(); 