#!/usr/bin/env node

// DEBUG: Vad finns faktiskt i Skåne?

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

async function debugSkaneData() {
  console.log('🔍 DEBUG: VAD FINNS I SKÅNE?\n');
  
  try {
    // 1. Totalt i Skåne-området (55.0-56.5N, 12.5-14.5E)
    const { count: totalSkane } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .gte('lat', 55.0)
      .lte('lat', 56.5)
      .gte('lon', 12.5)
      .lte('lon', 14.5);
    
    console.log(`📊 TOTALT I SKÅNE: ${totalSkane || 0} vattendrag`);
    
    if (!totalSkane || totalSkane === 0) {
      console.log('❌ INGET I SKÅNE! Problem med koordinater?');
      
      // Kolla några exempel-koordinater
      console.log('\n🔍 Kollar exempel-koordinater...');
      const { data: samples } = await supabase
        .from('water_bodies')
        .select('lat, lon, name')
        .not('lat', 'is', null)
        .not('lon', 'is', null)
        .limit(10);
      
      if (samples) {
        console.log('📍 Exempel-koordinater i databasen:');
        samples.forEach(sample => {
          console.log(`  ${sample.lat?.toFixed(4)}, ${sample.lon?.toFixed(4)} - ${sample.name || 'unnamed'}`);
        });
      }
      
      return;
    }
    
    // 2. Med namn i Skåne
    const { count: namedSkane } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .gte('lat', 55.0)
      .lte('lat', 56.5)
      .gte('lon', 12.5)
      .lte('lon', 14.5)
      .not('name', 'is', null);
    
    console.log(`🏷️ MED NAMN I SKÅNE: ${namedSkane || 0}`);
    
    // 3. Typer i Skåne
    const { data: typesSkane } = await supabase
      .from('water_bodies')
      .select('water_type')
      .gte('lat', 55.0)
      .lte('lat', 56.5)
      .gte('lon', 12.5)
      .lte('lon', 14.5)
      .limit(1000);
    
    if (typesSkane && typesSkane.length > 0) {
      const typeCounts = typesSkane.reduce((acc: any, curr) => {
        acc[curr.water_type || 'null'] = (acc[curr.water_type || 'null'] || 0) + 1;
        return acc;
      }, {});
      
      console.log('\n📊 TYPER I SKÅNE:');
      Object.entries(typeCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
    }
    
    // 4. Några exempel från Skåne
    const { data: examplesSkane } = await supabase
      .from('water_bodies')
      .select('name, water_type, lat, lon')
      .gte('lat', 55.0)
      .lte('lat', 56.5)
      .gte('lon', 12.5)
      .lte('lon', 14.5)
      .limit(20);
    
    if (examplesSkane && examplesSkane.length > 0) {
      console.log('\n🏞️ EXEMPEL FRÅN SKÅNE:');
      examplesSkane.forEach(example => {
        console.log(`  ${example.name || 'unnamed'} (${example.water_type}) - ${example.lat?.toFixed(4)}, ${example.lon?.toFixed(4)}`);
      });
    }
    
    // 5. Leta efter kända svenska städer för att verifiera koordinater
    console.log('\n🏛️ KONTROLL: Kända svenska platser?');
    const knownPlaces = ['Malmö', 'Göteborg', 'Stockholm', 'Lund', 'Helsingborg'];
    
    for (const place of knownPlaces) {
      const { data: found } = await supabase
        .from('water_bodies')
        .select('name, lat, lon')
        .ilike('name', `%${place}%`)
        .limit(3);
      
      if (found && found.length > 0) {
        console.log(`  ✅ ${place}: ${found.length} träffar`);
        found.forEach(f => console.log(`     ${f.name} - ${f.lat?.toFixed(4)}, ${f.lon?.toFixed(4)}`));
      } else {
        console.log(`  ❌ ${place}: Inga träffar`);
      }
    }
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

debugSkaneData(); 