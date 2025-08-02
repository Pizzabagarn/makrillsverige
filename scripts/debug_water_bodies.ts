#!/usr/bin/env node

// DEBUG SCRIPT - Kontrollerar viktiga svenska sjöar i databasen

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

// Viktiga svenska sjöar som borde finnas
const MAJOR_LAKES = [
  { name: 'Vänern', lat: 58.9, lon: 13.5 },
  { name: 'Vättern', lat: 58.4, lon: 14.6 },
  { name: 'Mälaren', lat: 59.4, lon: 17.0 },
  { name: 'Storsjön', lat: 63.2, lon: 14.6 },
  { name: 'Siljan', lat: 60.9, lon: 14.8 },
  { name: 'Bolmen', lat: 57.1, lon: 13.5 },
  { name: 'Åsnen', lat: 56.4, lon: 14.7 }
];

async function debugWaterBodies() {
  console.log('🔍 DEBUG: Undersöker vattendrag i databasen...\n');
  
  try {
    // 1. Grundläggande statistik
    console.log('📊 GRUNDLÄGGANDE STATISTIK:');
    const { count: totalCount } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    console.log(`Total vattendrag: ${totalCount || 0}`);
    
    const { count: namedCount } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .not('name', 'is', null);
    console.log(`Med namn: ${namedCount || 0}`);
    
    // 2. Typer av vattendrag
    console.log('\n🏷️ TYPER AV VATTENDRAG:');
    const { data: types } = await supabase
      .from('water_bodies')
      .select('water_type')
      .not('water_type', 'is', null);
    
    if (types) {
      const typeCounts = types.reduce((acc: any, curr) => {
        acc[curr.water_type] = (acc[curr.water_type] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(typeCounts).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }
    
    // 3. Söka efter viktiga sjöar
    console.log('\n🏞️ SÖKER EFTER VIKTIGA SJÖAR:');
    
    for (const lake of MAJOR_LAKES) {
      console.log(`\n🔍 Söker efter: ${lake.name}`);
      
      // Söka efter namn
      const { data: byName } = await supabase
        .from('water_bodies')
        .select('name, water_type')
        .ilike('name', `%${lake.name.toLowerCase()}%`)
        .limit(3);
      
      if (byName && byName.length > 0) {
        console.log(`  ✅ Hittad via namn:`);
        byName.forEach(result => {
          console.log(`    - ${result.name} (${result.water_type})`);
        });
      } else {
        console.log(`  ❌ Inte hittad via namn`);
        
        // Söka i närområdet
        console.log(`  🔍 Söker i närområdet (${lake.lat}, ${lake.lon})...`);
        const { data: nearbyWater } = await supabase
          .rpc('batch_check_points_near_water', {
            points_json: [{ lat: lake.lat, lon: lake.lon }],
            radius_meters: 5000
          });
        
        if (nearbyWater && nearbyWater[0]?.nearWater) {
          console.log(`  ⚠️ Vatten finns i närområdet men utan namn`);
        } else {
          console.log(`  ❌ Inget vatten i närområdet heller`);
        }
      }
    }
    
    // 4. Största sjöarna (med namn)
    console.log('\n🏆 STÖRSTA SJÖARNA I DATABASEN:');
    const { data: biggestLakes } = await supabase
      .from('water_bodies')
      .select('name, water_type, area_km2')
      .not('name', 'is', null)
      .not('area_km2', 'is', null)
      .order('area_km2', { ascending: false })
      .limit(10);
    
    if (biggestLakes) {
      biggestLakes.forEach((lake, index) => {
        console.log(`  ${index + 1}. ${lake.name} (${lake.area_km2} km²) - ${lake.water_type}`);
      });
    }
    
    // 5. Exempel på namngivna vattendrag
    console.log('\n📝 EXEMPEL PÅ NAMNGIVNA VATTENDRAG:');
    const { data: examples } = await supabase
      .from('water_bodies')
      .select('name, water_type')
      .not('name', 'is', null)
      .limit(20);
    
    if (examples) {
      examples.forEach(example => {
        console.log(`  - ${example.name} (${example.water_type})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Fel vid debug:', error);
  }
}

debugWaterBodies(); 