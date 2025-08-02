#!/usr/bin/env node

// FIXA DUPLICAT OCH LÄGG TILL VIKTIGA SAKNADE SJÖAR

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

// VIKTIGA SJÖAR SOM SAKNAS (manuell backup)
const MISSING_IMPORTANT_LAKES = [
  {
    name: 'Vombsjön',
    lat: 55.6667,
    lon: 13.5333,
    water_type: 'lake',
    osm_id: 999999001 // Fake OSM ID för manuella
  },
  {
    name: 'Snogeholm',
    lat: 55.7833,
    lon: 13.4167,
    water_type: 'lake', 
    osm_id: 999999002
  },
  {
    name: 'Unkervatnet',
    lat: 65.0833,
    lon: 12.4167,
    water_type: 'lake',
    osm_id: 999999003
  },
  {
    name: 'Unkerelva',
    lat: 65.1000,
    lon: 12.4000,
    water_type: 'river',
    osm_id: 999999004
  },
  {
    name: 'Vefsnan',
    lat: 65.8333,
    lon: 13.0833,
    water_type: 'river',
    osm_id: 999999005
  }
];

async function fixDuplicatesAndMissingLakes() {
  console.log('🔧 FIXAR DUPLICAT OCH SAKNADE SJÖAR\n');
  
  try {
    // 1. Kontrollera nuvarande tillstånd
    const { count: totalBefore } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 FÖRE: ${totalBefore} vattendrag totalt`);
    
    // 2. Hitta och visa duplicat
    console.log('\n🔍 LETAR EFTER DUPLICAT...');
    
    // Använd SQL för att hitta duplicat
    const { data: duplicates } = await supabase.rpc('find_duplicates', {
      min_count: 5
    });
    
    if (duplicates && duplicates.length > 0) {
      console.log('\n🔄 VÄRSTA DUPLICATEN:');
      duplicates.forEach((dup: any) => {
        console.log(`  ${dup.name}: ${dup.count} kopior`);
      });
    }
    
    // 3. Ta bort duplicat (behåll bara 1 per namn)
    console.log('\n🗑️ TAR BORT DUPLICAT...');
    let totalRemoved = 0;
    
    if (duplicates && duplicates.length > 0) {
      for (const duplicate of duplicates) {
        const lakeName = duplicate.name;
        console.log(`\n🔄 Fixar ${lakeName} (${duplicate.count} kopior)...`);
        
        // Hämta alla kopior
        const { data: allCopies } = await supabase
          .from('water_bodies')
          .select('id, osm_id, lat, lon')
          .eq('name', lakeName)
          .order('id');
        
        if (allCopies && allCopies.length > 1) {
          // Behåll bara den första (bästa koordinater om möjligt)
          const toKeep = allCopies[0];
          const toDelete = allCopies.slice(1);
          
          console.log(`   ✅ Behåller ID ${toKeep.id}`);
          console.log(`   ❌ Tar bort ${toDelete.length} kopior...`);
          
          // Ta bort kopior
          const idsToDelete = toDelete.map(copy => copy.id);
          const { count: deleted } = await supabase
            .from('water_bodies')
            .delete({ count: 'exact' })
            .in('id', idsToDelete);
          
          totalRemoved += (deleted || 0);
          console.log(`   ✅ Borttaget: ${deleted} kopior av ${lakeName}`);
        }
      }
    }
    
    // 4. Kontrollera om viktiga sjöar saknas
    console.log('\n🔍 KOLLAR VIKTIGA SJÖAR...');
    
    for (const importantLake of MISSING_IMPORTANT_LAKES) {
      const { data: existing } = await supabase
        .from('water_bodies')
        .select('id, name')
        .ilike('name', `%${importantLake.name}%`)
        .limit(1);
      
      if (!existing || existing.length === 0) {
        console.log(`❌ SAKNAS: ${importantLake.name}`);
        
        // Lägg till manuellt
        const { error } = await supabase
          .from('water_bodies')
          .insert({
            name: importantLake.name,
            water_type: importantLake.water_type,
            lat: importantLake.lat,
            lon: importantLake.lon,
            osm_id: importantLake.osm_id,
            osm_type: 'manual',
            created_manually: true
          });
        
        if (error) {
          console.log(`   ❌ Fel vid tillägg: ${error.message}`);
        } else {
          console.log(`   ✅ Lagt till: ${importantLake.name}`);
        }
      } else {
        console.log(`✅ FINNS: ${importantLake.name}`);
      }
    }
    
    // 5. Kontrollera resultat
    const { count: totalAfter } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    const { count: namedAfter } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .not('name', 'is', null);
    
    console.log('\n📊 RESULTAT:');
    console.log(`FÖRE: ${totalBefore} vattendrag`);
    console.log(`EFTER: ${totalAfter} vattendrag`);
    console.log(`BORTTAGET: ${totalRemoved} duplicat`);
    console.log(`MED NAMN: ${namedAfter} (${Math.round((namedAfter || 0)/(totalAfter || 1)*100)}%)`);
    console.log(`DISK SPARAD: ~${Math.round((totalRemoved * 100) / 1024 / 1024)} MB`);
    
    console.log('\n🎉 CLEANUP KLAR!');
    console.log('✅ Duplicat borttagna');
    console.log('✅ Viktiga sjöar kontrollerade');
    console.log('💾 Disk-utrymme frigjort');
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

fixDuplicatesAndMissingLakes(); 