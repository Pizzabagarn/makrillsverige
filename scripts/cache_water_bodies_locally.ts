#!/usr/bin/env node

// CACHA ALLA VATTENDRAG LOKALT
// Så väderscriptet kan köra utan Supabase-frågor

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { gzip } from 'zlib';

const gzipAsync = promisify(gzip);

// Ladda .env.local fil
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function cacheWaterBodiesLocally() {
  console.log('💾 CACHAR VATTENDRAG LOKALT FÖR SNABBARE VÄDER-SCRIPT\n');
  
  try {
    console.log('📥 Hämtar alla vattendrag från Supabase...');
    
    let allWaterBodies = [];
    let from = 0;
    const batchSize = 10000;
    
    while (true) {
      console.log(`   📦 Hämtar batch ${Math.floor(from/batchSize) + 1}... (från ${from})`);
      
      const { data, error } = await supabase
        .from('water_bodies')
        .select('id, name, water_type, lat, lon, osm_id')
        .range(from, from + batchSize - 1)
        .order('id');
      
      if (error) {
        console.error('❌ Fel:', error);
        break;
      }
      
      if (!data || data.length === 0) {
        console.log('   ✅ Alla batches hämtade!');
        break;
      }
      
      allWaterBodies.push(...data);
      from += batchSize;
      
      if (data.length < batchSize) {
        console.log('   ✅ Sista batch hämtad!');
        break;
      }
    }
    
    console.log(`\n📊 HÄMTAT: ${allWaterBodies.length} vattendrag`);
    
    // Skapa spatial index för snabb lookup
    console.log('🗺️ Skapar spatial grid för snabb lookup...');
    
    const spatialGrid = createSpatialGrid(allWaterBodies);
    
    const cacheData = {
      version: '1.0',
      created: new Date().toISOString(),
      total_water_bodies: allWaterBodies.length,
      spatial_grid: spatialGrid,
      metadata: {
        grid_size: 0.1, // grader (ca 10km)
        radius_km: 2,
        description: 'Spatial cache för svenska vattendrag'
      }
    };
    
    // Spara som JSON
    const jsonPath = join(projectRoot, 'public/data/water_bodies_cache.json');
    console.log('💾 Sparar JSON cache...');
    fs.writeFileSync(jsonPath, JSON.stringify(cacheData, null, 2));
    
    // Spara som komprimerad JSON.GZ för produktion
    const gzipPath = join(projectRoot, 'public/data/water_bodies_cache.json.gz');
    console.log('🗜️ Sparar komprimerad cache...');
    const compressed = await gzipAsync(JSON.stringify(cacheData));
    fs.writeFileSync(gzipPath, compressed);
    
    console.log('\n📊 CACHE SKAPAD:');
    console.log(`📄 JSON: ${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`🗜️ GZIP: ${(fs.statSync(gzipPath).size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`🗺️ Grid-celler: ${Object.keys(spatialGrid).length}`);
    
    console.log('\n🚀 NU KAN VÄDERSCRIPTET ANVÄNDA LOKAL CACHE!');
    console.log('✅ Inga fler Supabase-frågor behövs för vattendragskontroll');
    console.log('⚡ Mycket snabbare execution');
    console.log('💰 Minimal Supabase-användning');
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

function createSpatialGrid(waterBodies: any[]) {
  const gridSize = 0.1; // grader (ca 10km vid Sveriges breddgrad)
  const grid: { [key: string]: any[] } = {};
  
  let processed = 0;
  
  for (const water of waterBodies) {
    if (!water.lat || !water.lon) continue;
    
    // Räkna ut grid-cell
    const gridLat = Math.floor(water.lat / gridSize) * gridSize;
    const gridLon = Math.floor(water.lon / gridSize) * gridSize;
    const gridKey = `${gridLat},${gridLon}`;
    
    if (!grid[gridKey]) {
      grid[gridKey] = [];
    }
    
    grid[gridKey].push({
      id: water.id,
      name: water.name,
      type: water.water_type,
      lat: water.lat,
      lon: water.lon,
      osm_id: water.osm_id
    });
    
    processed++;
    if (processed % 50000 === 0) {
      console.log(`   📍 Bearbetat ${processed}/${waterBodies.length} vattendrag...`);
    }
  }
  
  return grid;
}

cacheWaterBodiesLocally(); 