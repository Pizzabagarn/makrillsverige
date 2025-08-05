#!/usr/bin/env ts-node

/**
 * Debug: Undersök vad som hände med processing
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function debugProcessing(): Promise<void> {
    console.log('🔍 UNDERSÖKER VAD SOM HÄNDE MED PROCESSING');
    console.log('='.repeat(50));
    
    // 1. Totalt antal i water_bodies_integrated
    console.log('\n📊 ORIGINAL DATA:');
    const { count: totalOriginal } = await supabase
        .from('water_bodies_integrated')
        .select('*', { count: 'exact', head: true });
    console.log(`   Total vattendrag: ${totalOriginal?.toLocaleString()}`);
    
    // 2. Med namn
    const { count: withNames } = await supabase
        .from('water_bodies_integrated')
        .select('*', { count: 'exact', head: true })
        .not('name', 'is', null);
    console.log(`   Med namn: ${withNames?.toLocaleString()}`);
    
    // 3. Med geometri
    const { count: withGeometry } = await supabase
        .from('water_bodies_integrated')
        .select('*', { count: 'exact', head: true })
        .not('geometry', 'is', null);
    console.log(`   Med geometri: ${withGeometry?.toLocaleString()}`);
    
    // 4. Med både namn OCH geometri
    const { count: withBoth } = await supabase
        .from('water_bodies_integrated')
        .select('*', { count: 'exact', head: true })
        .not('name', 'is', null)
        .not('geometry', 'is', null);
    console.log(`   Med namn OCH geometri: ${withBoth?.toLocaleString()}`);
    
    // 5. Analysera namn-duplicering
    console.log('\n🔍 NAMN-ANALYS:');
    const { data: allNames } = await supabase
        .from('water_bodies_integrated')
        .select('name')
        .not('name', 'is', null);
    
    const nameCounts: { [key: string]: number } = {};
    allNames?.forEach(row => {
        nameCounts[row.name] = (nameCounts[row.name] || 0) + 1;
    });
    
    const uniqueNames = Object.keys(nameCounts).length;
    const duplicatedNames = Object.entries(nameCounts)
        .filter(([name, count]) => count > 1).length;
    const singleNames = Object.entries(nameCounts)
        .filter(([name, count]) => count === 1).length;
    
    console.log(`   Unika namn: ${uniqueNames.toLocaleString()}`);
    console.log(`   Namn som förekommer flera gånger: ${duplicatedNames}`);
    console.log(`   Namn som förekommer bara en gång: ${singleNames.toLocaleString()}`);
    
    // 6. Vad processades faktiskt?
    console.log('\n📊 VAD PROCESSERADES:');
    const { count: processedCount } = await supabase
        .from('water_bodies_unified')
        .select('*', { count: 'exact', head: true });
    console.log(`   Unified vattendrag skapade: ${processedCount?.toLocaleString()}`);
    
    // 7. Visa exempel på vad som fattades
    console.log('\n❓ EXEMPEL PÅ VAD SOM FATTADES:');
    const { data: randomOriginal } = await supabase
        .from('water_bodies_integrated')
        .select('name, water_type, data_source')
        .not('name', 'is', null)
        .limit(10);
    
    console.log('   Slumpmässiga original vattendrag:');
    randomOriginal?.forEach((water, i) => {
        console.log(`      ${i+1}. ${water.name} (${water.water_type}, ${water.data_source})`);
    });
    
    const { data: unifiedSample } = await supabase
        .from('water_bodies_unified')
        .select('display_name, unification_method')
        .limit(10);
    
    console.log('\n   Unified vattendrag som skapades:');
    unifiedSample?.forEach((water, i) => {
        console.log(`      ${i+1}. ${water.display_name} (${water.unification_method})`);
    });
    
    // 8. Slutsats
    console.log('\n🎯 SLUTSATS:');
    const expectedTotal = withBoth || 0;
    const actualProcessed = processedCount || 0;
    const missing = expectedTotal - actualProcessed;
    
    if (missing > 0) {
        console.log(`   ❌ PROBLEM: ${missing.toLocaleString()} vattendrag fattades!`);
        console.log(`   📊 Förväntade: ${expectedTotal.toLocaleString()}`);
        console.log(`   📊 Processade: ${actualProcessed.toLocaleString()}`);
        console.log(`   📊 Fattades: ${missing.toLocaleString()} (${(missing/expectedTotal*100).toFixed(1)}%)`);
        
        console.log('\n🔧 ORSAK:');
        console.log('   Processor-scriptet processade bara:');
        console.log('   • Duplicerade namngrupper (4 st)');
        console.log('   • Enkla vattendrag med unika namn (~1000 st)');
        console.log('   • Men ALLA vattendrag ska processeras!');
    } else {
        console.log('   ✅ Alla vattendrag processerade korrekt');
    }
}

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    debugProcessing()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('❌ Debug failed:', error);
            process.exit(1);
        });
}