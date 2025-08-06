-- SKAPA NY TABELL för sammanslagda vattendrag
-- Behåller gap men grupperar logiskt sammanhängande vattendrag

-- 1. Skapa tabell för sammanslagda vattendrag
CREATE TABLE IF NOT EXISTS water_bodies_with_places_merged AS
SELECT * FROM water_bodies_with_places_fast_lookup WHERE 1=0; -- Samma struktur, ingen data

-- Lägg till extra kolumner för sammanslagning
ALTER TABLE water_bodies_with_places_merged 
ADD COLUMN IF NOT EXISTS original_segment_ids BIGINT[],
ADD COLUMN IF NOT EXISTS merge_group_id INTEGER,
ADD COLUMN IF NOT EXISTS has_natural_gaps BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS merge_method TEXT DEFAULT 'proximity_5km',
ADD COLUMN IF NOT EXISTS segments_merged INTEGER DEFAULT 1;

-- 2. Funktion för att skapa sammanslagda vattendrag
CREATE OR REPLACE FUNCTION create_merged_waterways()
RETURNS TEXT AS $$
DECLARE
    waterway_record RECORD;
    group_record RECORD;
    new_id BIGINT;
    merged_count INTEGER := 0;
    kept_singles INTEGER := 0;
BEGIN
    -- Rensa tabellen först
    DELETE FROM water_bodies_with_places_merged;
    
    -- Kopiera sjöar rakt av (ingen sammanslagning)
    INSERT INTO water_bodies_with_places_merged (
        SELECT *, 
               ARRAY[id] as original_segment_ids,
               1 as merge_group_id,
               FALSE as has_natural_gaps,
               'no_merge_lake' as merge_method,
               1 as segments_merged
        FROM water_bodies_with_places_fast_lookup 
        WHERE water_type = 'lake'
    );
    
    -- Hantera varje unikt vattendrag (namn + typ + kommun)
    FOR waterway_record IN 
        SELECT DISTINCT name, water_type, municipality
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL 
          AND municipality IS NOT NULL
    LOOP
        -- Gruppera segment för detta vattendrag
        FOR group_record IN 
            SELECT * FROM group_waterway_segments(
                waterway_record.name, 
                waterway_record.water_type, 
                waterway_record.municipality
            )
        LOOP
            -- Skapa nytt sammanslagt vattendrag
            new_id := nextval('water_bodies_with_places_merged_id_seq');
            
            INSERT INTO water_bodies_with_places_merged (
                id, name, water_type, municipality, geometry,
                -- Kopiera data från första segmentet
                lat, lon, area_km2, data_source, source_priority,
                depth_mean, depth_max, volume_m3, ecological_status,
                cluster_size, cluster_method, osm_id, osm_type,
                fishing_regulations, water_quality_status, region,
                water_district, tags, metadata_source, county, country,
                -- Uppdatera display_name med antal segment
                display_name,
                -- Sammanslagning-specifika fält
                original_segment_ids,
                merge_group_id,
                has_natural_gaps,
                merge_method,
                segments_merged
            )
            SELECT 
                new_id,
                -- Enkelt namn utan segment-info
                name || ' (' || municipality || ')',
                water_type,
                municipality,
                group_record.merged_geometry,  -- ST_Collect med gap
                
                -- Använd centroid av merged geometry
                ST_Y(ST_Centroid(group_record.merged_geometry)),
                ST_X(ST_Centroid(group_record.merged_geometry)),
                
                -- Summera area från alla segment
                (SELECT SUM(COALESCE(area_km2, 0)) 
                 FROM water_bodies_with_places_fast_lookup 
                 WHERE id = ANY(group_record.segment_ids)),
                
                -- Ta från första segmentet
                data_source, source_priority, depth_mean, depth_max, 
                volume_m3, ecological_status, cluster_size, cluster_method,
                osm_id, osm_type, fishing_regulations, water_quality_status,
                region, water_district, tags, metadata_source, county, country,
                
                -- Display name - enkelt utan segment-info
                name || ' (' || municipality || ')',
                
                -- Sammanslagning-data
                group_record.segment_ids,
                group_record.group_id,
                group_record.has_gaps,
                CASE 
                    WHEN group_record.total_segments > 1 THEN 'proximity_5km_with_gaps'
                    ELSE 'single_segment'
                END,
                group_record.total_segments
                
            FROM water_bodies_with_places_fast_lookup
            WHERE id = group_record.segment_ids[1]  -- Ta data från första segmentet
            LIMIT 1;
            
            merged_count := merged_count + 1;
        END LOOP;
    END LOOP;
    
    -- Hantera enstaka segment som inte grupperades
    INSERT INTO water_bodies_with_places_merged (
        SELECT *,
               ARRAY[id] as original_segment_ids,
               1 as merge_group_id, 
               FALSE as has_natural_gaps,
               'single_segment' as merge_method,
               1 as segments_merged
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND id NOT IN (
              SELECT unnest(original_segment_ids) 
              FROM water_bodies_with_places_merged 
              WHERE original_segment_ids IS NOT NULL
          )
    );
    
    GET DIAGNOSTICS kept_singles = ROW_COUNT;
    
    RETURN format('Sammanslagning klar! %s grupperade vattendrag, %s enstaka segment', 
                  merged_count, kept_singles);
