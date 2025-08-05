-- KRITISKA INDEX för snabb sökning i water_bodies_with_places
-- Baserat på det gamla systemets optimeringar

-- 1. SNABB NAME SEARCH med text_pattern_ops (för ILIKE queries)
CREATE INDEX IF NOT EXISTS idx_places_name_search 
ON water_bodies_with_places (name text_pattern_ops, area_km2 DESC)
WHERE name IS NOT NULL AND area_km2 > 0.1;

-- 2. SNABB DISPLAY_NAME SEARCH (våra nya disambiguerade namn)
CREATE INDEX IF NOT EXISTS idx_places_display_name_search 
ON water_bodies_with_places (display_name text_pattern_ops, area_km2 DESC)
WHERE display_name IS NOT NULL AND area_km2 > 0.1;

-- 3. BOUNDING BOX INDEX för geografisk filtrering (lat/lon)
CREATE INDEX IF NOT EXISTS idx_places_bounds_optimized 
ON water_bodies_with_places (lat, lon, area_km2 DESC)
WHERE name IS NOT NULL AND area_km2 > 0.1;

-- 4. COVERING INDEX för snabba SELECT utan table lookups
CREATE INDEX IF NOT EXISTS idx_places_covering_essentials 
ON water_bodies_with_places (lat, lon) 
INCLUDE (id, name, display_name, water_type, area_km2, data_source, country, municipality)
WHERE name IS NOT NULL AND area_km2 > 0.1;

-- 5. DATA_SOURCE prioritering (SMHI först)
CREATE INDEX IF NOT EXISTS idx_places_source_priority 
ON water_bodies_with_places (data_source, area_km2 DESC, name)
WHERE name IS NOT NULL;

-- 6. COMPOSITE INDEX för den exakta query-pattern vi använder
CREATE INDEX IF NOT EXISTS idx_places_search_optimized 
ON water_bodies_with_places (name text_pattern_ops, data_source, area_km2 DESC)
WHERE name IS NOT NULL AND geometry IS NOT NULL;

-- 7. FULL-TEXT SEARCH för framtida smart sökning
CREATE INDEX IF NOT EXISTS idx_places_fulltext_search 
ON water_bodies_with_places USING GIN (to_tsvector('swedish', COALESCE(display_name, name)));

-- ANALYZE för att uppdatera query planner statistics
ANALYZE water_bodies_with_places;