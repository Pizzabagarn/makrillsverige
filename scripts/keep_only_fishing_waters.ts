#!/usr/bin/env node

// BEHÅLL BARA FISKEVATTEN - sjöar, åar, tjärnar, forsar
// Ta bort kanaler, reservoirer och andra icke-fiske vatten

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

// FISKEVATTEN som vi BEHÅLLER
const FISHING_WATER_TYPES = [
  'lake',      // Sjöar
  'water',     // Naturligt vatten (kan vara tjärnar)
  'river',     // Åar
  'stream'     // Bäckar/forsar
];

// ICKE-FISKEVATTEN som vi TAR BORT
const NON_FISHING_TYPES = [
  'canal',           // Kanaler
  'reservoir',       // Konstgjorda reservoirer  
  'fishing',         // Specifika fiskeplatser (konstgjorda)
  'unknown'          // Okända typer
];

async function keepOnlyFishingWaters() {
  console.log('🎣 OPTIMERAR FÖR BARA FISKEVATTEN\n');
  
  try {
    // 1. Kontrollera nuvarande innehåll
    console.log('📊 NUVARANDE INNEHÅLL:');
    const { count: totalBefore } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Total: ${totalBefore || 0} vattendrag`);
    
    // Visa alla typer som finns
    const { data: allTypes } = await supabase
      .from('water_bodies')
      .select('water_type')
      .not('water_type', 'is', null);
    
    if (allTypes) {
      const typeCounts = allTypes.reduce((acc: any, curr) => {
        acc[curr.water_type] = (acc[curr.water_type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('\nTyper som finns:');
      Object.entries(typeCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .forEach(([type, count]) => {
          const status = FISHING_WATER_TYPES.includes(type) ? '✅ BEHÅLL' : 
                        NON_FISHING_TYPES.includes(type) ? '❌ TA BORT' : '❓ OKLAR';
          console.log(`  ${type}: ${count} ${status}`);
        });
    }
    
    console.log('\n🎯 RENSNINGSSTRATEGI:');
    console.log('✅ BEHÅLLER: lake, water, river, stream (äkta fiskevatten)');
    console.log('❌ TAR BORT: canal, reservoir, fishing, unknown (konstgjorda/irrelevanta)');
    
    // 2. Ta bort icke-fiskevatten
    let totalDeleted = 0;
    
    for (const typeToDelete of NON_FISHING_TYPES) {
      console.log(`\n🗑️ Tar bort ${typeToDelete}...`);
      
      const { count: deleted } = await supabase
        .from('water_bodies')
        .delete({ count: 'exact' })
        .eq('water_type', typeToDelete);
      
      console.log(`   ❌ Borttaget: ${deleted || 0} ${typeToDelete}`);
      totalDeleted += (deleted || 0);
    }
    
    // 3. Ta bort vattendrag utan typ (NULL)
    console.log('\n🗑️ Tar bort vattendrag utan typ...');
    const { count: deletedNull } = await supabase
      .from('water_bodies')
      .delete({ count: 'exact' })
      .is('water_type', null);
    
    console.log(`   ❌ Borttaget: ${deletedNull || 0} utan typ`);
    totalDeleted += (deletedNull || 0);
    
    // 4. Kontrollera resultat
    const { count: totalAfter } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    console.log('\n📊 RESULTAT:');
    console.log(`FÖRE: ${totalBefore || 0} vattendrag`);
    console.log(`EFTER: ${totalAfter || 0} vattendrag`);
    console.log(`BORTTAGET: ${totalDeleted} vattendrag`);
    console.log(`KVAR: ${Math.round((totalAfter || 0)/(totalBefore || 1)*100)}% av ursprungliga`);
    
    // 5. Visa kvarvarande typer
    const { data: remainingTypes } = await supabase
      .from('water_bodies')
      .select('water_type')
      .not('water_type', 'is', null);
    
    if (remainingTypes) {
      const remainingCounts = remainingTypes.reduce((acc: any, curr) => {
        acc[curr.water_type] = (acc[curr.water_type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('\n🎣 KVARVARANDE FISKEVATTEN:');
      Object.entries(remainingCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
    }
    
    // 6. Kontrollera namngivna
    const { count: namedCount } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .not('name', 'is', null);
    
    console.log(`\n🏷️ Med namn: ${namedCount || 0} (${Math.round((namedCount || 0)/(totalAfter || 1)*100)}%)`);
    
    console.log('\n🎉 OPTIMERING KLAR!');
    console.log('🎣 Nu har du bara äkta fiskevatten kvar!');
    console.log('🚀 Redo att köra förbättrade import-scriptet för bättre namn.');
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

keepOnlyFishingWaters(); 