END;
$$ LANGUAGE plpgsql;

-- 3. Test och verifiering
SELECT create_merged_waterways() as result;

-- Visa resultat
SELECT 
    'SAMMANSLAGNING RESULTAT' as info,
    COUNT(*) as total_waterways,
    COUNT(*) FILTER (WHERE segments_merged > 1) as merged_waterways,
    COUNT(*) FILTER (WHERE has_natural_gaps = TRUE) as waterways_with_gaps,
    SUM(segments_merged) as original_segments_total
FROM water_bodies_with_places_merged;
-- Behåller gap men grupperar logiskt sammanhängande vattendrag

-- 1. Skapa tabell för sammanslagda vattendrag
CREATE TABLE IF NOT EXISTS water_bodies_with_places_merged AS
SELECT * FROM water_bodies_with_places_fast_lookup WHERE 1=0; -- Samma struktur, ingen data

-- Lägg till extra kolumner för sammanslagning
ALTER TABLE water_bodies_with_places_merged 
ADD COLUMN IF NOT EXISTS original_segment_ids BIGINT[],
ADD COLUMN IF NOT EXISTS merge_group_id INTEGER,
ADD COLUMN IF NOT EXISTS has_natural_gaps BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS merge_method TEXT DEFAULT 'proximity_5km',
ADD COLUMN IF NOT EXISTS segments_merged INTEGER DEFAULT 1;

-- 2. Funktion för att skapa sammanslagda vattendrag
CREATE OR REPLACE FUNCTION create_merged_waterways()
RETURNS TEXT AS $$
DECLARE
    waterway_record RECORD;
    group_record RECORD;
    new_id BIGINT;
    merged_count INTEGER := 0;
    kept_singles INTEGER := 0;
