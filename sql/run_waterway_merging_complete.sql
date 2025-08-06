-- KOMPLETT VATTENDRAG-SAMMANSLAGNING
-- Kör dessa i ordning i Supabase SQL Editor

-- STEG 1: SÄKERHETSKOPIA (om du inte redan kört den)
-- =====================================================
DROP TABLE IF EXISTS water_bodies_with_places_backup CASCADE;
CREATE TABLE water_bodies_with_places_backup AS 
SELECT * FROM water_bodies_with_places;

DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup_backup CASCADE;
CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup_backup AS
SELECT * FROM water_bodies_with_places_fast_lookup;

-- STEG 2: ANALYSVY OCH HJÄLPFUNKTIONER
-- =====================================
CREATE OR REPLACE VIEW waterway_segments_analysis AS
SELECT 
    name,
    water_type,
    municipality,
    COUNT(*) as segment_count,
    ST_XMin(ST_Extent(geometry)) as min_lon,
    ST_XMax(ST_Extent(geometry)) as max_lon,
    ST_YMin(ST_Extent(geometry)) as min_lat,
    ST_YMax(ST_Extent(geometry)) as max_lat,
    SUM(COALESCE(area_km2, 0)) as total_area_km2
FROM water_bodies_with_places_fast_lookup
WHERE water_type IN ('river', 'stream') 
  AND name IS NOT NULL
  AND municipality IS NOT NULL
  AND ST_IsValid(geometry) = true
GROUP BY name, water_type, municipality
HAVING COUNT(*) > 1
ORDER BY segment_count DESC;

-- STEG 3: AVSTÅNDSFUNKTION
-- =========================
CREATE OR REPLACE FUNCTION calculate_segment_distance(
    geom1 GEOMETRY,
    geom2 GEOMETRY
) RETURNS NUMERIC AS $$
BEGIN
    RETURN ST_Distance(
        ST_Transform(geom1, 3857),
        ST_Transform(geom2, 3857)
    ) / 1000.0;
END;
$$ LANGUAGE plpgsql;

-- STEG 4: GAP-SÄKER GRUPPERING (VIKTIGASTE FUNKTIONEN)
-- ====================================================
CREATE OR REPLACE FUNCTION group_waterway_segments_no_gaps(
    waterway_name TEXT,
    waterway_type TEXT,
    municipality_name TEXT
) RETURNS TABLE(
    group_id INTEGER,
    segment_ids BIGINT[],
    merged_geometry GEOMETRY,
    total_segments INTEGER,
    has_gaps BOOLEAN
) AS $$
DECLARE
    segment_record RECORD;
    current_group_id INTEGER := 1;
    max_distance_km NUMERIC := 5.0;
BEGIN
    CREATE TEMP TABLE temp_segment_groups_no_gaps (
        segment_id BIGINT,
        geometry GEOMETRY,
        group_id INTEGER,
        processed BOOLEAN DEFAULT FALSE
    );
    
    INSERT INTO temp_segment_groups_no_gaps (segment_id, geometry)
    SELECT id, geometry 
    FROM water_bodies_with_places_fast_lookup
    WHERE name = waterway_name
      AND water_type = waterway_type  
      AND municipality = municipality_name
      AND ST_IsValid(geometry) = true
      AND geometry IS NOT NULL;
    
    FOR segment_record IN 
        SELECT segment_id, geometry FROM temp_segment_groups_no_gaps WHERE NOT processed
    LOOP
        UPDATE temp_segment_groups_no_gaps 
        SET group_id = current_group_id, processed = TRUE
        WHERE segment_id = segment_record.segment_id;
        
        UPDATE temp_segment_groups_no_gaps 
        SET group_id = current_group_id, processed = TRUE
        WHERE NOT processed 
          AND calculate_segment_distance(geometry, segment_record.geometry) <= max_distance_km;
        
        current_group_id := current_group_id + 1;
    END LOOP;
    
    RETURN QUERY
    SELECT 
        g.group_id,
        array_agg(g.segment_id) as segment_ids,
        ST_Union(g.geometry) as merged_geometry,  -- ST_Union förhindrar gap-klick
        COUNT(*)::INTEGER as total_segments,
        ST_GeometryType(ST_Union(g.geometry)) LIKE '%MULTI%' as has_gaps
    FROM temp_segment_groups_no_gaps g
    WHERE g.group_id IS NOT NULL
    GROUP BY g.group_id
    ORDER BY total_segments DESC;
    
    DROP TABLE temp_segment_groups_no_gaps;
END;
$$ LANGUAGE plpgsql;

