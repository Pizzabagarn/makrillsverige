-- SKAPA BARA MATERIALIZED VIEW (utan komplext setup)
-- Kör detta efter att water_bodies_unified är populerad

-- Skapa materialized view
DROP MATERIALIZED VIEW IF EXISTS water_bodies_unified_fast_lookup CASCADE;

CREATE MATERIALIZED VIEW water_bodies_unified_fast_lookup AS
SELECT 
    id,
    name,
    display_name,
    search_terms,
    municipality,
    water_type,
    geometry,
    
    -- Förberäknade koordinater för snabb lookup
    ST_Y(ST_PointOnSurface(geometry)) as center_lat,
    ST_X(ST_PointOnSurface(geometry)) as center_lon,
    
    total_area_km2,
    total_length_km,
    original_segment_count,
    unification_method,
    is_split_section,
    data_source,
    source_priority,
    
    -- Popularity score för sortering (samma som gamla systemet)
    CASE 
        WHEN total_area_km2 > 100 THEN 1000 + total_area_km2::INTEGER
        WHEN total_area_km2 > 10 THEN 500 + total_area_km2::INTEGER  
        WHEN total_area_km2 > 1 THEN 100 + total_area_km2::INTEGER
        ELSE 50
    END as popularity_score,
    
    lat,
    lon,
    depth_max,
    ecological_status,
    region,
    tags,
    created_at,
    updated_at

FROM water_bodies_unified
WHERE ST_IsValid(geometry) = true;

-- ULTRA-SPECIALIZED INDEXES (samma som gamla systemet)
CREATE INDEX idx_unified_ultra_hot_clickable_waters 
ON water_bodies_unified_fast_lookup (center_lat, center_lon, popularity_score DESC, total_area_km2 DESC);

CREATE INDEX idx_unified_search_fulltext 
ON water_bodies_unified_fast_lookup USING GIN (to_tsvector('swedish', search_terms));

CREATE INDEX idx_unified_display_name 
ON water_bodies_unified_fast_lookup (display_name text_pattern_ops);

CREATE INDEX idx_unified_name_original 
ON water_bodies_unified_fast_lookup (name text_pattern_ops);

CREATE INDEX idx_unified_bounds_optimized 
ON water_bodies_unified_fast_lookup (center_lat, center_lon) 
WHERE total_area_km2 > 0.1;

-- Auto-refresh trigger (för framtida uppdateringar)
CREATE OR REPLACE FUNCTION refresh_unified_fast_lookup()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW water_bodies_unified_fast_lookup;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER unified_refresh_trigger
    AFTER INSERT OR UPDATE OR DELETE ON water_bodies_unified
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_unified_fast_lookup();

-- Ge statistik
SELECT 
    'MATERIALIZED VIEW SKAPAD' as status,
    COUNT(*) as total_rows,
    COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
    COUNT(*) FILTER (WHERE water_type IN ('river', 'stream')) as rivers,
    AVG(total_area_km2) as avg_area
FROM water_bodies_unified_fast_lookup;