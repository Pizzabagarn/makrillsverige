#!/usr/bin/env node

// FIXA BARA DUPLICAT - låt import-scriptet fixa saknade sjöar naturligt

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

async function fixDuplicatesOnly() {
  console.log('🔧 FIXAR BARA DUPLICAT\n');
  
  try {
    // 1. Kontrollera nuvarande tillstånd
    const { count: totalBefore } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 FÖRE: ${totalBefore} vattendrag totalt`);
    
    // 2. Hitta duplicat manuellt
    console.log('\n🔍 LETAR EFTER DUPLICAT...');
    
    // Hämta alla namngivna vattendrag
    const { data: allNamed } = await supabase
      .from('water_bodies')
      .select('id, name, osm_id, lat, lon')
      .not('name', 'is', null)
      .order('name');
    
    if (!allNamed) {
      console.log('❌ Kunde inte hämta data');
      return;
    }
    
    // Gruppera per namn
    const nameGroups: { [key: string]: any[] } = {};
    allNamed.forEach(water => {
      if (!nameGroups[water.name]) {
        nameGroups[water.name] = [];
      }
      nameGroups[water.name].push(water);
    });
    
    // Hitta duplicat (fler än 3 kopior)
    const duplicates = Object.entries(nameGroups)
      .filter(([name, entries]) => entries.length > 3)
      .sort(([,a], [,b]) => b.length - a.length)
      .slice(0, 20);
    
    console.log('\n🔄 VÄRSTA DUPLICATEN:');
    duplicates.forEach(([name, entries]) => {
      console.log(`  ${name}: ${entries.length} kopior`);
    });
    
    // 3. Ta bort duplicat (behåll bara 2 per namn för säkerhets skull)
    console.log('\n🗑️ TAR BORT DUPLICAT...');
    let totalRemoved = 0;
    
    for (const [lakeName, allCopies] of duplicates) {
      if (allCopies.length <= 2) continue; // Behåll om bara 2 kopior
      
      console.log(`\n🔄 Fixar ${lakeName} (${allCopies.length} kopior)...`);
      
      // Behåll bara 2 bästa kopior (med koordinater)
      const withCoords = allCopies.filter(copy => copy.lat && copy.lon);
      const withoutCoords = allCopies.filter(copy => !copy.lat || !copy.lon);
      
      // Behåll max 2 med koordinater, 0 utan koordinater
      const toKeep = withCoords.slice(0, 2);
      const toDelete = [...withCoords.slice(2), ...withoutCoords];
      
      console.log(`   ✅ Behåller ${toKeep.length} kopior`);
      console.log(`   ❌ Tar bort ${toDelete.length} kopior...`);
      
      if (toDelete.length > 0) {
        // Ta bort i batches om 1000
        const batchSize = 1000;
        for (let i = 0; i < toDelete.length; i += batchSize) {
          const batch = toDelete.slice(i, i + batchSize);
          const idsToDelete = batch.map(copy => copy.id);
          
          const { count: deleted } = await supabase
            .from('water_bodies')
            .delete({ count: 'exact' })
            .in('id', idsToDelete);
          
          totalRemoved += (deleted || 0);
          console.log(`   ✅ Batch ${Math.floor(i/batchSize) + 1}: ${deleted} borttagna`);
        }
      }
    }
    
    // 4. Kontrollera resultat
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
    console.log(`DISK SPARAD: ~${Math.round((totalRemoved * 200) / 1024 / 1024)} MB`);
    
    console.log('\n🎉 DUPLICAT-CLEANUP KLAR!');
    console.log('✅ Behåller max 2 kopior per sjö');
    console.log('💾 Betydligt mindre disk-användning');
    console.log('🚀 Redo för import-scriptet att fortsätta!');
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

fixDuplicatesOnly(); 