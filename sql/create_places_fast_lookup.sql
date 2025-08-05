-- KRITISK MATERIALIZED VIEW för water_bodies_with_places
-- EXAKT samma strategi som det gamla systemet!

-- 1. Skapa materialized view med förberäknade centroider
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup CASCADE;

CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup AS
SELECT 
    id,
    name,
    display_name,
    water_type,
    geometry,
    
    -- FÖRBERÄKNADE koordinater för blixtsnabb lookup (SAMMA som gamla systemet)
    ST_Y(ST_PointOnSurface(geometry)) as center_lat,
    ST_X(ST_PointOnSurface(geometry)) as center_lon,
    
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
    
    -- NYA KOLUMNER MED PLATSNAMN
    municipality,
    municipality_type,
    county,
    country,
    name_conflicts,
    disambiguation_method,
    administrative_source,
    
    -- SAMMA popularity score som gamla systemet
    CASE 
        WHEN area_km2 > 100 THEN 1000 + area_km2::INTEGER
        WHEN area_km2 > 10 THEN 500 + area_km2::INTEGER  
        WHEN area_km2 > 1 THEN 100 + area_km2::INTEGER
        ELSE 50
    END as popularity_score,
    
    lat, -- Behåll originella koordinater också
    lon

FROM water_bodies_with_places
WHERE name IS NOT NULL 
  AND geometry IS NOT NULL
  AND ST_IsValid(geometry) = true
ORDER BY area_km2 DESC NULLS LAST;

-- 2. ULTRA-SPECIALISERADE INDEX (EXAKT samma som gamla systemet)

-- HOT PATH: Kartklick bounding box med popularitet (MEST använda)
CREATE INDEX IF NOT EXISTS idx_places_fast_ultra_hot_clickable_waters 
ON water_bodies_with_places_fast_lookup (center_lat, center_lon, popularity_score DESC, area_km2 DESC)
WHERE popularity_score > 10 AND area_km2 > 0.1;

-- HOT PATH: Snabb name-lookup för sökning
CREATE INDEX IF NOT EXISTS idx_places_fast_ultra_hot_names 
ON water_bodies_with_places_fast_lookup (name text_pattern_ops, area_km2 DESC)
WHERE center_lat BETWEEN 55.0 AND 69.5 AND center_lon BETWEEN 10.0 AND 25.0 AND area_km2 > 0.5;

-- HOT PATH: Display name för UI-sökning
CREATE INDEX IF NOT EXISTS idx_places_fast_ultra_hot_display_names 
ON water_bodies_with_places_fast_lookup (display_name text_pattern_ops, area_km2 DESC)
WHERE area_km2 > 0.1;

-- HOT PATH: Visible map bounds med zoom-optimering
CREATE INDEX IF NOT EXISTS idx_places_fast_ultra_hot_map_bounds 
ON water_bodies_with_places_fast_lookup (center_lat, center_lon, area_km2 DESC)
WHERE area_km2 > 0.05; -- Bara vattendrag som syns på kartan

-- COVERING INDEX för snabba SELECT utan table lookups
CREATE INDEX IF NOT EXISTS idx_places_fast_covering_essentials 
ON water_bodies_with_places_fast_lookup (center_lat, center_lon) 
INCLUDE (id, name, display_name, water_type, area_km2, popularity_score, municipality, country)
WHERE name IS NOT NULL AND area_km2 > 0.1;

-- COMPOSITE INDEX för den exakta query-pattern vi använder
CREATE INDEX IF NOT EXISTS idx_places_fast_search_optimized 
ON water_bodies_with_places_fast_lookup (name text_pattern_ops, data_source, area_km2 DESC)
WHERE name IS NOT NULL AND geometry IS NOT NULL;

-- ANALYZE för att uppdatera query planner statistics
ANALYZE water_bodies_with_places_fast_lookup;