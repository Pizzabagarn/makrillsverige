#!/usr/bin/env node

// FÖRENKLAD VERSION - Lägg till kvarvarande viktiga sjöar

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

// Kvarvarande viktiga sjöar (enklare format)
const REMAINING_LAKES = [
  { name: 'Bolmen', lat: 57.1, lon: 13.5, area_km2: 184 },
  { name: 'Åsnen', lat: 56.4, lon: 14.7, area_km2: 150 },
  { name: 'Immeln', lat: 56.3, lon: 14.2, area_km2: 26 },
  { name: 'Ivösjön', lat: 56.2, lon: 14.4, area_km2: 55 },
  { name: 'Roxen', lat: 58.4, lon: 15.6, area_km2: 105 },
  { name: 'Glafsfjorden', lat: 59.9, lon: 12.8, area_km2: 85 }
];

async function addRemainingLakes() {
  console.log('🏞️ LÄGGER TILL KVARVARANDE VIKTIGA SJÖAR (förenklad)\n');
  
  try {
    // Kontrollera och lägg till sjöar
    for (const lake of REMAINING_LAKES) {
      const { data: existing } = await supabase
        .from('water_bodies')
        .select('name, id')
        .eq('name', lake.name)
        .limit(1);
      
      if (existing && existing.length > 0) {
        console.log(`✅ ${lake.name} finns redan (ID: ${existing[0].id})`);
        continue;
      }
      
      console.log(`➕ Lägger till ${lake.name}...`);
      
      const { data, error } = await supabase
        .from('water_bodies')
        .insert({
          name: lake.name,
          water_type: 'lake',
          lat: lake.lat,
          lon: lake.lon,
          area_km2: lake.area_km2,
          osm_id: Math.floor(Math.random() * -1000000) // Slumpmässig negativ ID
        })
        .select('id, name');
      
      if (error) {
        console.error(`❌ Fel vid ${lake.name}: ${error.message}`);
      } else {
        console.log(`✅ ${lake.name} tillagd! (ID: ${data?.[0]?.id})`);
      }
    }
    
    // Slutrapport
    console.log('\n📊 SLUTRAPPORT:');
    
    const ALL_CRITICAL_LAKES = [
      'Vänern', 'Vättern', 'Mälaren', 'Hjälmaren', 
      'Storsjön', 'Siljan', 'Bolmen', 'Åsnen'
    ];
    
    let foundCount = 0;
    for (const lakeName of ALL_CRITICAL_LAKES) {
      const { data } = await supabase
        .from('water_bodies')
        .select('name, lat, lon')
        .eq('name', lakeName)
        .limit(1);
      
      if (data && data.length > 0) {
        console.log(`✅ ${lakeName}: ${data[0].lat}, ${data[0].lon}`);
        foundCount++;
      } else {
        console.log(`❌ ${lakeName}: SAKNAS FORTFARANDE`);
      }
    }
    
    console.log(`\n🎯 RESULTAT: ${foundCount}/${ALL_CRITICAL_LAKES.length} kritiska sjöar finns nu!`);
    
    // Testa vattendetektering för Mälaren
    console.log('\n🧪 TESTAR VATTENDETEKTERING för de viktigaste sjöarna...');
    
    const testLakes = [
      { name: 'Mälaren', lat: 59.4, lon: 16.8 },
      { name: 'Vänern', lat: 58.9, lon: 13.5 },
      { name: 'Vättern', lat: 58.4, lon: 14.6 }
    ];
    
    for (const testLake of testLakes) {
      const { data: waterTest } = await supabase
        .rpc('batch_check_points_near_water', {
          points_json: [{ lat: testLake.lat, lon: testLake.lon }],
          radius_meters: 2500
        });
      
      if (waterTest && waterTest[0]?.nearWater) {
        console.log(`✅ ${testLake.name} detekteras som vattennära`);
      } else {
        console.log(`❌ ${testLake.name} detekteras INTE som vattennära`);
      }
    }
    
    console.log('\n🎉 KOMPLETTERING SLUTFÖRD!');
    
  } catch (error) {
    console.error('💥 Fel:', error);
  }
}

addRemainingLakes(); 