-- STEG 5: SKAPA SAMMANSLAGEN TABELL
-- ==================================
DROP TABLE IF EXISTS water_bodies_with_places_merged CASCADE;

CREATE TABLE water_bodies_with_places_merged AS
SELECT * FROM water_bodies_with_places_fast_lookup WHERE 1=0;

ALTER TABLE water_bodies_with_places_merged 
ADD COLUMN IF NOT EXISTS original_segment_ids BIGINT[],
ADD COLUMN IF NOT EXISTS merge_group_id INTEGER,
ADD COLUMN IF NOT EXISTS has_natural_gaps BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS merge_method TEXT DEFAULT 'proximity_5km',
ADD COLUMN IF NOT EXISTS segments_merged INTEGER DEFAULT 1;

-- STEG 6: HUVUDFUNKTION FÖR SAMMANSLAGNING
-- =========================================
CREATE OR REPLACE FUNCTION create_merged_waterways_final()
RETURNS TEXT AS $$
DECLARE
    waterway_record RECORD;
    group_record RECORD;
    new_id BIGINT;
    merged_count INTEGER := 0;
    kept_singles INTEGER := 0;
BEGIN
    DELETE FROM water_bodies_with_places_merged;
    
    -- Kopiera sjöar rakt av
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
    
    -- Slå ihop vattendrag
    FOR waterway_record IN 
        SELECT DISTINCT name, water_type, municipality
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL 
          AND municipality IS NOT NULL
    LOOP
        FOR group_record IN 
            SELECT * FROM group_waterway_segments_no_gaps(
                waterway_record.name, 
                waterway_record.water_type, 
                waterway_record.municipality
            )
        LOOP
            INSERT INTO water_bodies_with_places_merged (
                id, name, water_type, municipality, geometry,
                lat, lon, area_km2, data_source, source_priority,
                depth_mean, depth_max, volume_m3, ecological_status,
                cluster_size, cluster_method, osm_id, osm_type,
                fishing_regulations, water_quality_status, region,
                water_district, tags, metadata_source, county, country,
                display_name,
                original_segment_ids, merge_group_id, has_natural_gaps,
                merge_method, segments_merged
            )
            SELECT 
                nextval(pg_get_serial_sequence('water_bodies_with_places_merged', 'id')),
                waterway_record.name || ' (' || waterway_record.municipality || ')',  -- Enkelt namn
                waterway_record.water_type,
                waterway_record.municipality,
                group_record.merged_geometry,
                ST_Y(ST_Centroid(group_record.merged_geometry)),
                ST_X(ST_Centroid(group_record.merged_geometry)),
                (SELECT SUM(COALESCE(area_km2, 0)) 
                 FROM water_bodies_with_places_fast_lookup 
                 WHERE id = ANY(group_record.segment_ids)),
                data_source, source_priority, depth_mean, depth_max, 
                volume_m3, ecological_status, cluster_size, cluster_method,
                osm_id, osm_type, fishing_regulations, water_quality_status,
                region, water_district, tags, metadata_source, county, country,
                waterway_record.name || ' (' || waterway_record.municipality || ')',  -- Display name
                group_record.segment_ids, group_record.group_id, group_record.has_gaps,
                'proximity_5km_no_gaps', group_record.total_segments
            FROM water_bodies_with_places_fast_lookup
            WHERE id = group_record.segment_ids[1]
            LIMIT 1;
            
            merged_count := merged_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN format('✅ Sammanslagning klar! %s grupperade vattendrag', merged_count);
END;
$$ LANGUAGE plpgsql;

-- STEG 7: KÖR SAMMANSLAGNINGEN
-- =============================
SELECT create_merged_waterways_final() as result;

-- STEG 8: RESULTAT OCH VERIFIERING
-- =================================
SELECT 
    '🎯 SAMMANSLAGNING RESULTAT' as info,
    COUNT(*) as total_waterways,
    COUNT(*) FILTER (WHERE segments_merged > 1) as merged_waterways,
    COUNT(*) FILTER (WHERE has_natural_gaps = TRUE) as waterways_with_gaps,
    COUNT(*) FILTER (WHERE water_type = 'lake') as lakes_kept,
    SUM(segments_merged) as original_segments_total
FROM water_bodies_with_places_merged;

-- Visa exempel på sammanslagda vattendrag
SELECT 
    '📋 EXEMPEL SAMMANSLAGDA VATTENDRAG' as info,
    name,
    segments_merged,
    has_natural_gaps,
    merge_method
FROM water_bodies_with_places_merged 
WHERE segments_merged > 1 
ORDER BY segments_merged DESC 
LIMIT 10;