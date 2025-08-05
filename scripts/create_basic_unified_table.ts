#!/usr/bin/env ts-node

/**
 * Skapar grundläggande water_bodies_unified tabell
 * Enkelt och säkert via direkta SQL-kommandon
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables
const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function createBasicUnifiedTable(): Promise<void> {
    console.log('🏗️ Skapar grundläggande water_bodies_unified tabell...');
    
    try {
        // Enkel CREATE TABLE via PostgreSQL
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS water_bodies_unified (
                id BIGSERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                display_name TEXT NOT NULL,
                search_terms TEXT NOT NULL,
                municipality TEXT,
                geometry GEOMETRY,
                lat DOUBLE PRECISION,
                lon DOUBLE PRECISION,
                total_area_km2 NUMERIC,
                total_length_km NUMERIC,
                original_segment_count INTEGER DEFAULT 1,
                original_segment_ids BIGINT[],
                unification_method TEXT,
                gap_handling TEXT,
                is_split_section BOOLEAN DEFAULT FALSE,
                split_parent_name TEXT,
                split_section_order INTEGER,
                water_type TEXT,
                data_source TEXT,
                source_priority INTEGER,
                depth_mean NUMERIC,
                depth_max NUMERIC,
                volume_m3 NUMERIC,
                ecological_status TEXT,
                fishing_regulations JSONB,
                water_quality_status TEXT,
                region TEXT,
                tags JSONB,
                processing_notes TEXT,
                disambiguation_source TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;
        
        // Använd PostgreSQL raw query via från ('from' är tom tabell som alltid finns)
        const { error: createError } = await supabase
            .rpc('exec', { sql: createTableSql })
            .then(() => ({ error: null }))
            .catch(() => {
                // Fallback: Använd dummy SELECT för att få PostgreSQL-connection och kör CREATE TABLE
                return supabase.from('pg_tables').select('tablename').limit(1).then(() => {
                    // Detta kommer inte att fungera direkt, men det testar connection
                    throw new Error('Need direct SQL execution');
                });
            });
        
        console.log('   ✅ Grundtabell skapad (eller finns redan)');
        
        // Testa att tabellen finns genom att försöka läsa den
        const { data, error } = await supabase
            .from('water_bodies_unified')
            .select('id')
            .limit(1);
            
        if (error) {
            console.log('   ❌ Tabell kunde inte verifieras:', error.message);
            
            // För Windows/Supabase, skriv ut SQL för manuell körning
            console.log('\n📋 KÖR DENNA SQL MANUELLT I SUPABASE:');
            console.log('1. Gå till https://supabase.com/dashboard/project/[your-project]/sql');
            console.log('2. Kör följande SQL:');
            console.log('\n' + '='.repeat(60));
            console.log(createTableSql);
            console.log('='.repeat(60));
            
            return;
        }
        
        console.log('   ✅ Tabell verifierad och fungerar!');
        
        // Kolla hur många rader som finns
        const { count } = await supabase
            .from('water_bodies_unified')
            .select('*', { count: 'exact', head: true });
            
        console.log(`   📊 Aktuella rader: ${count || 0}`);
        
        // Kolla också water_bodies_integrated
        const { count: originalCount } = await supabase
            .from('water_bodies_integrated')
            .select('*', { count: 'exact', head: true });
            
        console.log(`   📊 water_bodies_integrated: ${originalCount?.toLocaleString()} rader (opåverkad)`);
        
        console.log('\n🎉 GRUNDTABELL REDO!');
        console.log('Nu kan du köra processing: npm run process-unified-waterways');
        
    } catch (error) {
        console.error('❌ Fel vid tabell-skapande:', error);
        
        console.log('\n📋 MANUELL SKAPELSE:');
        console.log('1. Gå till Supabase Dashboard → SQL Editor');
        console.log('2. Skapa tabellen manuellt med sql/create_water_bodies_unified.sql');
        console.log('3. Kör sedan processing');
    }
}

// Kör endast om filen körs direkt
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    createBasicUnifiedTable()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('❌ Script failed:', error);
            process.exit(1);
        });
}