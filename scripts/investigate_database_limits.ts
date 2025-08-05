#!/usr/bin/env ts-node

/**
 * UNDERSÖK DATABAS LIMITS
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function investigateDatabase(): Promise<void> {
    console.log('🔍 UNDERSÖKER DATABAS LIMITS');
    console.log('='.repeat(50));
    
    try {
        // Test 1: Totalt antal rader
        console.log('📊 Test 1: Totalt antal rader...');
        const { count: totalCount, error: countError } = await supabase
            .from('water_bodies_integrated')
            .select('*', { count: 'exact', head: true });
            
        if (countError) {
            console.error('❌ Count error:', countError);
        } else {
            console.log(`   ✅ Total: ${totalCount?.toLocaleString()} rader`);
        }
        
        // Test 2: Rader med namn och geometri
        console.log('\n📊 Test 2: Rader med namn och geometri...');
        const { count: validCount, error: validError } = await supabase
            .from('water_bodies_integrated')
            .select('*', { count: 'exact', head: true })
            .not('name', 'is', null)
            .not('geometry', 'is', null);
            
        if (validError) {
            console.error('❌ Valid count error:', validError);
        } else {
            console.log(`   ✅ Med namn + geometri: ${validCount?.toLocaleString()} rader`);
        }
        
        // Test 3: Första 1000 med range
        console.log('\n📊 Test 3: Första 1000 med range...');
        const { data: firstBatch, error: firstError } = await supabase
            .from('water_bodies_integrated')
            .select('id, name')
            .not('name', 'is', null)
            .not('geometry', 'is', null)
            .range(0, 999)
            .order('id');
            
        if (firstError) {
            console.error('❌ First batch error:', firstError);
        } else {
            console.log(`   ✅ Första batch: ${firstBatch?.length} rader`);
            console.log(`   📊 ID range: ${firstBatch?.[0]?.id} - ${firstBatch?.[firstBatch.length-1]?.id}`);
        }
        
        // Test 4: Andra 1000 med range
        console.log('\n📊 Test 4: Andra 1000 med range...');
        const { data: secondBatch, error: secondError } = await supabase
            .from('water_bodies_integrated')
            .select('id, name')
            .not('name', 'is', null)
            .not('geometry', 'is', null)
            .range(1000, 1999)
            .order('id');
            
        if (secondError) {
            console.error('❌ Second batch error:', secondError);
        } else {
            console.log(`   ✅ Andra batch: ${secondBatch?.length} rader`);
            if (secondBatch && secondBatch.length > 0) {
                console.log(`   📊 ID range: ${secondBatch[0].id} - ${secondBatch[secondBatch.length-1].id}`);
            }
        }
        
        // Test 5: Utan limit/range
        console.log('\n📊 Test 5: Utan limit/range...');
        const { data: unlimitedData, error: unlimitedError } = await supabase
            .from('water_bodies_integrated')
            .select('id, name')
            .not('name', 'is', null)
            .not('geometry', 'is', null)
            .order('id');
            
        if (unlimitedError) {
            console.error('❌ Unlimited error:', unlimitedError);
        } else {
            console.log(`   ✅ Utan limit: ${unlimitedData?.length} rader`);
        }
        
        // Test 6: Max ID check
        console.log('\n📊 Test 6: Max ID check...');
        const { data: maxIdData, error: maxIdError } = await supabase
            .from('water_bodies_integrated')
            .select('id')
            .order('id', { ascending: false })
            .limit(1);
            
        if (maxIdError) {
            console.error('❌ Max ID error:', maxIdError);
        } else {
            console.log(`   ✅ Max ID: ${maxIdData?.[0]?.id}`);
        }
        
        // Test 7: Hämta från högre ID
        if (maxIdData?.[0]?.id) {
            const maxId = maxIdData[0].id;
            const highStartId = Math.floor(maxId * 0.8); // 80% genom databasen
            
            console.log(`\n📊 Test 7: Hämta från ID ${highStartId}...`);
            const { data: highIdData, error: highIdError } = await supabase
                .from('water_bodies_integrated')
                .select('id, name')
                .not('name', 'is', null)
                .not('geometry', 'is', null)
                .gte('id', highStartId)
                .order('id')
                .limit(1000);
                
            if (highIdError) {
                console.error('❌ High ID error:', highIdError);
            } else {
                console.log(`   ✅ Från högt ID: ${highIdData?.length} rader`);
            }
        }
        
        console.log('\n🎯 SLUTSATS:');
        console.log(`   📊 Total förväntad: ${totalCount?.toLocaleString()}`);
        console.log(`   📊 Valid (namn+geo): ${validCount?.toLocaleString()}`);
        console.log(`   📊 Faktiskt hämtad utan limit: ${unlimitedData?.length}`);
        
        if (unlimitedData && unlimitedData.length < 10000) {
            console.log('   ⚠️ PROBLEM: Supabase returnerar bara begränsat antal!');
            console.log('   💡 LÖSNING: Använd cursor-baserad pagination med ID');
        }
        
    } catch (error) {
        console.error('❌ Investigation failed:', error);
    }
}

// Kör investigation
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    investigateDatabase()
        .then(() => {
            console.log('\n✅ Investigation slutförd!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Investigation misslyckades:', error);
            process.exit(1);
        });
}