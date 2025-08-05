-- SÄKER strategi: Kopiera sjöar + geografisk klustring för åar
-- SLÅR INTE SAMMAN olika åar med samma namn!

TRUNCATE TABLE water_bodies_unified;

-- STEG 1: Kopiera ALLA sjöar (perfekta som de är)
INSERT INTO water_bodies_unified (
  name, display_name, search_terms, geometry, lat, lon,
  total_area_km2, depth_max, original_segment_count, original_segment_ids,
  unification_method, water_type, data_source, processing_notes, is_split_section
)
SELECT 
  name,
  name as display_name,
  name as search_terms,
  geometry,
  lat, lon,
  area_km2,
  depth_max,
  1,
  ARRAY[id],
  'direct_copy',
  water_type,
  data_source,
  'Lake copied directly - already perfect',
  false
FROM water_bodies_integrated
WHERE water_type = 'lake'
  AND ST_IsValid(geometry) = true 
  AND name IS NOT NULL 
  AND name != '';

-- STEG 2: GEOGRAFISK KLUSTRING för rivers/streams
-- Bara slå samman segment som är NÄRA varandra (samma 5km regel som OSM)
WITH rivers_with_clusters AS (
  SELECT 
    id, name, water_type, geometry, lat, lon, area_km2, depth_max, data_source,
    -- ST_ClusterDBSCAN: 5000m radius, minst 1 punkt per kluster
    ST_ClusterDBSCAN(geometry, 5000, 1) OVER (PARTITION BY name) as cluster_id
  FROM water_bodies_integrated
  WHERE water_type IN ('river', 'stream')
    AND ST_IsValid(geometry) = true 
    AND name IS NOT NULL 
    AND name != ''
),

-- Räkna segment per kluster
cluster_summary AS (
  SELECT 
    name,
    cluster_id,
    COUNT(*) as segment_count,
    ARRAY_AGG(id ORDER BY area_km2 DESC NULLS LAST) as segment_ids,
    ST_Collect(geometry ORDER BY area_km2 DESC NULLS LAST) as unified_geometry,
    SUM(COALESCE(area_km2, 0)) as total_area,
    MAX(COALESCE(depth_max, 0)) as max_depth,
    STRING_AGG(DISTINCT data_source, ', ') as combined_sources,
    MIN(water_type) as water_type -- Samma för alla i gruppen
  FROM rivers_with_clusters
  GROUP BY name, cluster_id
)

-- STEG 3: Lägg till rivers/streams (klustrade eller enskilda)
INSERT INTO water_bodies_unified (
  name, display_name, search_terms, geometry, lat, lon,
  total_area_km2, depth_max, original_segment_count, original_segment_ids,
  unification_method, water_type, data_source, processing_notes, is_split_section
)
SELECT 
  name,
  name as display_name,
  name as search_terms,
  CASE 
    WHEN segment_count > 1 THEN unified_geometry
    ELSE (SELECT geometry FROM rivers_with_clusters rwc WHERE rwc.name = cs.name AND rwc.cluster_id = cs.cluster_id LIMIT 1)
  END as geometry,
  CASE 
    WHEN segment_count > 1 THEN ST_Y(ST_PointOnSurface(unified_geometry))
    ELSE (SELECT lat FROM rivers_with_clusters rwc WHERE rwc.name = cs.name AND rwc.cluster_id = cs.cluster_id LIMIT 1)
  END as lat,
  CASE 
    WHEN segment_count > 1 THEN ST_X(ST_PointOnSurface(unified_geometry))
    ELSE (SELECT lon FROM rivers_with_clusters rwc WHERE rwc.name = cs.name AND rwc.cluster_id = cs.cluster_id LIMIT 1)
  END as lon,
  total_area,
  max_depth,
  segment_count,
  segment_ids,
  CASE 
    WHEN segment_count > 1 THEN 'geographic_cluster_merge'
    ELSE 'direct_copy'
  END as unification_method,
  water_type,
  combined_sources,
  CASE 
    WHEN segment_count > 1 THEN CONCAT('Merged ', segment_count, ' segments using 5km geographic clustering')
    ELSE 'Single river/stream segment - copied directly'
  END as processing_notes,
  false
FROM cluster_summary cs
WHERE unified_geometry IS NOT NULL OR segment_count = 1;

-- Visa resultat
SELECT 
  'SAFE PROCESSING COMPLETE' as status,
  COUNT(*) as total_waters,
  COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
  COUNT(*) FILTER (WHERE water_type IN ('river', 'stream')) as rivers,
  COUNT(*) FILTER (WHERE original_segment_count > 1) as merged_rivers,
  COUNT(*) FILTER (WHERE unification_method = 'geographic_cluster_merge') as geographically_merged
FROM water_bodies_unified;