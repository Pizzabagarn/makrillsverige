/**
 * Testar den exakta materialized view efter att den skapats
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Ladda environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testExactMaterializedView(): Promise<void> {
    console.log('🔍 TESTAR EXAKT MATERIALIZED VIEW...\n');
    
    try {
        // 1. Kontrollera antal rader
        console.log('1. Kontrollerar antal rader...');
        
        const { count: originalCount } = await supabase
            .from('water_bodies_with_places')
            .select('*', { count: 'exact', head: true });
            
        const { count: materializedCount } = await supabase
            .from('water_bodies_with_places_fast_lookup')
            .select('*', { count: 'exact', head: true });
            
        console.log(`   Original: ${originalCount?.toLocaleString()} rader`);
        console.log(`   Materialized: ${materializedCount?.toLocaleString()} rader`);
        
        if (originalCount === materializedCount) {
            console.log('   ✅ PERFEKT MATCHNING!');
        } else {
            console.log('   ❌ ANTAL MATCHAR INTE!');
            return;
        }
        
        // 2. Testa stora sjöar
        console.log('\n2. Testar stora sjöar...');
        
        const testLakes = ['vänern', 'vättern', 'mälaren'];
        
        for (const lake of testLakes) {
            const { data: originalData } = await supabase
                .from('water_bodies_with_places')
                .select('name, area_km2')
                .ilike('name', `%${lake}%`)
                .order('area_km2', { ascending: false })
                .limit(1);
                
            const { data: materializedData } = await supabase
                .from('water_bodies_with_places_fast_lookup')
                .select('name, area_km2')
                .ilike('name', `%${lake}%`)
                .order('area_km2', { ascending: false })
                .limit(1);
                
            if (originalData?.[0] && materializedData?.[0]) {
                const originalSize = originalData[0].area_km2;
                const materializedSize = materializedData[0].area_km2;
                
                if (originalSize === materializedSize) {
                    console.log(`   ✅ ${lake}: ${originalSize} km² (SAMMA STORLEK)`);
                } else {
                    console.log(`   ❌ ${lake}: Original ${originalSize} km² vs Materialized ${materializedSize} km²`);
                }
            } else {
                console.log(`   ❌ ${lake}: Hittades inte i båda tabellerna`);
            }
        }
        
        // 3. Testa prestanda
        console.log('\n3. Testar prestanda...');
        
        const testSearches = ['vänern', 'höje å'];
        
        for (const searchTerm of testSearches) {
            console.log(`\n   🔍 Sökning: "${searchTerm}"`);
            
            // Original tabell
            const start1 = Date.now();
            const { data: originalResults, error: error1 } = await supabase
                .from('water_bodies_with_places')
                .select('name, area_km2')
                .ilike('name', `%${searchTerm}%`)
                .order('area_km2', { ascending: false })
                .limit(8);
            const time1 = Date.now() - start1;
            
            // Materialized view
            const start2 = Date.now();
            const { data: materializedResults, error: error2 } = await supabase
                .from('water_bodies_with_places_fast_lookup')
                .select('name, area_km2')
                .ilike('name', `%${searchTerm}%`)
                .order('area_km2', { ascending: false })
                .limit(8);
            const time2 = Date.now() - start2;
            
            if (error1) {
                console.log(`      ❌ Original: ${error1.message}`);
            } else {
                console.log(`      ✅ Original: ${time1}ms, ${originalResults?.length || 0} resultat`);
            }
            
            if (error2) {
                console.log(`      ❌ Materialized: ${error2.message}`);
            } else {
                console.log(`      ✅ Materialized: ${time2}ms, ${materializedResults?.length || 0} resultat`);
                
                if (time1 > 0 && time2 > 0) {
                    const improvement = ((time1 - time2) / time1 * 100).toFixed(1);
                    console.log(`      📈 Förbättring: ${improvement}% snabbare`);
                }
            }
        }
        
        console.log('\n🎉 TEST KLART!');
        console.log('\nOm allt ser bra ut, ändra din kod att använda:');
        console.log('.from("water_bodies_with_places_fast_lookup")');
        
    } catch (error) {
        console.error('❌ Fel vid test:', error);
    }
}

async function main(): Promise<void> {
    await testExactMaterializedView();
}

main();