#!/usr/bin/env node

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

async function checkDatabase() {
  console.log('📊 KONTROLLERAR DATABAS...\n');
  
  try {
    // Total antal
    const { count: total } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📍 Totalt vattendrag: ${total || 0}`);
    
    // Med namn
    const { count: withNames } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .not('name', 'is', null);
    
    console.log(`🏷️ Med namn: ${withNames || 0} (${Math.round((withNames||0)/(total||1)*100)}%)`);
    
    // Typer
    const { data: types } = await supabase
      .from('water_bodies')
      .select('water_type')
      .not('water_type', 'is', null)
      .limit(1000);
    
    if (types) {
      const typeCounts = types.reduce((acc: any, curr) => {
        acc[curr.water_type] = (acc[curr.water_type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('\n🏷️ Typer (sample):');
      Object.entries(typeCounts).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }
    
    // Test insert för att se om write fungerar
    console.log('\n🧪 Testar write-access...');
    const { error } = await supabase
      .from('water_bodies')
      .insert({
        name: 'TEST_DELETE_ME',
        water_type: 'test',
        osm_id: -999999
      });
    
    if (error) {
      console.log('❌ Write blockerat:', error.message);
      console.log('💡 Supabase kvot överskriden - måste rensa eller uppgradera!');
    } else {
      console.log('✅ Write fungerar - tar bort test...');
      await supabase.from('water_bodies').delete().eq('osm_id', -999999);
    }
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

checkDatabase(); 