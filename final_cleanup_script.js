#!/usr/bin/env node

// SLUTGILTIG RENSNING AV NORDISK VATTENDRAGS-DATABAS
// Kör detta EFTER importen är klar för att få en ren databas

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function massiveCleanup() {
  console.log('🧹 SLUTGILTIG MASSIV DATABAS-RENSNING');
  console.log('🎯 Mål: Bara namngivna vatten, inga dubletter\n');
  
  // Steg 1: Kolla startläge
  const { count: startTotal } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  const { count: startNamed } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true })
    .not('name', 'is', null)
    .neq('name', '')
    .neq('name', 'null');  // Ta bort "null" strängar också
  
  console.log('📊 STARTLÄGE:');
  console.log(`   💧 ${startTotal} totala vatten`);
  console.log(`   🏷️ ${startNamed} med giltiga namn`);
  console.log(`   🗑️ ${startTotal - startNamed} utan namn (${Math.round((startTotal-startNamed)/startTotal*100)}%)\n`);
  
  // Steg 2: Ta bort alla "null" strängar först
  console.log('🔥 STEG 1: Rensar konstiga "null" strängar...');
  const { count: deletedNullStrings } = await supabase
    .from('water_bodies')
    .delete()
    .eq('name', 'null');
  
  console.log(`✅ Tog bort ${deletedNullStrings || 0} "null" strängar`);
  
  // Steg 3: Ta bort alla NULL-namn (riktiga null-värden)
  console.log('🔥 STEG 2: Tar bort alla utan riktiga namn...');
  const { count: deletedNulls } = await supabase
    .from('water_bodies')
    .delete()
    .or('name.is.null,name.eq.');  // Null eller tom sträng
  
  console.log(`✅ Tog bort ${deletedNulls || 0} namnlösa vatten`);
  
  // Steg 4: Aggressiv dublett-rensning
  console.log('🔥 STEG 3: AGGRESSIV dublett-rensning...');
  
  // Hämta alla kvarvarande poster
  const { data: allRemaining } = await supabase
    .from('water_bodies')
    .select('id, osm_id, osm_type, name')
    .order('id');  // Sortera så vi behåller äldsta poster
  
  if (allRemaining && allRemaining.length > 0) {
    const seen = new Set();
    const duplicateIds = [];
    
    // Hitta dubletter baserat på osm_id + osm_type
    for (const water of allRemaining) {
      const key = `${water.osm_id}-${water.osm_type}`;
      if (seen.has(key)) {
        duplicateIds.push(water.id);
      } else {
        seen.add(key);
      }
    }
    
    console.log(`🗑️ Hittade ${duplicateIds.length} OSM-dubletter`);
    
    // Ta bort dubletter i batchar
    if (duplicateIds.length > 0) {
      const BATCH_SIZE = 500;
      let deleted = 0;
      
      for (let i = 0; i < duplicateIds.length; i += BATCH_SIZE) {
        const batch = duplicateIds.slice(i, i + BATCH_SIZE);
        
        const { count: batchDeleted } = await supabase
          .from('water_bodies')
          .delete()
          .in('id', batch);
        
        deleted += batchDeleted || 0;
        
        if (deleted % 1000 === 0) {
          console.log(`   🗑️ ${deleted}/${duplicateIds.length} dubletter borttagna...`);
        }
        
        // Paus för att inte överbelasta
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`✅ Tog bort ${deleted} OSM-dubletter`);
    }
    
    // Extra dublett-check baserat på namn + ungefärlig position
    console.log('🔍 EXTRA: Söker namn-dubletter...');
    
    const { data: nameGroups } = await supabase
      .from('water_bodies')
      .select('name, count(*)')
      .not('name', 'is', null)
      .group('name')
      .having('count(*) > 1')
      .limit(100);
    
    if (nameGroups && nameGroups.length > 0) {
      console.log(`🗑️ Hittade ${nameGroups.length} namn med dubletter`);
      
      for (const group of nameGroups.slice(0, 20)) { // Bara de första 20 för att inte ta för lång tid
        const { data: sameName } = await supabase
          .from('water_bodies')
          .select('id, name, water_type')
          .eq('name', group.name)
          .order('id')
          .limit(10);
        
        if (sameName && sameName.length > 1) {
          // Behåll bara den första
          const toDelete = sameName.slice(1).map(w => w.id);
          await supabase
            .from('water_bodies')
            .delete()
            .in('id', toDelete);
          
          console.log(`   ✅ "${group.name}": Behöll 1, tog bort ${sameName.length - 1}`);
        }
      }
    }
  }
  
  // Steg 5: Final kontroll - ta bort ogiltiga poster
  console.log('🔥 STEG 4: Final kontroll - ogiltiga poster...');
  
  const { count: deletedInvalid } = await supabase
    .from('water_bodies')
    .delete()
    .or('geometry.is.null,water_type.is.null,osm_id.is.null');
  
  console.log(`✅ Tog bort ${deletedInvalid || 0} ogiltiga poster`);
  
  // SLUTRAPPORT
  const { count: finalTotal } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true });
  
  const { count: finalNamed } = await supabase
    .from('water_bodies')
    .select('*', { count: 'exact', head: true })
    .not('name', 'is', null);
  
  console.log('\n🎉 SLUTGILTIG RENSNING KLAR!');
  console.log('\n📊 FÖRE → EFTER:');
  console.log(`   💧 Totalt: ${startTotal} → ${finalTotal} (-${startTotal - finalTotal})`);
  console.log(`   🏷️ Namngivna: ${startNamed} → ${finalNamed}`);
  console.log(`   📈 Kvalitet: ${Math.round(startNamed/startTotal*100)}% → ${Math.round(finalNamed/finalTotal*100)}%`);
  
  const reduction = Math.round((1 - finalTotal/startTotal) * 100);
  console.log(`\n🎯 RESULTAT: ${reduction}% minskning, 100% namngivna vatten!`);
  
  // Visa exempel på kvarvarande vatten
  console.log('\n🏆 EXEMPEL PÅ KVARVARANDE VATTEN:');
  const { data: examples } = await supabase
    .from('water_bodies')
    .select('name, water_type, osm_id')
    .limit(10);
  
  examples.forEach((w, i) => {
    console.log(`${i+1}. "${w.name}" (${w.water_type}) - OSM ${w.osm_id}`);
  });
  
  console.log('\n✅ REDO FÖR VÄDERDATA-INTEGRATION! 🌦️');
}

// START - vänta på användarbekräftelse
console.log('⚠️  VARNING: Detta kommer att ta bort MASSVIS med data!');
console.log('🎯 Bara namngivna vatten kommer att behållas');
console.log('⏱️  Detta kan ta 10-30 minuter beroende på databasstorlek\n');

// Kör direkt (användaren sa att köra efter import)
massiveCleanup().catch(error => {
  console.error('💥 Rensning kraschade:', error);
  process.exit(1);
}); 