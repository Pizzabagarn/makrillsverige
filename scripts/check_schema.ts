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

async function checkSchema() {
  console.log('📋 KOLLAR SCHEMA');
  
  const { data } = await supabase
    .from('water_bodies')
    .select('*')
    .limit(1);
  
  if (data && data[0]) {
    console.log('KOLUMNER:', Object.keys(data[0]));
    console.log('EXEMPEL:', data[0]);
  } else {
    console.log('Ingen data');
  }
}

checkSchema(); 