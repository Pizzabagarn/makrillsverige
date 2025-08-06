/**
 * Enkel lösning: Använd Supabase client för att köra SQL bit för bit
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Ladda environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createCorrectMaterializedView(): Promise<void> {
    console.log('🔄 SKAPAR KORREKT MATERIALIZED VIEW...\n');
    
    try {
        // Först, testa att vi kan komma åt tabellen
        console.log('1. Testar åtkomst till water_bodies_with_places...');
        const { count, error: testError } = await supabase
            .from('water_bodies_with_places')
            .select('*', { count: 'exact', head: true });
            
        if (testError) {
            console.error('❌ Kan inte komma åt water_bodies_with_places:', testError);
            return;
        }
        
        console.log(`✅ water_bodies_with_places har ${count?.toLocaleString()} rader`);
        
        // Kontrollera om fast_lookup redan finns
        console.log('2. Kontrollerar befintlig fast_lookup...');
        const { count: fastCount, error: fastError } = await supabase
            .from('water_bodies_with_places_fast_lookup')
            .select('*', { count: 'exact', head: true });
            
        if (!fastError) {
            console.log(`✅ water_bodies_with_places_fast_lookup finns redan med ${fastCount?.toLocaleString()} rader`);
            console.log('📋 Materialized view verkar redan finnas. Testar prestanda...');
            
            // Testa prestanda på befintlig fast_lookup
            const testSearches = ['vänern', 'vättern', 'mälaren'];
            
            for (const searchTerm of testSearches) {
                console.log(`🔍 Testar sökning: "${searchTerm}"`);
                
                const start = Date.now();
                const { data, error } = await supabase
                    .from('water_bodies_with_places_fast_lookup')
                    .select('name, area_km2, display_name')
                    .ilike('name', `%${searchTerm}%`)
                    .order('area_km2', { ascending: false })
                    .limit(3);
                const time = Date.now() - start;
                
                if (error) {
                    console.log(`   ❌ Fel: ${error.message}`);
                } else {
                    console.log(`   ✅ ${time}ms, ${data?.length || 0} resultat`);
                    if (data && data.length > 0) {
                        console.log(`      Bästa träff: ${data[0].name} (${data[0].area_km2} km²)`);
                    }
                }
            }
            
            console.log('\n🤔 Om prestanda fortfarande är dålig, kan det vara att koden använder fel tabell.');
            console.log('💡 Nästa steg: Kontrollera att din kod använder water_bodies_with_places_fast_lookup');
            
        } else {
            console.log('❌ water_bodies_with_places_fast_lookup finns inte');
            console.log('💡 Du behöver skapa materialized view manuellt i Supabase Dashboard');
            console.log('\n📋 SQL att köra i Supabase SQL Editor:');
            console.log(`
-- KORREKT MATERIALIZED VIEW för water_bodies_with_places
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup CASCADE;

CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup AS
SELECT 
    *,
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

-- INDEX för snabb sökning
CREATE INDEX IF NOT EXISTS idx_places_fast_name_search 
ON water_bodies_with_places_fast_lookup (name text_pattern_ops, area_km2 DESC);

CREATE INDEX IF NOT EXISTS idx_places_fast_coordinates 
ON water_bodies_with_places_fast_lookup (center_lat, center_lon, popularity_score DESC);

ANALYZE water_bodies_with_places_fast_lookup;
            `);
        }
        
    } catch (error) {
        console.error('❌ Fel:', error);
    }
}

async function main(): Promise<void> {
    await createCorrectMaterializedView();
}

main();