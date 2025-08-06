-- FIXA SAKNAD PostGIS-funktion för sammanslagda vattendrag
-- Kör detta direkt i Supabase

-- 1. Kolla om funktionen finns
SELECT 
    'FUNKTION CHECK' as test,
    EXISTS(
        SELECT 1 FROM pg_proc 
        WHERE proname = 'find_merged_water_body_containing_point'
    ) as function_exists;

-- 2. Skapa funktionen (enklare version först)
CREATE OR REPLACE FUNCTION find_merged_water_body_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS TABLE(
  id BIGINT,
  name TEXT,
  water_type TEXT,
  geometry GEOMETRY,
  lat NUMERIC,
  lon NUMERIC,
  area_km2 NUMERIC,
  data_source TEXT,
  source_priority INTEGER,
  original_id TEXT,
  depth_mean NUMERIC,
  depth_max NUMERIC,
  volume_m3 NUMERIC,
  ecological_status TEXT,
  segment_count INTEGER,
  unification_method TEXT,
  cluster_size INTEGER,
  cluster_method TEXT,
  osm_id BIGINT,
  osm_type TEXT,
  fishing_regulations TEXT,
  water_quality_status TEXT,
  region TEXT,
  water_district TEXT,
  tags JSONB,
  metadata_source TEXT,
  municipality TEXT,
  municipality_type TEXT,
  county TEXT,
  country TEXT,
  display_name TEXT,
  name_conflicts INTEGER,
  disambiguation_method TEXT,
  administrative_source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id, w.name, w.water_type, w.geometry, w.lat, w.lon, w.area_km2,
    w.data_source, w.source_priority, w.original_id, w.depth_mean, w.depth_max,
    w.volume_m3, w.ecological_status, w.segment_count, w.unification_method,
    w.cluster_size, w.cluster_method, w.osm_id, w.osm_type, w.fishing_regulations,
    w.water_quality_status, w.region, w.water_district, w.tags, w.metadata_source,
    w.municipality, w.municipality_type, w.county, w.country, w.display_name,
    w.name_conflicts, w.disambiguation_method, w.administrative_source
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- PRECIS KLICK: Bara ST_Contains
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    -- Prioritera sjöar, sedan area
    CASE 
      WHEN w.water_type = 'lake' THEN 1
      WHEN w.water_type = 'river' THEN 2
      WHEN w.water_type = 'stream' THEN 3
      ELSE 4
    END,
    w.area_km2 DESC NULLS LAST
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- 3. Testa funktionen
SELECT 
    'FUNKTION TEST' as test,
    COUNT(*) as result_count
FROM find_merged_water_body_containing_point(55.6, 13.0, 0.02);

SELECT 'FUNKTION FIXAD ✅' as status;