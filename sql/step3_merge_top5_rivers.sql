-- STEG 3: Slå samman TOP 5 mest fragmenterade rivers (kör flera gånger)
-- BARA 5 åt gången för att undvika timeout!

-- Visa vilka som blir processade
WITH top_fragmented AS (
  SELECT name, COUNT(*) as segments
  FROM water_bodies_integrated
  WHERE water_type IN ('river', 'stream')
    AND ST_IsValid(geometry) = true 
    AND name IS NOT NULL 
    AND name != ''
    -- Endast de som INTE redan finns i unified tabellen
    AND name NOT IN (
      SELECT DISTINCT name FROM water_bodies_unified 
      WHERE water_type IN ('river', 'stream')
    )
  GROUP BY name 
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC
  LIMIT 5
)
SELECT 'WILL PROCESS THESE 5 RIVERS:' as info, name, segments 
FROM top_fragmented;

-- Processera TOP 5 med geografisk klustring
WITH top_5_rivers AS (
  SELECT name
  FROM water_bodies_integrated
  WHERE water_type IN ('river', 'stream')
    AND ST_IsValid(geometry) = true 
    AND name IS NOT NULL 
    AND name != ''
    AND name NOT IN (
      SELECT DISTINCT name FROM water_bodies_unified 
      WHERE water_type IN ('river', 'stream')
    )
  GROUP BY name 
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC
  LIMIT 5
),

rivers_with_clusters AS (
  SELECT 
    w.id, w.name, w.water_type, w.geometry, w.lat, w.lon, 
    w.area_km2, w.depth_max, w.data_source,
    ST_ClusterDBSCAN(w.geometry, 5000, 1) OVER (PARTITION BY w.name) as cluster_id
  FROM water_bodies_integrated w
  INNER JOIN top_5_rivers t5 ON w.name = t5.name
  WHERE ST_IsValid(w.geometry) = true
),

cluster_summary AS (
  SELECT 
    name, cluster_id,
    COUNT(*) as segment_count,
    ARRAY_AGG(id ORDER BY area_km2 DESC NULLS LAST) as segment_ids,
    ST_Collect(geometry ORDER BY area_km2 DESC NULLS LAST) as unified_geometry,
    SUM(COALESCE(area_km2, 0)) as total_area,
    MAX(COALESCE(depth_max, 0)) as max_depth,
    STRING_AGG(DISTINCT data_source, ', ') as combined_sources,
    MIN(water_type) as water_type
  FROM rivers_with_clusters
  GROUP BY name, cluster_id
)

INSERT INTO water_bodies_unified (
  name, display_name, search_terms, geometry, lat, lon,
  total_area_km2, depth_max, original_segment_count, original_segment_ids,
  unification_method, water_type, data_source, processing_notes, is_split_section
)
SELECT 
  name,
  name as display_name,
  name as search_terms,
  unified_geometry,
  ST_Y(ST_PointOnSurface(unified_geometry)),
  ST_X(ST_PointOnSurface(unified_geometry)),
  total_area,
  max_depth,
  segment_count,
  segment_ids,
  'geographic_cluster_merge',
  water_type,
  combined_sources,
  CONCAT('Merged ', segment_count, ' segments (5km clustering)'),
  false
FROM cluster_summary
WHERE unified_geometry IS NOT NULL;

-- Visa resultat och återstående
SELECT 
  'STEP 3 BATCH COMPLETE' as status,
  COUNT(*) FILTER (WHERE processing_notes LIKE '%Merged%') as rivers_merged_this_batch,
  (SELECT COUNT(*) FROM water_bodies_unified) as total_waters_so_far
FROM water_bodies_unified;

-- Visa hur många multi-segment rivers som är kvar
SELECT 
  'REMAINING MULTI-SEGMENT RIVERS' as status,
  COUNT(DISTINCT name) as remaining_to_process
FROM water_bodies_integrated
WHERE water_type IN ('river', 'stream')
  AND ST_IsValid(geometry) = true 
  AND name IS NOT NULL 
  AND name != ''
  AND name NOT IN (
    SELECT DISTINCT name FROM water_bodies_unified 
    WHERE water_type IN ('river', 'stream')
  )
GROUP BY name 
HAVING COUNT(*) > 1;