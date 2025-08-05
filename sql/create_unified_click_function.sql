-- SQL-funktion för exakt klick-detektering på unified waterways
-- Använder ST_Contains() för att hitta vattendraget som innehåller klick-punkten
-- VIKTIGT: ST_Collect()-geometrier är klickbara på ALLA delar!

DROP FUNCTION IF EXISTS find_unified_water_body_containing_point(NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION find_unified_water_body_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC, 
  search_radius_deg NUMERIC
)
RETURNS TABLE(
  id BIGINT,
  name TEXT,
  display_name TEXT,
  search_terms TEXT,
  municipality TEXT,
  water_type TEXT,
  geometry GEOMETRY,
  center_lat DOUBLE PRECISION,
  center_lon DOUBLE PRECISION,
  total_area_km2 NUMERIC,
  total_length_km NUMERIC,
  original_segment_count INTEGER,
  unification_method TEXT,
  is_split_section BOOLEAN,
  data_source TEXT,
  source_priority INTEGER,
  popularity_score INTEGER,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  depth_max NUMERIC,
  ecological_status TEXT,
  region TEXT,
  tags JSONB,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.name,
    w.display_name,
    w.search_terms,
    w.municipality,
    w.water_type,
    w.geometry,
    w.center_lat,
    w.center_lon,
    w.total_area_km2,
    w.total_length_km,
    w.original_segment_count,
    w.unification_method,
    w.is_split_section,
    w.data_source,
    w.source_priority,
    w.popularity_score,
    w.lat,
    w.lon,
    w.depth_max,
    w.ecological_status,
    w.region,
    w.tags,
    w.created_at,
    w.updated_at
  FROM water_bodies_unified_fast_lookup w
  WHERE w.center_lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.center_lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    AND w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- KRITISK: ST_Contains gör att HELA ST_Collect()-geometrin är klickbar!
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY 
    -- Prioritera sjöar framför åar
    CASE w.water_type
      WHEN 'lake' THEN 1000
      WHEN 'river' THEN 500
      WHEN 'stream' THEN 100
      ELSE 300
    END DESC,
    -- Sen efter storlek
    w.popularity_score DESC,
    w.total_area_km2 DESC,
    -- Slutligen efter avstånd till centroiden
    ST_Distance(
      ST_Transform(ST_Centroid(w.geometry), 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) ASC
  LIMIT 5; -- Returnera max 5 träffar
END;
$$ LANGUAGE plpgsql;

-- Kommentar
COMMENT ON FUNCTION find_unified_water_body_containing_point(NUMERIC, NUMERIC, NUMERIC) 
IS 'Hittar unified waterway som innehåller klick-punkt. ST_Collect()-geometrier är klickbara överallt!';