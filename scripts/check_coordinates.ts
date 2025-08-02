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

async function main() {
  console.log('📍 KOLLAR KOORDINATER');
  
  const { data } = await supabase
    .from('water_bodies')
    .select('lat, lon, name')
    .not('lat', 'is', null)
    .limit(5);
  
  if (data) {
    data.forEach(d => {
      console.log(`${d.lat}, ${d.lon} - ${d.name || 'unnamed'}`);
    });
  }
}

main(); 