BEGIN
    -- Rensa tabellen först
    DELETE FROM water_bodies_with_places_merged;
    
    -- Kopiera sjöar rakt av (ingen sammanslagning)
    INSERT INTO water_bodies_with_places_merged (
        SELECT *, 
               ARRAY[id] as original_segment_ids,
               1 as merge_group_id,
               FALSE as has_natural_gaps,
               'no_merge_lake' as merge_method,
               1 as segments_merged
        FROM water_bodies_with_places_fast_lookup 
        WHERE water_type = 'lake'
    );
    
    -- Hantera varje unikt vattendrag (namn + typ + kommun)
    FOR waterway_record IN 
        SELECT DISTINCT name, water_type, municipality
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL 
          AND municipality IS NOT NULL
    LOOP
        -- Gruppera segment för detta vattendrag
        FOR group_record IN 
            SELECT * FROM group_waterway_segments(
                waterway_record.name, 
                waterway_record.water_type, 
                waterway_record.municipality
            )
        LOOP
            -- Skapa nytt sammanslagt vattendrag
            new_id := nextval('water_bodies_with_places_merged_id_seq');
            
            INSERT INTO water_bodies_with_places_merged (
                id, name, water_type, municipality, geometry,
                -- Kopiera data från första segmentet
                lat, lon, area_km2, data_source, source_priority,
                depth_mean, depth_max, volume_m3, ecological_status,
                cluster_size, cluster_method, osm_id, osm_type,
                fishing_regulations, water_quality_status, region,
                water_district, tags, metadata_source, county, country,
                -- Uppdatera display_name med antal segment
                display_name,
                -- Sammanslagning-specifika fält
                original_segment_ids,
                merge_group_id,
                has_natural_gaps,
                merge_method,
                segments_merged
            )
            SELECT 
                new_id,
                -- Enkelt namn utan segment-info
                name || ' (' || municipality || ')',
                water_type,
                municipality,
                group_record.merged_geometry,  -- ST_Collect med gap
                
                -- Använd centroid av merged geometry
                ST_Y(ST_Centroid(group_record.merged_geometry)),
                ST_X(ST_Centroid(group_record.merged_geometry)),
                
                -- Summera area från alla segment
                (SELECT SUM(COALESCE(area_km2, 0)) 
                 FROM water_bodies_with_places_fast_lookup 
                 WHERE id = ANY(group_record.segment_ids)),
                
                -- Ta från första segmentet
                data_source, source_priority, depth_mean, depth_max, 
                volume_m3, ecological_status, cluster_size, cluster_method,
                osm_id, osm_type, fishing_regulations, water_quality_status,
                region, water_district, tags, metadata_source, county, country,
                
                -- Display name - enkelt utan segment-info
                name || ' (' || municipality || ')',
                
                -- Sammanslagning-data
                group_record.segment_ids,
                group_record.group_id,
                group_record.has_gaps,
                CASE 
                    WHEN group_record.total_segments > 1 THEN 'proximity_5km_with_gaps'
                    ELSE 'single_segment'
                END,
                group_record.total_segments
                
            FROM water_bodies_with_places_fast_lookup
            WHERE id = group_record.segment_ids[1]  -- Ta data från första segmentet
            LIMIT 1;
            
            merged_count := merged_count + 1;
        END LOOP;
    END LOOP;
    
    -- Hantera enstaka segment som inte grupperades
    INSERT INTO water_bodies_with_places_merged (
        SELECT *,
               ARRAY[id] as original_segment_ids,
               1 as merge_group_id, 
               FALSE as has_natural_gaps,
               'single_segment' as merge_method,
               1 as segments_merged
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND id NOT IN (
              SELECT unnest(original_segment_ids) 
              FROM water_bodies_with_places_merged 
              WHERE original_segment_ids IS NOT NULL
          )
    );
    
    GET DIAGNOSTICS kept_singles = ROW_COUNT;
    
    RETURN format('Sammanslagning klar! %s grupperade vattendrag, %s enstaka segment', 
                  merged_count, kept_singles);
END;
$$ LANGUAGE plpgsql;

-- 3. Test och verifiering
SELECT create_merged_waterways() as result;

-- Visa resultat
SELECT 
    'SAMMANSLAGNING RESULTAT' as info,
    COUNT(*) as total_waterways,
    COUNT(*) FILTER (WHERE segments_merged > 1) as merged_waterways,
    COUNT(*) FILTER (WHERE has_natural_gaps = TRUE) as waterways_with_gaps,
    SUM(segments_merged) as original_segments_total
FROM water_bodies_with_places_merged;