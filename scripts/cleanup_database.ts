#!/usr/bin/env node

// RENSA DATABAS - ta bort mindre viktiga vattendrag för att få plats under 500MB

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

async function cleanupDatabase() {
  console.log('🗑️ RENSAR DATABAS för att komma under 500MB gräns\n');
  
  try {
    // 1. Kontrollera nuvarande status
    const { count: totalBefore } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 FÖRE RENSNING: ${totalBefore || 0} vattendrag`);
    
    // 2. Räkna olika typer
    const { data: types } = await supabase
      .from('water_bodies')
      .select('water_type')
      .not('water_type', 'is', null);
    
    if (types) {
      const typeCounts = types.reduce((acc: any, curr) => {
        acc[curr.water_type] = (acc[curr.water_type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('\n🏷️ FÖRE - Typer av vattendrag:');
      Object.entries(typeCounts).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }
    
    // 3. RENSA STRATEGISKT - behåll viktiga
    console.log('\n🎯 RENSNINGSSTRATEGI:');
    console.log('✅ BEHÅLLER: Sjöar med namn, stora vattendrag');
    console.log('❌ TAR BORT: Små åar/bäckar utan namn');
    
    // Ta bort små streams utan namn först
    console.log('\n🔄 Tar bort små streams utan namn...');
    const { count: streamsDeleted } = await supabase
      .from('water_bodies')
      .delete({ count: 'exact' })
      .eq('water_type', 'stream')
      .is('name', null);
    
    console.log(`❌ Tog bort ${streamsDeleted || 0} små streams`);
    
    // Ta bort reservoirer utan namn
    console.log('🔄 Tar bort reservoirer utan namn...');
    const { count: reservoirsDeleted } = await supabase
      .from('water_bodies')
      .delete({ count: 'exact' })
      .eq('water_type', 'reservoir')
      .is('name', null);
    
    console.log(`❌ Tog bort ${reservoirsDeleted || 0} reservoirer`);
    
    // Ta bort hälften av rivers utan namn (behåll lite)
    console.log('🔄 Tar bort hälften av rivers utan namn...');
    const { data: unnamedRivers } = await supabase
      .from('water_bodies')
      .select('id')
      .eq('water_type', 'river')
      .is('name', null)
      .limit(50000);
    
    if (unnamedRivers && unnamedRivers.length > 0) {
      const idsToDelete = unnamedRivers.slice(0, Math.floor(unnamedRivers.length / 2)).map(r => r.id);
      
      const { count: riversDeleted } = await supabase
        .from('water_bodies')
        .delete({ count: 'exact' })
        .in('id', idsToDelete);
      
      console.log(`❌ Tog bort ${riversDeleted || 0} rivers utan namn`);
    }
    
    // 4. Kontrollera efter rensning
    const { count: totalAfter } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\n📊 EFTER RENSNING: ${totalAfter || 0} vattendrag`);
    console.log(`📉 Borttaget: ${(totalBefore || 0) - (totalAfter || 0)} vattendrag`);
    console.log(`💾 Ungefär ${Math.round(((totalBefore || 0) - (totalAfter || 0)) / (totalBefore || 1) * 564)}MB frigjort`);
    
    // 5. Kontrollera vad som finns kvar
    const { data: remainingTypes } = await supabase
      .from('water_bodies')
      .select('water_type')
      .not('water_type', 'is', null);
    
    if (remainingTypes) {
      const remainingCounts = remainingTypes.reduce((acc: any, curr) => {
        acc[curr.water_type] = (acc[curr.water_type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('\n🏷️ EFTER - Kvarvarande typer:');
      Object.entries(remainingCounts).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }
    
    // 6. Kontrollera namngivna vattendrag
    const { count: namedCount } = await supabase
      .from('water_bodies')
      .select('*', { count: 'exact', head: true })
      .not('name', 'is', null);
    
    console.log(`\n✅ Kvarvarande med namn: ${namedCount || 0} vattendrag`);
    console.log(`📊 ${Math.round((namedCount || 0)/(totalAfter || 1)*100)}% av kvarvarande har namn`);
    
    if ((totalAfter || 0) < 250000) {
      console.log('\n🎉 FRAMGÅNG! Nu borde det finnas plats för fler vattendrag!');
      console.log('🚀 Kan köra import-scriptet igen nu.');
    } else {
      console.log('\n⚠️ Kanske behöver rensa mer eller uppgradera Supabase.');
    }
    
  } catch (error) {
    console.error('❌ Fel vid rensning:', error);
  }
}

cleanupDatabase(); 