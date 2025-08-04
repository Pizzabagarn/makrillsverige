-- Simple PostGIS function for exact geometry hit testing
-- Checks if click point is INSIDE any water body geometry

-- Drop existing function first
DROP FUNCTION IF EXISTS find_water_body_containing_point(NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION find_water_body_containing_point(
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
  depth_mean NUMERIC,
  depth_max NUMERIC,
  volume_m3 NUMERIC,
  ecological_status TEXT,
  cluster_size INTEGER,
  cluster_method TEXT,
  segment_count INTEGER,
  unification_method TEXT
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
    w.depth_mean,
    w.depth_max,
    w.volume_m3,
    w.ecological_status,
    w.cluster_size,
    w.cluster_method,
    w.segment_count,
    w.unification_method
  FROM smhi_water_bodies_lake_unified w
  WHERE w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    AND w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY 
    -- Prioritize lakes over streams when multiple geometries contain the point
    CASE w.water_type
      WHEN 'lake' THEN 1000
      WHEN 'river' THEN 500
      WHEN 'stream' THEN 100
      ELSE 300
    END DESC,
    -- Then by cluster size (larger clusters are more significant)
    COALESCE(w.cluster_size, 1) DESC,
    -- Finally by calculated area (larger areas first)
    ST_Area(ST_Transform(w.geometry, 3857)) DESC
  LIMIT 5; -- Only return top 5 matches to keep it fast
END;
$$ LANGUAGE plpgsql;