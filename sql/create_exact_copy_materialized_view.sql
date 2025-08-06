-- EXAKT KOPIA av water_bodies_with_places som materialized view
-- SAMMA klustring, SAMMA data, bara snabbare med index

-- 1. Ta bort den felaktiga materialized view
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup CASCADE;

-- 2. Skapa EXAKT kopia av water_bodies_with_places
CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup AS
SELECT 
    -- ALLA kolumner från water_bodies_with_places - EXAKT som de är
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
    administrative_source

FROM water_bodies_with_places
-- INGEN filtrering - ta ALLT precis som det är
ORDER BY area_km2 DESC NULLS LAST;

-- 3. Skapa index för snabb sökning (samma som du hade tidigare)
CREATE INDEX IF NOT EXISTS idx_places_fast_name_ilike 
ON water_bodies_with_places_fast_lookup USING btree (name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_places_fast_area_sort 
ON water_bodies_with_places_fast_lookup USING btree (area_km2 DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_places_fast_data_source_sort 
ON water_bodies_with_places_fast_lookup USING btree (data_source, area_km2 DESC);

CREATE INDEX IF NOT EXISTS idx_places_fast_lat_lon_bounds 
ON water_bodies_with_places_fast_lookup USING btree (lat, lon);

CREATE INDEX IF NOT EXISTS idx_places_fast_display_name 
ON water_bodies_with_places_fast_lookup USING btree (display_name text_pattern_ops)
WHERE display_name IS NOT NULL;

-- 4. Index för geometry (om det behövs för klick-funktioner)
CREATE INDEX IF NOT EXISTS idx_places_fast_geometry_gist 
ON water_bodies_with_places_fast_lookup USING gist (geometry);

-- 5. Uppdatera statistik
ANALYZE water_bodies_with_places_fast_lookup;

-- 6. Verifiering - ska visa EXAKT samma antal rader
SELECT 
  'VERIFICATION' as test,
  (SELECT COUNT(*) FROM water_bodies_with_places) as original_count,
  (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) as materialized_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM water_bodies_with_places) = (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) 
    THEN 'PERFECT MATCH ✅' 
    ELSE 'MISMATCH ❌' 
  END as status;

-- 7. Testa att stora sjöar finns med rätt storlek
SELECT 
  'LAKE TEST' as test,
  name, 
  area_km2,
  'from materialized view' as source
FROM water_bodies_with_places_fast_lookup 
WHERE name ILIKE '%vänern%' OR name ILIKE '%vättern%' OR name ILIKE '%mälaren%'
ORDER BY area_km2 DESC;