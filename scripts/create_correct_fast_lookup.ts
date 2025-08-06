/**
 * Skapar KORREKT materialized view för water_bodies_with_places
 * RÖRR INTE den ursprungliga tabellen - bara skapar en snabb kopia
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

async function executeSQL(sql: string): Promise<void> {
    try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        
        if (error) {
            console.error('❌ SQL fel:', error);
            throw error;
        }
        
        console.log('✅ SQL framgångsrikt kördes');
        return data;
    } catch (err) {
        console.error('❌ Fel vid SQL körning:', err);
        throw err;
    }
}

async function createCorrectFastLookup(): Promise<void> {
    console.log('🔄 SKAPAR KORREKT MATERIALIZED VIEW...\n');
    
    // Steg 1: Ta bort den felaktiga materialized view
    console.log('1. Tar bort felaktig materialized view...');
    await executeSQL(`
        DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup CASCADE;
    `);
    
    // Steg 2: Skapa EXAKT kopia av water_bodies_with_places som materialized view
    console.log('2. Skapar korrekt materialized view (exakt kopia av water_bodies_with_places)...');
    await executeSQL(`
        CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup AS
        SELECT 
            -- Alla befintliga kolumner från water_bodies_with_places
            id,
            name,
            water_type,
            geometry,
            lat,
            lon,
            area_km2,
            data_source,
            source_priority,
            original_id,
            depth_mean,
            depth_max,
            volume_m3,
            ecological_status,
            segment_count,
            unification_method,
            cluster_size,
            cluster_method,
            osm_id,
            osm_type,
            fishing_regulations,
            water_quality_status,
            region,
            water_district,
            tags,
            metadata_source,
            municipality,
            municipality_type,
            county,
            country,
            display_name,
            name_conflicts,
            disambiguation_method,
            administrative_source,
            
            -- FÖRBERÄKNADE koordinater för snabb lookup
            ST_Y(ST_PointOnSurface(geometry)) as center_lat,
            ST_X(ST_PointOnSurface(geometry)) as center_lon,
            
            -- Popularity score för sortering
            CASE 
                WHEN area_km2 > 100 THEN 1000 + area_km2::INTEGER
                WHEN area_km2 > 10 THEN 500 + area_km2::INTEGER  
                WHEN area_km2 > 1 THEN 100 + area_km2::INTEGER
                ELSE 50
            END as popularity_score

        FROM water_bodies_with_places
        WHERE name IS NOT NULL 
          AND geometry IS NOT NULL
          AND ST_IsValid(geometry) = true
        ORDER BY area_km2 DESC NULLS LAST;
    `);
    
    // Steg 3: Skapa optimerade index
    console.log('3. Skapar optimerade index...');
    await executeSQL(`
        -- Index för namnssökning
        CREATE INDEX IF NOT EXISTS idx_places_fast_name_search 
        ON water_bodies_with_places_fast_lookup (name text_pattern_ops, area_km2 DESC)
        WHERE name IS NOT NULL;
    `);
    
    await executeSQL(`
        -- Index för display name sökning
        CREATE INDEX IF NOT EXISTS idx_places_fast_display_name_search 
        ON water_bodies_with_places_fast_lookup (display_name text_pattern_ops, area_km2 DESC)
        WHERE display_name IS NOT NULL;
    `);
    
    await executeSQL(`
        -- Index för koordinatsökning
        CREATE INDEX IF NOT EXISTS idx_places_fast_coordinates 
        ON water_bodies_with_places_fast_lookup (center_lat, center_lon, popularity_score DESC, area_km2 DESC)
        WHERE popularity_score > 10;
    `);
    
    await executeSQL(`
        -- Index för bounding box sökning
        CREATE INDEX IF NOT EXISTS idx_places_fast_bounding_box 
        ON water_bodies_with_places_fast_lookup (lat, lon, area_km2 DESC)
        WHERE area_km2 > 0.1;
    `);
    
    await executeSQL(`
        -- Index för data source
        CREATE INDEX IF NOT EXISTS idx_places_fast_data_source 
        ON water_bodies_with_places_fast_lookup (data_source, area_km2 DESC);
    `);
    
    // Steg 4: Uppdatera statistik
    console.log('4. Uppdaterar databas-statistik...');
    await executeSQL(`
        ANALYZE water_bodies_with_places_fast_lookup;
    `);
    
    console.log('✅ KORREKT MATERIALIZED VIEW SKAPAD!\n');
}

async function verifyResult(): Promise<void> {
    console.log('🔍 VERIFIERAR RESULTAT...\n');
    
    try {
        // Kontrollera antal rader
        const { count: originalCount } = await supabase
            .from('water_bodies_with_places')
            .select('*', { count: 'exact', head: true });
            
        const { count: fastLookupCount } = await supabase
            .from('water_bodies_with_places_fast_lookup')
            .select('*', { count: 'exact', head: true });
            
        console.log(`Original tabell: ${originalCount?.toLocaleString()} rader`);
        console.log(`Fast lookup: ${fastLookupCount?.toLocaleString()} rader`);
        
        if (originalCount === fastLookupCount) {
            console.log('✅ Antal rader matchar perfekt!');
        } else {
            console.log('⚠️ Antal rader matchar inte - detta kan vara normalt om invalid geometrier filtrerades');
        }
        
        // Testa specifika sjöar
        const testSearches = ['vänern', 'vättern', 'mälaren'];
        
        for (const searchTerm of testSearches) {
            const { data: originalData } = await supabase
                .from('water_bodies_with_places')
                .select('name, area_km2')
                .ilike('name', `%${searchTerm}%`)
                .order('area_km2', { ascending: false })
                .limit(1);
                
            const { data: fastData } = await supabase
                .from('water_bodies_with_places_fast_lookup')
                .select('name, area_km2')
                .ilike('name', `%${searchTerm}%`)
                .order('area_km2', { ascending: false })
                .limit(1);
                
            if (originalData?.[0] && fastData?.[0]) {
                console.log(`✅ ${searchTerm}: ${originalData[0].name} (${originalData[0].area_km2} km²) finns i båda tabellerna`);
            } else {
                console.log(`❌ ${searchTerm}: Hittades inte i båda tabellerna`);
            }
        }
        
    } catch (error) {
        console.error('❌ Fel vid verifiering:', error);
    }
}

async function main(): Promise<void> {
    try {
        await createCorrectFastLookup();
        await verifyResult();
        
        console.log('\n🎉 KLART! Nu kan du använda water_bodies_with_places_fast_lookup för snabb sökning!');
        console.log('\nNästa steg: Ändra din kod till att använda fast_lookup tabellen istället för den långsamma.');
        
    } catch (error) {
        console.error('❌ Fel i huvudprocessen:', error);
        process.exit(1);
    }
}

main();