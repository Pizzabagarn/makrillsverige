#!/usr/bin/env node

// BRED SÖKNING efter viktiga sjöar med olika namn-varianter

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

// VIKTIGA SJÖAR med olika namn-varianter
const LAKE_VARIANTS = {
  'Vombsjön': ['Vomb', 'Vombsjön', 'Vombs', 'Vombtjärn'],
  'Snogeholm': ['Snogeholm', 'Snogesjön', 'Snoge', 'Snogetjärn'],
  'Unkervatnet': ['Unker', 'Unkern', 'Unkervatnet', 'Unkersjön'],
  'Unkerelva': ['Unkerelva', 'Unker elv', 'Unkerbäck'],
  'Vefsnan': ['Vefsnan', 'Vefsna', 'Vefs']
};

async function broadLakeSearch() {
  console.log('🔍 BRED SÖKNING EFTER VIKTIGA SJÖAR\n');
  
  try {
    for (const [mainName, variants] of Object.entries(LAKE_VARIANTS)) {
      console.log(`🎯 Söker "${mainName}" med varianter...`);
      
      let found = false;
      
      for (const variant of variants) {
        // Sökning för denna variant
        const { data: results } = await supabase
          .from('water_bodies')
          .select('id, name, water_type, lat, lon, osm_id')
          .ilike('name', `%${variant}%`)
          .limit(10);
        
        if (results && results.length > 0) {
          console.log(`  ✅ HITTAT med "${variant}": ${results.length} träffar`);
          results.forEach(lake => {
            console.log(`     ${lake.name} (${lake.water_type}) - ${lake.lat?.toFixed(4)}, ${lake.lon?.toFixed(4)}`);
          });
          found = true;
          break; // Sluta söka när vi hittat något
        }
      }
      
      if (!found) {
        console.log(`  ❌ SAKNAS: ${mainName} (inga varianter hittade)`);
        
        // Kolla närliggande områden (för Skåne-sjöarna)
        if (mainName === 'Vombsjön' || mainName === 'Snogeholm') {
          console.log(`     🔍 Söker i Skåne-området...`);
          
          const { data: nearbySkane } = await supabase
            .from('water_bodies')
            .select('id, name, water_type, lat, lon')
            .gte('lat', 55.0)
            .lte('lat', 56.5)
            .gte('lon', 12.5)
            .lte('lon', 14.5)
            .not('name', 'is', null)
            .ilike('name', '%sjön%')
            .limit(10);
          
          if (nearbySkane && nearbySkane.length > 0) {
            console.log(`     🏞️ Andra sjöar i Skåne:`);
            nearbySkane.forEach(lake => {
              console.log(`       ${lake.name} - ${lake.lat?.toFixed(4)}, ${lake.lon?.toFixed(4)}`);
            });
          }
        }
      }
      
      console.log('');
    }
    
    // Extra kontroll: Kolla vanliga sjönamn i Skåne
    console.log('🏞️ EXTRA: Vanliga sjönamn i Skåne-området:');
    const { data: skaneNames } = await supabase
      .from('water_bodies')
      .select('name')
      .gte('lat', 55.0)
      .lte('lat', 56.5)
      .gte('lon', 12.5)
      .lte('lon', 14.5)
      .not('name', 'is', null)
      .ilike('name', '%sjön%')
      .limit(20);
    
    if (skaneNames && skaneNames.length > 0) {
      skaneNames.forEach(lake => {
        console.log(`  ${lake.name}`);
      });
    }
    
    console.log('\n📊 SAMMANFATTNING:');
    console.log('Om viktiga sjöar fortfarande saknas kan det bero på:');
    console.log('1. De har andra namn i OpenStreetMap');
    console.log('2. De ligger i Norge/Danmark (utanför vår import)');
    console.log('3. De är för små för att inkluderas i OSM');
    console.log('4. De har fel/saknade taggar i OSM');
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

broadLakeSearch(); 