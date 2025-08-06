/**
 * Skapar EXAKT kopia av water_bodies_with_places som materialized view
 * Samma klustring, samma data, bara snabbare
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Ladda environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createExactMaterializedView(): Promise<void> {
    console.log('🔄 SKAPAR EXAKT KOPIA AV water_bodies_with_places...\n');
    
    try {
        console.log('📋 SQL som behöver köras i Supabase SQL Editor:');
        console.log('=' .repeat(60));
        
        const sql = fs.readFileSync('sql/create_exact_copy_materialized_view.sql', 'utf8');
        console.log(sql);
        
        console.log('=' .repeat(60));
        console.log('\n📝 INSTRUKTIONER:');
        console.log('1. Gå till Supabase Dashboard → SQL Editor');
        console.log('2. Kopiera och klistra in SQL:en ovan');
        console.log('3. Kör SQL:en');
        console.log('4. Kontrollera att VERIFICATION visar "PERFECT MATCH ✅"');
        console.log('5. Kontrollera att LAKE TEST visar rätt storlekar för Vänern/Vättern/Mälaren');
        
        console.log('\n⏱️ Efter att du kört SQL:en, testa prestanda:');
        console.log('npx tsx scripts/test_exact_materialized_view.ts');
        
    } catch (error) {
        console.error('❌ Fel vid läsning av SQL fil:', error);
    }
}

async function main(): Promise<void> {
    await createExactMaterializedView();
}

main();