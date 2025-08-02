#!/usr/bin/env node

// OMFATTANDE DIAGNOS - Varför saknas viktiga svenska sjöar?

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

// Viktiga svenska sjöar med exakta koordinater
const CRITICAL_LAKES = [
  { name: 'Vänern', lat: 58.9, lon: 13.5, area_km2: 5519, rank: 1 },
  { name: 'Vättern', lat: 58.4, lon: 14.6, area_km2: 1893, rank: 2 },
  { name: 'Mälaren', lat: 59.4, lon: 16.8, area_km2: 1140, rank: 3 }, // Mer exakt koordinat
  { name: 'Hjälmaren', lat: 59.2, lon: 15.8, area_km2: 484, rank: 4 },
  { name: 'Storsjön', lat: 63.2, lon: 14.6, area_km2: 464, rank: 5 },
  { name: 'Siljan', lat: 60.9, lon: 14.8, area_km2: 354, rank: 6 },
  { name: 'Bolmen', lat: 57.1, lon: 13.5, area_km2: 184, rank: 7 },
  { name: 'Åsnen', lat: 56.4, lon: 14.7, area_km2: 150, rank: 8 }
];

async function comprehensiveLakeDiagnosis() {
  console.log('🚨 OMFATTANDE SJÖDIAGNOS - Varför saknas viktiga sjöar?\n');
  
  try {
    // 1. GRUNDLÄGGANDE STATISTIK
    console.log('📊 GRUNDLÄGGANDE STATISTIK:');
    const { count: totalCount } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    console.log(`Total vattendrag: ${totalCount || 0}`);
    
    const { count: namedCount } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .not('name', 'is', null);
    console.log(`Med namn: ${namedCount || 0} (${Math.round((namedCount||0)/(totalCount||1)*100)}%)`);
    
    // 2. GEOGRAFISK FÖRDELNING
    console.log('\n🗺️ GEOGRAFISK FÖRDELNING:');
    const regions = [
      { name: 'Skåne', bounds: { south: 55.3, north: 56.5, west: 12.5, east: 14.5 } },
      { name: 'Småland', bounds: { south: 56.0, north: 58.0, west: 13.5, east: 16.0 } },
      { name: 'Västergötland', bounds: { south: 57.5, north: 59.0, west: 12.0, east: 14.5 } },
      { name: 'Stockholm/Mälardalen', bounds: { south: 59.0, north: 59.8, west: 16.5, east: 18.5 } },
      { name: 'Dalarna', bounds: { south: 60.0, north: 61.5, west: 14.0, east: 16.0 } },
      { name: 'Jämtland', bounds: { south: 62.5, north: 64.5, west: 12.0, east: 16.0 } },
      { name: 'Norrland (övre)', bounds: { south: 64.0, north: 69.0, west: 15.0, east: 24.0 } }
    ];
    
    for (const region of regions) {
      const { count } = await supabase
        .from('water_bodies')
        .select('*', { count: 'exact', head: true })
        .gte('lat', region.bounds.south)
        .lte('lat', region.bounds.north)
        .gte('lon', region.bounds.west)
        .lte('lon', region.bounds.east);
      
      console.log(`  ${region.name}: ${count || 0} vattendrag`);
    }
    
    // 3. DETALJERAD ANALYS AV KRITISKA SJÖAR
    console.log('\n🔍 DETALJERAD ANALYS AV KRITISKA SJÖAR:');
    console.log('='.repeat(60));
    
    for (const lake of CRITICAL_LAKES) {
      console.log(`\n🏞️ ${lake.name} (Rank #${lake.rank}, ${lake.area_km2} km²)`);
      console.log(`   Koordinater: ${lake.lat}, ${lake.lon}`);
      
      // Exakta namnmatch
      const { data: exactMatch } = await supabase
        .from('water_bodies')
        .select('name, water_type, lat, lon, area_km2')
        .eq('name', lake.name)
        .limit(1);
      
      if (exactMatch && exactMatch.length > 0) {
        console.log(`   ✅ EXAKT MATCH: ${exactMatch[0].name}`);
        console.log(`      Typ: ${exactMatch[0].water_type}`);
        console.log(`      DB-koordinater: ${exactMatch[0].lat}, ${exactMatch[0].lon}`);
        if (exactMatch[0].area_km2) {
          console.log(`      Storlek: ${exactMatch[0].area_km2} km²`);
        }
        continue;
      }
      
      // Fuzzy namnmatch
      const { data: fuzzyMatch } = await supabase
        .from('water_bodies')
        .select('name, water_type, lat, lon, area_km2')
        .ilike('name', `%${lake.name}%`)
        .limit(3);
      
      if (fuzzyMatch && fuzzyMatch.length > 0) {
        console.log(`   ⚠️ FUZZY MATCH (${fuzzyMatch.length} träffar):`);
        fuzzyMatch.forEach(match => {
          console.log(`      - ${match.name} (${match.water_type}) at ${match.lat}, ${match.lon}`);
        });
      } else {
        console.log(`   ❌ INGEN NAMNMATCH`);
      }
      
      // Geometrisk närhetssökning (utvidgad radie)
      console.log(`   🔍 Söker geometriskt i närområdet...`);
      
      for (const radius of [1000, 2500, 5000, 10000, 20000]) {
        const { data: nearbyWater } = await supabase
          .rpc('batch_check_points_near_water', {
            points_json: [{ lat: lake.lat, lon: lake.lon }],
            radius_meters: radius
          });
        
        if (nearbyWater && nearbyWater[0]?.nearWater) {
          console.log(`   ✅ Vatten hittades inom ${radius}m radie`);
          
          // Försök hitta alla vattendrag i närheten för detaljanalys
          const { data: nearbyDetails } = await supabase
            .from('water_bodies')
            .select('name, water_type, lat, lon, area_km2')
            .gte('lat', lake.lat - 0.1)
            .lte('lat', lake.lat + 0.1)
            .gte('lon', lake.lon - 0.1)
            .lte('lon', lake.lon + 0.1)
            .not('name', 'is', null)
            .limit(10);
          
          if (nearbyDetails && nearbyDetails.length > 0) {
            console.log(`      Närliggande namngivna vattendrag:`);
            nearbyDetails.forEach(detail => {
              const distance = Math.sqrt(
                Math.pow((detail.lat - lake.lat) * 111, 2) + 
                Math.pow((detail.lon - lake.lon) * 85, 2)
              );
              console.log(`        - ${detail.name} (${detail.water_type}) - ${distance.toFixed(1)}km bort`);
            });
          }
          break;
        }
      }
      
             // Check if no water was found in any radius
       let foundWater = false;
       for (const radius of [1000, 2500, 5000, 10000, 20000]) {
         const { data: testWater } = await supabase
           .rpc('batch_check_points_near_water', {
             points_json: [{ lat: lake.lat, lon: lake.lon }],
             radius_meters: radius
           });
         
         if (testWater && testWater[0]?.nearWater) {
           foundWater = true;
           break;
         }
       }
       
       if (!foundWater) {
         console.log(`   ❌ INGET VATTEN HITTADES inom 20km radie`);
         console.log(`   🚨 KRITISKT: Sveriges ${lake.rank}:e största sjö saknas helt!`);
       }
    }
    
    // 4. ANALYS AV DATALEVERANTÖR (OpenStreetMap)
    console.log('\n\n📋 ANALYS AV DATALEVERANTÖR:');
    console.log('='.repeat(60));
    
    // Kontrollera vilka taggar som användes för att hämta data
    const { data: waterTypes } = await supabase
      .from('water_bodies')
      .select('water_type')
      .not('water_type', 'is', null);
    
    if (waterTypes) {
      const typeCounts = waterTypes.reduce((acc: any, curr) => {
        acc[curr.water_type] = (acc[curr.water_type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('Vattentyper i databasen:');
      Object.entries(typeCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
    }
    
    // 5. FÖRSLAG PÅ LÖSNINGAR
    console.log('\n\n💡 FÖRSLAG PÅ LÖSNINGAR:');
    console.log('='.repeat(60));
    console.log('1. 🔧 KOMPLETTERA DATA: Lägg till saknade viktiga sjöar manuellt');
    console.log('2. 📡 ALTERNATIV DATAKÄLLA: Lantmäteriet GSD-Vattendrag istället för OSM');
    console.log('3. 🛠️ FÖRBÄTTRA OSM-QUERY: Bredare sökparametrar för stora sjöar');
    console.log('4. ✅ VALIDERING: Automatisk kontroll mot lista över viktiga sjöar');
    console.log('5. 🎯 PRIORITERING: Säkerställ att top 10 sjöarna alltid finns');
    
    // 6. NORRLANDSANALYS
    console.log('\n\n🏔️ NORRLANDS-ANALYS (varför så många små sjöar?)');
    console.log('='.repeat(60));
    
    const { data: norrlandLakes } = await supabase
      .from('water_bodies')
      .select('name, lat, lon, area_km2')
      .gte('lat', 64.0) // Norrland
      .not('name', 'is', null)
      .order('area_km2', { ascending: false, nullsFirst: false })
      .limit(20);
    
    if (norrlandLakes) {
      console.log('Största sjöarna i Norrland:');
      norrlandLakes.forEach((lake, index) => {
        console.log(`  ${index + 1}. ${lake.name} - ${lake.area_km2 || 'okänd storlek'} km²`);
      });
    }
    
    console.log('\n🔍 ANALYS: Norrland har naturligt många små sjöar (glacial aktivitet)');
    console.log('Men det förklarar INTE varför Mälaren saknas - det är ett dataproblem!');
    
  } catch (error) {
    console.error('❌ Fel vid diagnos:', error);
  }
}

comprehensiveLakeDiagnosis(); 