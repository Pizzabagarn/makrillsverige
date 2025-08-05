-- PostGIS function for water body click detection with place names
-- Uses water_bodies_with_places table with disambiguation

DROP FUNCTION IF EXISTS find_water_body_with_places_containing_point(NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION find_water_body_with_places_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS TABLE(
  id BIGINT,
  name TEXT,
  water_type TEXT,
  geometry GEOMETRY,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  area_km2 NUMERIC,
  data_source TEXT,
  source_priority INTEGER,
  original_id BIGINT,
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
  fishing_regulations JSONB,
  water_quality_status TEXT,
  region TEXT,
  water_district TEXT,
  tags JSONB,
  metadata_source TEXT,
  -- NYA KOLUMNER MED PLATSNAMN
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
    w.id,
    w.name,
    w.water_type,
    w.geometry,
    w.lat,
    w.lon,
    w.area_km2,
    w.data_source,
    w.source_priority,
    w.original_id,
    w.depth_mean,
    w.depth_max,
    w.volume_m3,
    w.ecological_status,
    w.segment_count,
    w.unification_method,
    w.cluster_size,
    w.cluster_method,
    w.osm_id,
    w.osm_type,
    w.fishing_regulations,
    w.water_quality_status,
    w.region,
    w.water_district,
    w.tags,
    w.metadata_source,
    -- NYA KOLUMNER MED PLATSNAMN
    w.municipality,
    w.municipality_type,
    w.county,
    w.country,
    w.display_name,
    w.name_conflicts,
    w.disambiguation_method,
    w.administrative_source
  FROM water_bodies_with_places w
  WHERE w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    AND w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    -- 1. Prioritize SMHI lakes (highest quality)
    CASE 
      WHEN w.data_source = 'SMHI' AND w.water_type = 'lake' THEN 1
      WHEN w.water_type = 'lake' THEN 2
      WHEN w.water_type = 'river' THEN 3
      WHEN w.water_type = 'stream' THEN 4
      ELSE 5
    END,
    -- 2. Source priority (1 = primary choice)
    w.source_priority ASC,
    -- 3. Area size (larger water bodies first)
    ST_Area(ST_Transform(w.geometry, 3857)) DESC,
    -- 4. Distance to click point
    ST_Distance(
      ST_Transform(ST_Centroid(w.geometry), 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) ASC
  LIMIT 5; -- Return top 5 candidates for frontend filtering
END;
$$ LANGUAGE plpgsql;

-- Kommentar
COMMENT ON FUNCTION find_water_body_with_places_containing_point(NUMERIC, NUMERIC, NUMERIC) 
IS 'Hittar vattendrag med platsnamn som innehåller klick-punkt. Samma logik som find_hybrid_water_body_containing_point men med disambiguation.';