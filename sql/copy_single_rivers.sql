-- STEG 3: Kopiera enskilda rivers/streams (de som bara har 1 segment)
-- Kör EFTER fix_rivers_only_batch1.sql

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
  'Single segment river/stream - copied directly',
  false
FROM water_bodies_integrated
WHERE water_type IN ('river', 'stream')
  AND ST_IsValid(geometry) = true 
  AND name IS NOT NULL 
  AND name != ''
  -- Bara ta de som har bara 1 segment (inte fragmenterade)
  AND name IN (
    SELECT name 
    FROM water_bodies_integrated
    WHERE water_type IN ('river', 'stream')
      AND ST_IsValid(geometry) = true 
      AND name IS NOT NULL 
      AND name != ''
    GROUP BY name 
    HAVING COUNT(*) = 1
  )
  -- Och som inte redan är processade
  AND name NOT IN (
    SELECT name FROM water_bodies_unified 
    WHERE water_type IN ('river', 'stream')
  );

-- Visa totala statistiken
SELECT 
  'TOTAL PROGRESS' as status,
  COUNT(*) as total_waters,
  COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
  COUNT(*) FILTER (WHERE water_type IN ('river', 'stream')) as rivers,
  COUNT(*) FILTER (WHERE original_segment_count > 1) as merged_waters
FROM water_bodies_unified;