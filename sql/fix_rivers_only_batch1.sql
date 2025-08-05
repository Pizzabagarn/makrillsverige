-- STEG 2: Fixa BARA rivers/streams (i små batches för att undvika timeout)
-- Kör EFTER copy_all_lakes_first.sql

-- Hitta de 20 mest fragmenterade river/stream namnen
WITH top_fragmented_rivers AS (
  SELECT name, COUNT(*) as fragment_count
  FROM water_bodies_integrated 
  WHERE water_type IN ('river', 'stream')
    AND ST_IsValid(geometry) = true 
    AND name IS NOT NULL 
    AND name != ''
  GROUP BY name 
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC
  LIMIT 20  -- Bara 20 åt gången!
),

-- Samla ihop segmenten för dessa rivers
river_segments AS (
  SELECT 
    w.name,
    COUNT(*) as segment_count,
    ARRAY_AGG(w.id ORDER BY w.area_km2 DESC NULLS LAST) as segment_ids,
    ST_Collect(w.geometry ORDER BY w.area_km2 DESC NULLS LAST) as unified_geometry,
    SUM(COALESCE(w.area_km2, 0)) as total_area,
    MAX(COALESCE(w.depth_max, 0)) as max_depth,
    STRING_AGG(DISTINCT w.data_source, ', ') as combined_sources,
    w.water_type  -- Använd befintlig klassificering!
  FROM water_bodies_integrated w
  INNER JOIN top_fragmented_rivers tfr ON w.name = tfr.name
  WHERE ST_IsValid(w.geometry) = true
  GROUP BY w.name, w.water_type
)

-- Lägg till de sammansatta rivers/streams
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
  'st_collect_rivers',
  water_type,
  combined_sources,
  CONCAT('BATCH 1: Merged ', segment_count, ' river/stream segments'),
  false
FROM river_segments
WHERE unified_geometry IS NOT NULL;

-- Visa resultat
SELECT 
  'BATCH 1 RIVERS PROCESSED' as status,
  COUNT(*) as rivers_processed,
  MAX(original_segment_count) as max_segments,
  STRING_AGG(name, ', ') as processed_rivers
FROM water_bodies_unified 
WHERE processing_notes LIKE '%BATCH 1%';

-- Visa hur många rivers som är kvar
SELECT 
  'REMAINING RIVERS' as status,
  COUNT(DISTINCT name) as remaining_fragmented_rivers
FROM water_bodies_integrated 
WHERE water_type IN ('river', 'stream')
  AND ST_IsValid(geometry) = true 
  AND name IS NOT NULL 
  AND name != ''
  AND name NOT IN (
    SELECT name FROM water_bodies_unified 
    WHERE processing_notes LIKE '%BATCH%'
  )
GROUP BY name 
HAVING COUNT(*) > 1;