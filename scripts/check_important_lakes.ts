#!/usr/bin/env node

// KOLLA VIKTIGA SJÖAR som användaren nämnde

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

// VIKTIGA SJÖAR som användaren nämnde
const IMPORTANT_LAKES = [
  'Vombsjön',
  'Snogeholm', 
  'Unkervatnet',
  'Unkerelva',
  'Vefsnan'
];

async function checkImportantLakes() {
  console.log('🔍 KOLLAR VIKTIGA SJÖAR EFTER IMPORT\n');
  
  try {
    // Totalt antal nu
    const { count: total } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 TOTALT: ${total} vattendrag i databasen\n`);
    
    // Kolla varje viktig sjö
    for (const lakeName of IMPORTANT_LAKES) {
      console.log(`🔍 Söker efter "${lakeName}"...`);
      
      // Exakt match
      const { data: exact } = await supabase
        .from('water_bodies')
        .select('id, name, water_type, lat, lon')
        .ilike('name', lakeName)
        .limit(5);
      
      // Fuzzy match (innehåller namnet)
      const { data: fuzzy } = await supabase
        .from('water_bodies')
        .select('id, name, water_type, lat, lon')
        .ilike('name', `%${lakeName}%`)
        .limit(5);
      
      if (exact && exact.length > 0) {
        console.log(`✅ FINNS (exakt): ${exact.length} träffar`);
        exact.forEach(lake => {
          console.log(`   ${lake.name} (${lake.water_type}) - ${lake.lat}, ${lake.lon}`);
        });
      } else if (fuzzy && fuzzy.length > 0) {
        console.log(`🔍 FINNS (liknande): ${fuzzy.length} träffar`);
        fuzzy.forEach(lake => {
          console.log(`   ${lake.name} (${lake.water_type}) - ${lake.lat}, ${lake.lon}`);
        });
      } else {
        console.log(`❌ SAKNAS: ${lakeName}`);
      }
      
      console.log('');
    }
    
    // Kolla duplicat-status
    console.log('📊 DUPLICAT-STATUS:');
    
    const { data: duplicatCheck } = await supabase
      .from('water_bodies')
      .select('name')
      .eq('name', 'Vättern');
    
    console.log(`Vättern: ${duplicatCheck?.length || 0} kopior`);
    
    const { data: mörtvattrenCheck } = await supabase
      .from('water_bodies')
      .select('name')
      .eq('name', 'Mörtvattern');
    
    console.log(`Mörtvattern: ${mörtvattrenCheck?.length || 0} kopior`);
    
    // Visa typ-fördelning
    console.log('\n📊 TYP-FÖRDELNING (sample):');
    const { data: types } = await supabase
      .from('water_bodies')
      .select('water_type')
      .limit(10000);
    
    if (types) {
      const typeCounts = types.reduce((acc: any, curr) => {
        acc[curr.water_type || 'null'] = (acc[curr.water_type || 'null'] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(typeCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10)
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
    }
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

checkImportantLakes(); 