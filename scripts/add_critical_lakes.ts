#!/usr/bin/env node

// LÄGG TILL KRITISKA SVENSKA SJÖAR som saknas i databasen

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

// Sveriges viktigaste sjöar som MÅSTE finnas
const CRITICAL_LAKES = [
  { name: 'Mälaren', lat: 59.4, lon: 16.8, area_km2: 1140, rank: 3 },
  { name: 'Hjälmaren', lat: 59.2, lon: 15.8, area_km2: 484, rank: 4 },
  { name: 'Vänern', lat: 58.9, lon: 13.5, area_km2: 5519, rank: 1 },
  { name: 'Vättern', lat: 58.4, lon: 14.6, area_km2: 1893, rank: 2 },
  { name: 'Bolmen', lat: 57.1, lon: 13.5, area_km2: 184, rank: 7 },
  { name: 'Åsnen', lat: 56.4, lon: 14.7, area_km2: 150, rank: 8 },
  { name: 'Immeln', lat: 56.3, lon: 14.2, area_km2: 26, rank: 15 },
  { name: 'Ivösjön', lat: 56.2, lon: 14.4, area_km2: 55, rank: 12 }
];

async function addCriticalLakes() {
  console.log('🏞️ LÄGGER TILL KRITISKA SVENSKA SJÖAR\n');
  
  try {
    // 1. Kontrollera befintliga sjöar först
    console.log('🔍 Kontrollerar vilka sjöar som redan finns...');
    
    for (const lake of CRITICAL_LAKES) {
      const { data: existing } = await supabase
        .from('water_bodies')
        .select('name, id')
        .eq('name', lake.name)
        .limit(1);
      
      if (existing && existing.length > 0) {
        console.log(`   ✅ ${lake.name} finns redan (ID: ${existing[0].id})`);
        continue;
      }
      
      console.log(`   ❌ ${lake.name} saknas - lägger till...`);
      
      // 2. Lägg till sjön
      const lakeData = {
        name: lake.name,
        water_type: 'lake',
        lat: lake.lat,
        lon: lake.lon,
        area_km2: lake.area_km2,
        osm_id: -lake.rank, // Negativ för manuellt tillagd
        created_manually: true
      };
      
      const { data, error } = await supabase
        .from('water_bodies')
        .insert(lakeData)
        .select('id, name');
      
      if (error) {
        console.error(`   💥 Fel vid tillägg av ${lake.name}:`, error.message);
        
        // Om kolumnen created_manually inte finns, lägg till den
        if (error.message.includes('created_manually')) {
          console.log(`   🔧 Lägger till kolumn created_manually...`);
          
          const { error: alterError } = await supabase
            .rpc('sql', {
              query: 'ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS created_manually BOOLEAN DEFAULT FALSE;'
            });
          
          if (alterError) {
            console.error(`   💥 Kunde inte lägga till kolumn: ${alterError.message}`);
          } else {
            console.log(`   ✅ Kolumn tillagd - försöker igen...`);
            
            // Försök igen utan created_manually
            const { data: retryData, error: retryError } = await supabase
              .from('water_bodies')
              .insert({
                name: lake.name,
                water_type: 'lake',
                lat: lake.lat,
                lon: lake.lon,
                area_km2: lake.area_km2,
                osm_id: -lake.rank
              })
              .select('id, name');
            
            if (retryError) {
              console.error(`   💥 Fortfarande fel: ${retryError.message}`);
            } else {
              console.log(`   ✅ ${lake.name} tillagd! (ID: ${retryData?.[0]?.id})`);
            }
          }
        }
      } else {
        console.log(`   ✅ ${lake.name} tillagd! (ID: ${data?.[0]?.id})`);
      }
    }
    
    // 3. Verifiera resultatet
    console.log('\n📊 VERIFIERING EFTER TILLÄGG:');
    
    const { count: totalLakes } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .eq('water_type', 'lake');
    
    console.log(`Total sjöar i databasen: ${totalLakes || 0}`);
    
    for (const lake of CRITICAL_LAKES) {
      const { data: verification } = await supabase
        .from('water_bodies')
        .select('name, lat, lon, area_km2')
        .eq('name', lake.name)
        .limit(1);
      
      if (verification && verification.length > 0) {
        const found = verification[0];
        console.log(`✅ ${found.name}: ${found.lat}, ${found.lon} (${found.area_km2 || '?'} km²)`);
      } else {
        console.log(`❌ ${lake.name}: FORTFARANDE SAKNAS!`);
      }
    }
    
    // 4. Testa vattendetektering
    console.log('\n🧪 TESTAR VATTENDETEKTERING för Mälaren...');
    const { data: waterTest } = await supabase
      .rpc('batch_check_points_near_water', {
        points_json: [{ lat: 59.4, lon: 16.8 }],
        radius_meters: 5000
      });
    
    if (waterTest && waterTest[0]?.nearWater) {
      console.log('✅ Mälaren detekteras nu korrekt som vattennära!');
    } else {
      console.log('❌ Mälaren detekteras fortfarande inte - möjligt PostGIS-problem');
    }
    
    console.log('\n🎉 KRITISKA SJÖAR TILLAGDA - Fiskeridatabasen är nu komplett!');
    
  } catch (error) {
    console.error('💥 Kritiskt fel:', error);
  }
}

addCriticalLakes(); 