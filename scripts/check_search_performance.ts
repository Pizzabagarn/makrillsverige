/**
 * DIAGNOSTIK SCRIPT för sökfunktionens prestanda
 * Kontrollerar vilka tabeller som finns, materialized views, index, etc.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Ladda environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL eller SUPABASE_ANON_KEY saknas i .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables(): Promise<void> {
    console.log('🔍 KONTROLLERAR DATABASTABELLER...\n');
    
    const tablesToCheck = [
        'water_bodies',
        'water_bodies_integrated', 
        'water_bodies_unified',
        'water_bodies_with_places'
    ];
    
    for (const table of tablesToCheck) {
        try {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
                
            if (error) {
                console.log(`   ❌ ${table}: Finns inte eller fel (${error.message})`);
            } else {
                console.log(`   ✅ ${table}: ${count?.toLocaleString() || 0} rader`);
            }
        } catch (err) {
            console.log(`   ❌ ${table}: Kunde inte kontrollera`);
        }
    }
}

async function checkMaterializedViews(): Promise<void> {
    console.log('\n🔍 KONTROLLERAR MATERIALIZED VIEWS...\n');
    
    const viewsToCheck = [
        'water_bodies_fast_lookup',
        'water_bodies_unified_fast_lookup',
        'water_bodies_with_places_fast_lookup'
    ];
    
    for (const view of viewsToCheck) {
        try {
            const { count, error } = await supabase
                .from(view)
                .select('*', { count: 'exact', head: true });
                
            if (error) {
                console.log(`   ❌ ${view}: Finns inte eller fel`);
            } else {
                console.log(`   ✅ ${view}: ${count?.toLocaleString() || 0} rader`);
            }
        } catch (err) {
            console.log(`   ❌ ${view}: Kunde inte kontrollera`);
        }
    }
}

async function testSearchPerformance(): Promise<void> {
    console.log('\n⏱️ TESTAR SÖKPRESTANDA...\n');
    
    const testSearches = [
        'vänern',
        'vättern', 
        'mälaren',
        'öresund',
        'höje å'
    ];
    
    for (const searchTerm of testSearches) {
        console.log(`🔍 Testar sökning: "${searchTerm}"`);
        
        // Test 1: water_bodies_with_places (nuvarande system)
        try {
            const start1 = Date.now();
            const { data: results1, error: error1 } = await supabase
                .from('water_bodies_with_places')
                .select('id, name, display_name, area_km2')
                .ilike('name', `%${searchTerm}%`)
                .order('area_km2', { ascending: false })
                .limit(8);
            const time1 = Date.now() - start1;
            
            if (error1) {
                console.log(`   ❌ water_bodies_with_places: ${error1.message}`);
            } else {
                console.log(`   ✅ water_bodies_with_places: ${time1}ms, ${results1?.length || 0} resultat`);
            }
        } catch (err) {
            console.log(`   ❌ water_bodies_with_places: Fel vid sökning`);
        }
        
        // Test 2: water_bodies_with_places_fast_lookup (materialized view)
        try {
            const start2 = Date.now();
            const { data: results2, error: error2 } = await supabase
                .from('water_bodies_with_places_fast_lookup')
                .select('id, name, display_name, area_km2')
                .ilike('name', `%${searchTerm}%`)
                .order('area_km2', { ascending: false })
                .limit(8);
            const time2 = Date.now() - start2;
            
            if (error2) {
                console.log(`   ❌ fast_lookup: Inte tillgänglig`);
            } else {
                console.log(`   ✅ fast_lookup: ${time2}ms, ${results2?.length || 0} resultat`);
            }
        } catch (err) {
            console.log(`   ❌ fast_lookup: Inte tillgänglig`);
        }
        
        // Test 3: water_bodies_integrated (gamla systemet)
        try {
            const start3 = Date.now();
            const { data: results3, error: error3 } = await supabase
                .from('water_bodies_integrated')
                .select('id, name, area_km2')
                .ilike('name', `%${searchTerm}%`)
                .order('area_km2', { ascending: false })
                .limit(8);
            const time3 = Date.now() - start3;
            
            if (error3) {
                console.log(`   ❌ water_bodies_integrated: ${error3.message}`);
            } else {
                console.log(`   ✅ water_bodies_integrated: ${time3}ms, ${results3?.length || 0} resultat`);
            }
        } catch (err) {
            console.log(`   ❌ water_bodies_integrated: Fel vid sökning`);
        }
        
        console.log('');
    }
}

async function checkFeatureFlags(): Promise<void> {
    console.log('🚩 KONTROLLERAR FEATURE FLAGS...\n');
    
    // Kontrollera USE_PLACES_SYSTEM
    console.log('   USE_PLACES_SYSTEM = true (från skandinavisk-karta/page.tsx)');
    console.log('   USE_UNIFIED_SYSTEM = false (från unifiedWaterService.ts)');
    console.log('');
    console.log('   → Nuvarande system: water_bodies_with_places');
    console.log('   → Fallback: water_bodies_integrated via SMHI service');
}

async function main(): Promise<void> {
    console.log('🔍 DIAGNOSTIK: SÖKFUNKTIONENS PRESTANDA\n');
    console.log('Detta script kontrollerar varför sökningen blivit långsam...\n');
    
    await checkTables();
    await checkMaterializedViews();
    await checkFeatureFlags();
    await testSearchPerformance();
    
    console.log('\n📋 SAMMANFATTNING:');
    console.log('1. Kontrollera om materialized views finns och är uppdaterade');
    console.log('2. Jämför prestanda mellan olika tabeller');
    console.log('3. Identifiera vilka index som saknas');
    console.log('4. Rekommendera lösningar för att återställa snabb sökning');
}

main().catch(console.error);