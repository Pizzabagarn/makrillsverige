-- ULTRA-SPECIALISERADE INDEX för extremt snabba hot paths
-- SUPABASE-VERSION (utan VACUUM som ger fel i SQL Editor)

-- 1. HOT PATH: Kartklick bounding box med popularitet
-- Detta är den absolut vanligaste queryn
CREATE INDEX IF NOT EXISTS idx_ultra_hot_clickable_waters 
ON water_bodies_fast_lookup (center_lat, center_lon, popularity_score DESC, area_km2 DESC)
WHERE popularity_score > 10 AND area_km2 > 0.1;

-- 2. HOT PATH: Snabb name-lookup för VISS preloading
CREATE INDEX IF NOT EXISTS idx_ultra_hot_swedish_names 
ON water_bodies_fast_lookup (name text_pattern_ops, area_km2 DESC)
WHERE center_lat BETWEEN 55.0 AND 69.5 AND center_lon BETWEEN 10.0 AND 25.0 AND area_km2 > 0.5;

-- 3. HOT PATH: Visible map bounds med zoom-optimering
CREATE INDEX IF NOT EXISTS idx_ultra_hot_map_bounds 
ON water_bodies_fast_lookup (center_lat, center_lon, area_km2 DESC)
WHERE area_km2 > 0.05; -- Bara sjöar som syns på kartan

-- 4. HOT PATH: Popular water bodies för snabb cache-seeding
CREATE INDEX IF NOT EXISTS idx_ultra_hot_popular_waters 
ON water_bodies_fast_lookup (popularity_score DESC, area_km2 DESC, center_lat, center_lon)
WHERE popularity_score > 30;

-- 5. COVERING INDEX för snabba SELECT utan table lookups
CREATE INDEX IF NOT EXISTS idx_covering_water_essentials 
ON water_bodies_fast_lookup (center_lat, center_lon) 
INCLUDE (id, name, water_type, area_km2, popularity_score)
WHERE name IS NOT NULL AND area_km2 > 0.1;

-- 6. PARTIAL INDEX för svenska VISS-vattendrag (hot path för SMHI data)
CREATE INDEX IF NOT EXISTS idx_swedish_viss_waters 
ON water_bodies_fast_lookup (name, area_km2 DESC)
WHERE center_lat BETWEEN 55.0 AND 69.5 
  AND center_lon BETWEEN 10.0 AND 25.0 
  AND area_km2 > 1.0 
  AND name IS NOT NULL;

-- 7. GIN INDEX för snabba tag-queries (om vi använder dem)
CREATE INDEX IF NOT EXISTS idx_gin_tags 
ON water_bodies_fast_lookup USING GIN (tags)
WHERE tags IS NOT NULL;

-- 8. EXPRESSSION INDEX för distance-beräkningar (PostgreSQL 12+)
-- Förberäknad "searchability score" för ännu snabbare queries
CREATE INDEX IF NOT EXISTS idx_searchability_score 
ON water_bodies_fast_lookup ((popularity_score * sqrt(area_km2))) 
WHERE area_km2 > 0.1;

-- 9. CLUSTERED STORAGE för bättre disk I/O
-- Organisera data fysiskt efter koordinater för snabbare spatial queries
CLUSTER water_bodies_fast_lookup USING idx_fast_lookup_coords;

-- 10. Uppdatera statistik för optimala query plans
ANALYZE water_bodies_fast_lookup;

-- KOMMENTARER för dokumentation
COMMENT ON INDEX idx_ultra_hot_clickable_waters IS 'KRITISK: Kartklick bounding box med popularitet - absolut vanligaste queryn';
COMMENT ON INDEX idx_ultra_hot_swedish_names IS 'HOT: VISS preloading för svenska sjöar';
COMMENT ON INDEX idx_ultra_hot_map_bounds IS 'HOT: Synliga vattendrag i map bounds';
COMMENT ON INDEX idx_covering_water_essentials IS 'COVERING: Alla essentiella fält för att undvika table lookups';
COMMENT ON INDEX idx_searchability_score IS 'EXPRESSION: Förberäknad sökbarhet för smart prioritering';