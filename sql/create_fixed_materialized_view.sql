-- SKAPA NY MATERIALIZED VIEW från fixade tabellen (utan dubletter)

-- 1. Ta bort gamla materialized view
DROP MATERIALIZED VIEW IF EXISTS water_bodies_merged_fast_lookup CASCADE;

-- 2. Skapa ny från fixade tabellen
CREATE MATERIALIZED VIEW water_bodies_merged_fast_lookup AS
SELECT * FROM water_bodies_merged_fixed
ORDER BY area_km2 DESC NULLS LAST;

-- 3. Återskapa alla index
CREATE INDEX IF NOT EXISTS idx_merged_fast_search_name 
ON water_bodies_merged_fast_lookup USING btree (name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_merged_fast_search_centroid
ON water_bodies_merged_fast_lookup USING btree (center_lat, center_lon);

CREATE INDEX IF NOT EXISTS idx_merged_fast_search_area
ON water_bodies_merged_fast_lookup USING btree (area_km2 DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_merged_fast_search_type
ON water_bodies_merged_fast_lookup USING btree (water_type);

CREATE INDEX IF NOT EXISTS idx_merged_fast_click_geometry
ON water_bodies_merged_fast_lookup USING gist (geometry);

-- 4. Uppdatera statistik
ANALYZE water_bodies_merged_fast_lookup;

-- 5. Testa att Vänern nu har unikt ID
SELECT 
    'VÄNERN UNIKT ID TEST' as test,
    id,
    name,
    country,
    area_km2
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%vänern%' 
  AND area_km2 > 1000
LIMIT 1;

-- 6. Verifiering av materialized view
SELECT 
    '✅ NY MATERIALIZED VIEW KLAR' as status,
    COUNT(*) as totala_rader,
    COUNT(DISTINCT id) as unika_ids,
    COUNT(*) FILTER (WHERE water_type = 'lake' AND country = 'SE') as svenska_sjöar
FROM water_bodies_merged_fast_lookup;