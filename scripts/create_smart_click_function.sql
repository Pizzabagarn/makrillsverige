-- PostGIS function for smart water body click detection with area calculation
-- This will prioritize lakes by their actual calculated area

CREATE OR REPLACE FUNCTION get_water_bodies_by_coordinates_with_area(
  click_lat NUMERIC,
  click_lon NUMERIC, 
  search_radius_deg NUMERIC,
  max_results INTEGER DEFAULT 20
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
  calculated_area_km2 NUMERIC,
  distance_km NUMERIC,
  smart_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
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
      -- Calculate actual area from geometry (transform to Web Mercator for accurate calculation)
      ST_Area(ST_Transform(w.geometry, 3857)) / 1000000.0 AS calculated_area_km2,
      -- Calculate distance in km
      ST_Distance(
        ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857),
        ST_Transform(ST_Centroid(w.geometry), 3857)
      ) / 1000.0 AS distance_km
    FROM smhi_water_bodies_smart_clustered w
    WHERE w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
      AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
      AND w.geometry IS NOT NULL
      AND w.name IS NOT NULL
  ),
  scored_candidates AS (
    SELECT c.*,
      -- SMART SCORING SYSTEM
      CASE
        -- 1. Check if click point is inside geometry (highest priority)
        WHEN ST_Contains(c.geometry, ST_Point(click_lon, click_lat, 4326)) THEN 10000
        ELSE 0
      END +
      -- 2. Water type priority (lakes > rivers > streams)  
      CASE c.water_type
        WHEN 'lake' THEN 1000
        WHEN 'river' THEN 500
        WHEN 'stream' THEN 100
        ELSE 300
      END +
      -- 3. Area bonus (larger areas get higher priority)
      LEAST(c.calculated_area_km2 * 10, 2000) +
      -- 4. Cluster size bonus (larger clusters are more significant)
      (COALESCE(c.cluster_size, 1) * 20) +
      -- 5. Proximity bonus (closer is better, but not dominating)
      GREATEST(0, 500 - c.distance_km * 10) +
      -- 6. Precision bonus for very close clicks (< 200m)
      CASE WHEN c.distance_km < 0.2 THEN 300 ELSE 0 END
      AS smart_score
    FROM candidates c
    WHERE c.distance_km <= (search_radius_deg * 111.32) -- Convert degrees to km for filtering
  )
  SELECT 
    sc.id,
    sc.name,
    sc.water_type,
    sc.geometry,
    sc.lat,
    sc.lon,
    sc.area_km2,
    sc.depth_mean,
    sc.depth_max,
    sc.volume_m3,
    sc.ecological_status,
    sc.cluster_size,
    sc.cluster_method,
    sc.calculated_area_km2,
    sc.distance_km,
    sc.smart_score
  FROM scored_candidates sc
  ORDER BY 
    smart_score DESC, -- Highest score first
    calculated_area_km2 DESC, -- Then by area (for ties)
    distance_km ASC -- Finally by distance
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Test the function with example coordinates
SELECT 
  name, 
  water_type, 
  calculated_area_km2, 
  distance_km, 
  smart_score 
FROM get_water_bodies_by_coordinates_with_area(58.95, 14.25, 0.05, 10)
ORDER BY smart_score DESC;