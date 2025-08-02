#!/usr/bin/env node

// DEBUG VERSION - för att hitta varför den optimerade versionen kraschar

import { promises as fs } from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Ladda .env.local fil
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
config({ path: join(projectRoot, '.env.local') });

console.log('🐛 DEBUG Yr Weather Fetcher');
console.log('==========================');

// Supabase konfiguration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log(`🔗 Supabase URL: ${SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : 'MISSING'}`);
console.log(`🔑 Service Key: ${SUPABASE_SERVICE_KEY ? 'LOADED ✅' : 'MISSING ❌'}`);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Saknar SUPABASE_URL eller SUPABASE_SERVICE_KEY i .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function debug() {
  try {
    console.log('\n🔍 STEG 1: Testa databas-anslutning...');
    
    const { count, error: testError } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
      
    if (testError) {
      console.error('❌ Databas-fel:', testError.message);
      console.error('❌ Fullständigt fel:', testError);
      return;
    } else {
      console.log(`✅ Databas OK - ${count || 0} vattendrag tillgängliga`);
    }
    
    console.log('\n🔍 STEG 2: Testa batch-funktion...');
    
    // Testa med en liten batch av punkter
    const testPoints = [
      { lat: 59.3293, lon: 18.0686 }, // Stockholm
      { lat: 57.7089, lon: 11.9746 }, // Göteborg
      { lat: 56.6704, lon: 16.3661 }  // Kalmar
    ];
    
    console.log(`🔄 Testar batch med ${testPoints.length} punkter...`);
    
    const { data, error } = await supabase
      .rpc('batch_check_points_near_water', {
        points_json: testPoints,
        radius_meters: 2500
      });
    
    if (error) {
      console.error('❌ Batch-funktion fel:', error.message);
      console.error('❌ Fullständigt fel:', error);
      return;
    }
    
    console.log('✅ Batch-funktion fungerar!');
    console.log('📊 Resultat:', data);
    
    console.log('\n🔍 STEG 3: Testa yrWeatherService import...');
    
    try {
      const { yrWeatherService } = await import('../src/lib/yrWeatherService.js');
      console.log('✅ yrWeatherService importerad!');
      
      // Testa att hämta väderdata för en punkt
      console.log('🌤️ Testar väder-hämtning för Stockholm...');
      const weatherData = await yrWeatherService.fetchPointWeather(59.3293, 18.0686);
      console.log(`✅ Väderdata hämtad: ${weatherData.length} timmar`);
      
    } catch (importError) {
      console.error('❌ Import-fel:', importError instanceof Error ? importError.message : importError);
      return;
    }
    
    console.log('\n🎉 ALLA TESTER GENOMFÖRDA FRAMGÅNGSRIKT!');
    console.log('✅ Databasen fungerar');
    console.log('✅ Batch-funktionen fungerar'); 
    console.log('✅ Yr Weather Service fungerar');
    console.log('\n🚀 Nu borde den optimerade versionen kunna köras!');
    
  } catch (error) {
    console.error('\n❌ KRITISKT FEL i debug:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'Ingen stack trace');
  }
}

debug(); 