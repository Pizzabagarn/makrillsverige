/**
 * Kontrollera vilken materialized view som faktiskt används
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkMaterializedViewSource() {
  console.log('🔍 KONTROLLERAR MATERIALIZED VIEW STATUS...\n');
  
  try {
    // 1. Räkna rader i båda tabellerna
    console.log('📊 ANTAL RADER:');
    
    const { count: originalCount } = await supabase
      .from('water_bodies_with_places')
      .select('*', { count: 'exact', head: true });
      
    const { count: materializedCount } = await supabase
      .from('water_bodies_with_places_fast_lookup')
      .select('*', { count: 'exact', head: true });
      
    console.log(`   water_bodies_with_places: ${originalCount?.toLocaleString()}`);
    console.log(`   water_bodies_with_places_fast_lookup: ${materializedCount?.toLocaleString()}`);
    
    const missing = (originalCount || 0) - (materializedCount || 0);
    console.log(`   Skillnad: ${missing.toLocaleString()} rader saknas i materialized view`);
    
    // 2. Analysera vad som saknas
    console.log('\n🔍 VAD SAKNAS?');
    
    if (missing > 0) {
      console.log(`   ${missing.toLocaleString()} rader har filtrerats bort från materialized view`);
      console.log('   Detta betyder att materialized view har WHERE-villkor som filtrerar data');
      console.log('');
      
      // Kontrollera vanliga filter
      const { count: noNameCount } = await supabase
        .from('water_bodies_with_places')
        .select('*', { count: 'exact', head: true })
        .is('name', null);
        
      const { count: noGeomCount } = await supabase
        .from('water_bodies_with_places')
        .select('*', { count: 'exact', head: true })
        .is('geometry', null);
        
      console.log('   Möjliga orsaker:');
      console.log(`   • Rader med name IS NULL: ${noNameCount?.toLocaleString()}`);
      console.log(`   • Rader med geometry IS NULL: ${noGeomCount?.toLocaleString()}`);
      console.log('   • Rader med invalid geometri (ST_IsValid = false)');
      console.log('');
      
      console.log('❓ SLUTSATS:');
      console.log('   Den nuvarande materialized view har troligen skapats med filter som:');
      console.log('   WHERE name IS NOT NULL AND geometry IS NOT NULL AND ST_IsValid(geometry) = true');
      console.log('');
      console.log('💡 LÖSNING:');
      console.log('   Om du vill ha ALLA rader (även de med NULL värden):');
      console.log('   1. Kör vår nya SQL från create_exact_copy_materialized_view.sql');
      console.log('   2. Den har INGEN WHERE-klausul och tar allt från water_bodies_with_places');
      
    } else if (missing === 0) {
      console.log('   ✅ Perfekt matchning! Materialized view har alla rader.');
      
    } else {
      console.log('   ❓ Materialized view har FLER rader än original? Detta är konstigt...');
    }
    
    console.log('\n📋 REKOMMENDATION:');
    if (missing > 0) {
      console.log('   De saknade raderna är troligen:');
      console.log('   • Vattendrag utan namn (name IS NULL)');
      console.log('   • Vattendrag utan geometri (geometry IS NULL)');
      console.log('   • Vattendrag med trasig geometri (ST_IsValid = false)');
      console.log('');
      console.log('   Detta är faktiskt BRA för prestanda eftersom:');
      console.log('   • Du kan inte söka på vattendrag utan namn ändå');
      console.log('   • Du kan inte klicka på vattendrag utan geometri');
      console.log('   • Trasiga geometrier orsakar fel');
      console.log('');
      console.log('   ✅ BEHÅLL nuvarande materialized view - den är optimerad!');
    }
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

checkMaterializedViewSource();
 * Kontrollera vilken materialized view som faktiskt används
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkMaterializedViewSource() {
  console.log('🔍 KONTROLLERAR MATERIALIZED VIEW STATUS...\n');
  
  try {
    // 1. Räkna rader i båda tabellerna
    console.log('📊 ANTAL RADER:');
    
    const { count: originalCount } = await supabase
      .from('water_bodies_with_places')
      .select('*', { count: 'exact', head: true });
      
    const { count: materializedCount } = await supabase
      .from('water_bodies_with_places_fast_lookup')
      .select('*', { count: 'exact', head: true });
      
    console.log(`   water_bodies_with_places: ${originalCount?.toLocaleString()}`);
    console.log(`   water_bodies_with_places_fast_lookup: ${materializedCount?.toLocaleString()}`);
    
    const missing = (originalCount || 0) - (materializedCount || 0);
    console.log(`   Skillnad: ${missing.toLocaleString()} rader saknas i materialized view`);
    
    // 2. Analysera vad som saknas
    console.log('\n🔍 VAD SAKNAS?');
    
    if (missing > 0) {
      console.log(`   ${missing.toLocaleString()} rader har filtrerats bort från materialized view`);
      console.log('   Detta betyder att materialized view har WHERE-villkor som filtrerar data');
      console.log('');
      
      // Kontrollera vanliga filter
      const { count: noNameCount } = await supabase
        .from('water_bodies_with_places')
        .select('*', { count: 'exact', head: true })
        .is('name', null);
        
      const { count: noGeomCount } = await supabase
        .from('water_bodies_with_places')
        .select('*', { count: 'exact', head: true })
        .is('geometry', null);
        
      console.log('   Möjliga orsaker:');
      console.log(`   • Rader med name IS NULL: ${noNameCount?.toLocaleString()}`);
      console.log(`   • Rader med geometry IS NULL: ${noGeomCount?.toLocaleString()}`);
      console.log('   • Rader med invalid geometri (ST_IsValid = false)');
      console.log('');
      
      console.log('❓ SLUTSATS:');
      console.log('   Den nuvarande materialized view har troligen skapats med filter som:');
      console.log('   WHERE name IS NOT NULL AND geometry IS NOT NULL AND ST_IsValid(geometry) = true');
      console.log('');
      console.log('💡 LÖSNING:');
      console.log('   Om du vill ha ALLA rader (även de med NULL värden):');
      console.log('   1. Kör vår nya SQL från create_exact_copy_materialized_view.sql');
      console.log('   2. Den har INGEN WHERE-klausul och tar allt från water_bodies_with_places');
      
    } else if (missing === 0) {
      console.log('   ✅ Perfekt matchning! Materialized view har alla rader.');
      
    } else {
      console.log('   ❓ Materialized view har FLER rader än original? Detta är konstigt...');
    }
    
    console.log('\n📋 REKOMMENDATION:');
    if (missing > 0) {
      console.log('   De saknade raderna är troligen:');
      console.log('   • Vattendrag utan namn (name IS NULL)');
      console.log('   • Vattendrag utan geometri (geometry IS NULL)');
      console.log('   • Vattendrag med trasig geometri (ST_IsValid = false)');
      console.log('');
      console.log('   Detta är faktiskt BRA för prestanda eftersom:');
      console.log('   • Du kan inte söka på vattendrag utan namn ändå');
      console.log('   • Du kan inte klicka på vattendrag utan geometri');
      console.log('   • Trasiga geometrier orsakar fel');
      console.log('');
      console.log('   ✅ BEHÅLL nuvarande materialized view - den är optimerad!');
    }
    
  } catch (error) {
    console.error('❌ Fel:', error);
  }
}

checkMaterializedViewSource();