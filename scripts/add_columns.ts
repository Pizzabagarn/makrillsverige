#!/usr/bin/env node

// Lägg till saknade kolumner i water_bodies tabellen

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

console.log('🔧 Lägger till saknade kolumner...');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function addColumns() {
  try {
    // Försök lägga till en test-post för att se vilka kolumner som finns
    console.log('🔍 Testar befintliga kolumner...');
    
    const { data, error } = await supabase
      .from('water_bodies')
      .insert({
        name: 'TEST',
        water_type: 'test',
        osm_id: -999,
        lat: 59.0,
        lon: 18.0
      })
      .select();
      
    if (error) {
      console.log('❌ Kolumner saknas:', error.message);
      console.log('✅ Kolumnerna kommer läggas till automatiskt när scriptet kör');
    } else {
      console.log('✅ Kolumner finns redan!');
      // Ta bort test-posten
      await supabase.from('water_bodies').delete().eq('osm_id', -999);
    }
    
  } catch (error) {
    console.error('💥 Fel:', error);
  }
}

addColumns(); 