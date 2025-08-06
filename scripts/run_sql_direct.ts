/**
 * Kör SQL direkt mot Supabase via psql
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Ladda environment variables
dotenv.config({ path: '.env.local' });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('❌ DATABASE_URL saknas i .env.local');
    process.exit(1);
}

async function runSQL(): Promise<void> {
    console.log('🔄 SKAPAR KORREKT MATERIALIZED VIEW...\n');
    
    const sql = `
-- KORREKT MATERIALIZED VIEW för water_bodies_with_places
-- EXAKT samma data, bara med förberäknade koordinater och optimerade index

-- 1. Ta bort den felaktiga materialized view
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup CASCADE;

-- 2. Skapa ENKEL materialized view - exakt kopia av water_bodies_with_places
CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup AS
SELECT 
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
    
    -- FÖRBERÄKNADE koordinater för snabb lookup (samma som gamla systemet)
    ST_Y(ST_PointOnSurface(geometry)) as center_lat,
    ST_X(ST_PointOnSurface(geometry)) as center_lon,
    
    -- Popularity score för sortering (samma som gamla systemet)
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

-- 3. OPTIMERADE INDEX för snabb sökning
CREATE INDEX IF NOT EXISTS idx_places_fast_name_search 
ON water_bodies_with_places_fast_lookup (name text_pattern_ops, area_km2 DESC)
WHERE name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_places_fast_display_name_search 
ON water_bodies_with_places_fast_lookup (display_name text_pattern_ops, area_km2 DESC)
WHERE display_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_places_fast_coordinates 
ON water_bodies_with_places_fast_lookup (center_lat, center_lon, popularity_score DESC, area_km2 DESC)
WHERE popularity_score > 10;

CREATE INDEX IF NOT EXISTS idx_places_fast_bounding_box 
ON water_bodies_with_places_fast_lookup (lat, lon, area_km2 DESC)
WHERE area_km2 > 0.1;

CREATE INDEX IF NOT EXISTS idx_places_fast_data_source 
ON water_bodies_with_places_fast_lookup (data_source, area_km2 DESC);

-- 4. ANALYZE för att uppdatera statistik
ANALYZE water_bodies_with_places_fast_lookup;

-- 5. VERIFIERING
SELECT 
  'VERIFICATION' as test,
  COUNT(*) as total_entries,
  COUNT(*) FILTER (WHERE name ILIKE '%vänern%') as vanern_entries,
  COUNT(*) FILTER (WHERE name ILIKE '%vättern%') as vattern_entries,
  COUNT(*) FILTER (WHERE name ILIKE '%mälaren%') as malaren_entries
FROM water_bodies_with_places_fast_lookup;
`;

    // Skriv SQL till temporär fil
    const tempFile = 'temp_create_fast_lookup.sql';
    fs.writeFileSync(tempFile, sql);
    
    console.log('Kör SQL via psql...');
    
    return new Promise((resolve, reject) => {
        const psql = spawn('psql', [databaseUrl, '-f', tempFile], {
            stdio: 'inherit'
        });
        
        psql.on('close', (code) => {
            // Ta bort temporär fil
            fs.unlinkSync(tempFile);
            
            if (code === 0) {
                console.log('\n✅ SQL kördes framgångsrikt!');
                resolve();
            } else {
                console.error(`\n❌ psql avslutades med kod ${code}`);
                reject(new Error(`psql failed with code ${code}`));
            }
        });
        
        psql.on('error', (err) => {
            fs.unlinkSync(tempFile);
            console.error('❌ Fel vid körning av psql:', err);
            reject(err);
        });
    });
}

async function main(): Promise<void> {
    try {
        await runSQL();
        console.log('\n🎉 KLART! Nu kan du använda water_bodies_with_places_fast_lookup för snabb sökning!');
        
    } catch (error) {
        console.error('❌ Fel:', error);
        process.exit(1);
    }
}

main();