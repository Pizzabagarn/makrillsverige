#!/usr/bin/env node

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

async function addColumns() {
  console.log('🔧 LÄGGER TILL LAT/LON KOLUMNER');
  
  try {
    // Lägg till kolumner
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE water_bodies 
        ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
      `
    });
    
    if (alterError) {
      console.error('❌ Fel vid tillägg av kolumner:', alterError);
      return;
    }
    
    console.log('✅ Kolumner tillagda');
    
    // Skapa index
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_water_bodies_coordinates 
        ON water_bodies (lat, lon) 
        WHERE lat IS NOT NULL AND lon IS NOT NULL;
      `
    });
    
    if (indexError) {
      console.error('❌ Fel vid index:', indexError);
    } else {
      console.log('✅ Index skapat');
    }
    
    // Verifiera
    const { data } = await supabase
      .from('water_bodies')
      .select('*')
      .limit(1);
      
    if (data && data[0]) {
      console.log('📋 NYA KOLUMNER:', Object.keys(data[0]));
    }
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

addColumns(); 