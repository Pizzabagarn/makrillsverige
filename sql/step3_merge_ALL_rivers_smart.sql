-- STEG 3: Slå samman ALLA fragmenterade rivers på EN gång
-- SMART approach: geografisk klustring utan timeout
-- SLÅR INTE SAMMAN olika vattendrag med samma namn!

-- Först: visa vad som kommer processas
WITH remaining_fragmented AS (
  SELECT name, COUNT(*) as segments
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
)
SELECT 
  'WILL PROCESS ALL THESE RIVERS:' as info,
  COUNT(*) as total_river_names,
  SUM(segments) as total_segments,
  MAX(segments) as most_fragmented
FROM remaining_fragmented;

-- NU: Processa ALLA återstående fragmenterade rivers med geografisk klustring
WITH remaining_rivers AS (
  -- Alla rivers som inte redan finns i unified tabellen
  SELECT w.*
  FROM water_bodies_integrated w
  WHERE w.water_type IN ('river', 'stream')
    AND ST_IsValid(w.geometry) = true 
    AND w.name IS NOT NULL 
    AND w.name != ''
    AND w.name NOT IN (
      SELECT DISTINCT name FROM water_bodies_unified 
      WHERE water_type IN ('river', 'stream')
    )
    -- Bara multi-segment rivers
    AND w.name IN (
      SELECT name
      FROM water_bodies_integrated
      WHERE water_type IN ('river', 'stream')
        AND ST_IsValid(geometry) = true 
        AND name IS NOT NULL 
        AND name != ''
      GROUP BY name 
      HAVING COUNT(*) > 1
    )
),

-- Geografisk klustring PER NAMN (detta undviker att olika Svartån slås samman!)
rivers_with_geographic_clusters AS (
  SELECT 
    id, name, water_type, geometry, lat, lon, area_km2, depth_max, data_source,
    -- KRITISKT: ST_ClusterDBSCAN körs PARTITION BY name = samma namn klustras geografiskt
    -- Detta betyder: Svartån i Örebro och Svartån i Västmanland blir OLIKA kluster!
    ST_ClusterDBSCAN(geometry, 5000, 1) OVER (PARTITION BY name ORDER BY area_km2 DESC) as cluster_id
  FROM remaining_rivers
),

-- Räkna segment per kluster (varje kluster = ett sammanhängande vattendrag)
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
    MIN(water_type) as water_type
  FROM rivers_with_geographic_clusters
  GROUP BY name, cluster_id
)

-- Infoga ALLA processade rivers
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
  CONCAT('Merged ', segment_count, ' segments using geographic clustering (5km rule) - ALL RIVERS BATCH'),
  false
FROM cluster_summary
WHERE unified_geometry IS NOT NULL;

-- RESULTAT
SELECT 
  'ALL FRAGMENTED RIVERS PROCESSED!' as status,
  COUNT(*) FILTER (WHERE processing_notes LIKE '%ALL RIVERS BATCH%') as rivers_just_processed,
  (SELECT COUNT(*) FROM water_bodies_unified) as total_waters_now,
  (SELECT COUNT(*) FROM water_bodies_unified WHERE water_type = 'lake') as lakes,
  (SELECT COUNT(*) FROM water_bodies_unified WHERE water_type IN ('river', 'stream')) as rivers_total
FROM water_bodies_unified;

-- Kontrollera att inga fragmenterade rivers är kvar
SELECT 
  'VERIFICATION - REMAINING FRAGMENTED RIVERS' as check_type,
  COALESCE(COUNT(DISTINCT name), 0) as should_be_zero
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