-- PostGIS function for tolerant large lake click detection
-- Uses ST_DWithin for better click tolerance on complex large lake geometries

CREATE OR REPLACE FUNCTION find_large_lakes_near_point(
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
    AND w.water_type = 'lake'
    -- Focus on large lakes (>500 km²) - these need tolerant clicking
    AND ST_Area(ST_Transform(w.geometry, 3857)) > 500000000  -- 500 km² in m²
    -- Use larger bounding box for tolerant clicking on large lakes
    AND (
      ST_DWithin(
        w.geometry, 
        ST_Point(click_lon, click_lat, 4326), 
        search_radius_deg  -- Use full search radius for large lakes
      ) OR
      -- Additional tolerance: click within expanded bounding box
      ST_DWithin(
        ST_Envelope(w.geometry),
        ST_Point(click_lon, click_lat, 4326),
        search_radius_deg * 1.5  -- Even more tolerant for bounding box
      )
    )
  ORDER BY 
    -- Prioritize by calculated area (largest lakes first)
    ST_Area(ST_Transform(w.geometry, 3857)) DESC,
    -- Then by distance to click point
    ST_Distance(
      ST_Transform(ST_Centroid(w.geometry), 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) ASC
  LIMIT 3; -- Only return top 3 large lakes
END;
$$ LANGUAGE plpgsql;