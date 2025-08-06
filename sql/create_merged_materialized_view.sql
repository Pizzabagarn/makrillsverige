-- SKAPA MATERIALIZED VIEW från sammanslagda vattendrag
-- För snabb sökning med centroider + precis klick

-- 1. Fixa area-beräkningen först
UPDATE water_bodies_with_places_merged 
SET area_km2 = ST_Area(ST_Transform(geometry, 3857)) / 1000000.0  -- m² till km²
WHERE area_km2 = 0 OR area_km2 IS NULL;

-- 2. Skapa materialized view med förberäknade centroider för SÖK
DROP MATERIALIZED VIEW IF EXISTS water_bodies_merged_fast_lookup CASCADE;

CREATE MATERIALIZED VIEW water_bodies_merged_fast_lookup AS
SELECT 
    id,
    name,
    water_type,
    geometry,
    
    -- FÖRBERÄKNADE CENTROIDER för snabb SÖK
    ST_Y(ST_PointOnSurface(geometry)) as center_lat,
    ST_X(ST_PointOnSurface(geometry)) as center_lon,
    
    -- Behåll originella lat/lon också
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
    
    -- Sammanslagning-data
    original_segment_ids,
    merge_group_id,
    has_natural_gaps,
    merge_method,
    segments_merged
    
FROM water_bodies_with_places_merged
WHERE geometry IS NOT NULL 
  AND name IS NOT NULL
ORDER BY area_km2 DESC NULLS LAST;

-- 3. INDEX för snabb SÖK (med centroider)
CREATE INDEX IF NOT EXISTS idx_merged_fast_search_name 
ON water_bodies_merged_fast_lookup USING btree (name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_merged_fast_search_centroid
ON water_bodies_merged_fast_lookup USING btree (center_lat, center_lon);

CREATE INDEX IF NOT EXISTS idx_merged_fast_search_area
ON water_bodies_merged_fast_lookup USING btree (area_km2 DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_merged_fast_search_type
ON water_bodies_merged_fast_lookup USING btree (water_type);

-- 4. INDEX för precis KLICK (utan centroider)
CREATE INDEX IF NOT EXISTS idx_merged_fast_click_geometry
ON water_bodies_merged_fast_lookup USING gist (geometry);

-- 5. Uppdatera statistik
ANALYZE water_bodies_merged_fast_lookup;

-- 6. Verifiering
SELECT 
    '✅ MATERIALIZED VIEW SKAPAD' as status,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
    COUNT(*) FILTER (WHERE segments_merged > 1) as merged_waterways,
    COUNT(*) FILTER (WHERE segments_merged = 1) as single_segments,
    AVG(area_km2) FILTER (WHERE area_km2 > 0) as avg_area_km2
FROM water_bodies_merged_fast_lookup;

-- Visa förbättrade area-värden
SELECT 
    'AREA FIXA RESULTAT' as info,
    name,
    segments_merged,
    ROUND(area_km2::NUMERIC, 3) as area_km2
FROM water_bodies_merged_fast_lookup 
WHERE segments_merged > 1 
  AND area_km2 > 0
ORDER BY area_km2 DESC 
LIMIT 10;