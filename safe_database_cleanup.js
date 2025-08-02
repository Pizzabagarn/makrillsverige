#!/usr/bin/env node

// SÄKER DATABAS-RENSNING I BATCHAR
// Tar bort allt utan timeout

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function safeDatabaseCleanup() {
  console.log('🔥 SÄKER DATABAS-RENSNING I BATCHAR\n');
  
  // Kolla startläge
  const { count: startCount } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 Startläge: ${startCount} poster att rensa`);
  
  if (!startCount || startCount === 0) {
    console.log('✅ Databasen är redan tom!');
    return;
  }
  
  const BATCH_SIZE = 5000; // Ta bort 5000 poster åt gången
  let totalDeleted = 0;
  let round = 1;
  
  while (true) {
    console.log(`\n🗑️ Omgång ${round}: Tar bort upp till ${BATCH_SIZE} poster...`);
    
    try {
      // Hämta en batch av IDs att ta bort
      const { data: idsToDelete } = await supabase
        .from('water_bodies')
        .select('id')
        .limit(BATCH_SIZE);
      
      if (!idsToDelete || idsToDelete.length === 0) {
        console.log('✅ Inga fler poster att ta bort!');
        break;
      }
      
      // Ta bort denna batch
      const ids = idsToDelete.map(row => row.id);
      const { count: deletedCount, error } = await supabase
        .from('water_bodies')
        .delete()
        .in('id', ids);
      
      if (error) {
        console.error(`❌ Fel vid borttagning: ${error.message}`);
        continue;
      }
      
      totalDeleted += deletedCount || idsToDelete.length;
      console.log(`✅ Tog bort ${deletedCount || idsToDelete.length} poster`);
      console.log(`📊 Progress: ${totalDeleted}/${startCount} (${Math.round(totalDeleted/startCount*100)}%)`);
      
      // Kort paus för att inte överbelasta
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      round++;
      
    } catch (error) {
      console.error(`💥 Oväntat fel: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Verifiera att allt är borta
  const { count: finalCount } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n🎉 RENSNING KLAR!`);
  console.log(`📊 Före: ${startCount} poster`);
  console.log(`📊 Efter: ${finalCount || 0} poster`);
  console.log(`🗑️ Borttaget: ${totalDeleted} poster`);
  
  if (finalCount === 0) {
    console.log(`✅ DATABAS HELT REN - REDO FÖR SMART IMPORT! 🚀`);
  } else {
    console.log(`⚠️ ${finalCount} poster kvar - kör scriptet igen om nödvändigt`);
  }
}

safeDatabaseCleanup().catch(error => {
  console.error('💥 Rensning kraschade:', error);
  process.exit(1);
}); 