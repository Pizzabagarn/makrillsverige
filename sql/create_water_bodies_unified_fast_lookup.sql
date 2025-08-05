-- PRESTANDA-OPTIMERAD MATERIALIZED VIEW för water_bodies_unified
-- Använder EXAKT samma strategi som water_bodies_fast_lookup
-- Ger blixtsnabb klick-prestanda på sammansatta vattendrag

-- 1. Skapa materialized view med förberäknade centroider
DROP MATERIALIZED VIEW IF EXISTS water_bodies_unified_fast_lookup CASCADE;

CREATE MATERIALIZED VIEW water_bodies_unified_fast_lookup AS
SELECT 
    id,
    name, -- För VISS-kompatibilitet
    display_name, -- För UI-visning
    search_terms, -- För smart sökning
    municipality,
    water_type,
    geometry,
    
    -- FÖRBERÄKNADE koordinater för blixtsnabb lookup (SAMMA som nuvarande system)
    ST_Y(ST_PointOnSurface(geometry)) as center_lat,
    ST_X(ST_PointOnSurface(geometry)) as center_lon,
    
    total_area_km2,
    total_length_km,
    original_segment_count,
    unification_method,
    is_split_section,
    data_source,
    source_priority,
    
    -- Enhanced data för VISS-kompatibilitet
    depth_mean,
    depth_max,
    volume_m3,
    ecological_status,
    fishing_regulations,
    water_quality_status,
    region,
    tags,
    
    -- SAMMA popularity score som nuvarande system
    CASE 
        WHEN total_area_km2 > 10 THEN 100
        WHEN total_area_km2 > 1 THEN 50
        WHEN water_type = 'lake' THEN 30
        ELSE 10
    END as popularity_score,
    
    created_at,
    updated_at
FROM water_bodies_unified
WHERE name IS NOT NULL 
  AND geometry IS NOT NULL
ORDER BY total_area_km2 DESC NULLS LAST;

-- 2. ULTRA-SPECIALISERADE INDEX för extremt snabba hot paths
-- Kopierat från er nuvarande ultra_specialized_indexes.sql

-- HOT PATH: Kartklick bounding box med popularitet (MEST använda)
CREATE INDEX IF NOT EXISTS idx_unified_ultra_hot_clickable_waters 
ON water_bodies_unified_fast_lookup (center_lat, center_lon, popularity_score DESC, total_area_km2 DESC)
WHERE popularity_score > 10 AND total_area_km2 > 0.1;

-- HOT PATH: Snabb name-lookup för VISS preloading
CREATE INDEX IF NOT EXISTS idx_unified_ultra_hot_names 
ON water_bodies_unified_fast_lookup (name text_pattern_ops, total_area_km2 DESC)
WHERE center_lat BETWEEN 55.0 AND 69.5 AND center_lon BETWEEN 10.0 AND 25.0 AND total_area_km2 > 0.5;

-- HOT PATH: Display name för UI-sökning
CREATE INDEX IF NOT EXISTS idx_unified_ultra_hot_display_names 
ON water_bodies_unified_fast_lookup (display_name text_pattern_ops, total_area_km2 DESC)
WHERE total_area_km2 > 0.1;

-- HOT PATH: Visible map bounds med zoom-optimering
CREATE INDEX IF NOT EXISTS idx_unified_ultra_hot_map_bounds 
ON water_bodies_unified_fast_lookup (center_lat, center_lon, total_area_km2 DESC)
WHERE total_area_km2 > 0.05; -- Bara vattendrag som syns på kartan

-- HOT PATH: Popular water bodies för snabb cache-seeding
CREATE INDEX IF NOT EXISTS idx_unified_ultra_hot_popular_waters 
ON water_bodies_unified_fast_lookup (popularity_score DESC, total_area_km2 DESC, center_lat, center_lon)
WHERE popularity_score > 30;

-- COVERING INDEX för snabba SELECT utan table lookups
CREATE INDEX IF NOT EXISTS idx_unified_covering_essentials 
ON water_bodies_unified_fast_lookup (center_lat, center_lon) 
INCLUDE (id, name, display_name, water_type, total_area_km2, popularity_score)
WHERE name IS NOT NULL AND total_area_km2 > 0.1;

-- FULL-TEXT SEARCH för smart sökning ("Höje å lun" → "Höje å (Lund)")
CREATE INDEX IF NOT EXISTS idx_unified_search_fulltext 
ON water_bodies_unified_fast_lookup USING GIN (to_tsvector('swedish', search_terms));

-- GIN INDEX för snabba tag-queries (om vi använder dem)
CREATE INDEX IF NOT EXISTS idx_unified_gin_tags 
ON water_bodies_unified_fast_lookup USING GIN (tags)
WHERE tags IS NOT NULL;

-- 3. Auto-refresh trigger för att hålla materialized view uppdaterad
CREATE OR REPLACE FUNCTION refresh_unified_fast_lookup()
RETURNS TRIGGER AS $$
BEGIN
    -- Asynkron refresh för att inte blockera
    PERFORM pg_notify('refresh_materialized_view', 'water_bodies_unified_fast_lookup');
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger för auto-refresh vid ändringar i huvudtabellen
DROP TRIGGER IF EXISTS trigger_refresh_unified_fast_lookup ON water_bodies_unified;
CREATE TRIGGER trigger_refresh_unified_fast_lookup
    AFTER INSERT OR UPDATE OR DELETE ON water_bodies_unified
    FOR EACH STATEMENT EXECUTE FUNCTION refresh_unified_fast_lookup();

-- 4. Unik index på ID för prestanda
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_fast_lookup_id 
ON water_bodies_unified_fast_lookup (id);

-- 5. Kombinerat index för filtrerad koordinat-sökning
CREATE INDEX IF NOT EXISTS idx_unified_coords_popular 
ON water_bodies_unified_fast_lookup (center_lat, center_lon, popularity_score DESC, total_area_km2 DESC);

-- Water type för snabb filtering
CREATE INDEX IF NOT EXISTS idx_unified_fast_lookup_type 
ON water_bodies_unified_fast_lookup (water_type);

-- Data source prioritering
CREATE INDEX IF NOT EXISTS idx_unified_fast_lookup_source 
ON water_bodies_unified_fast_lookup (data_source, source_priority);

-- Kommentarer
COMMENT ON MATERIALIZED VIEW water_bodies_unified_fast_lookup IS 'Ultra-snabb lookup för sammansatta vattendrag - samma prestanda som nuvarande system';

-- Initial refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY water_bodies_unified_fast_lookup;