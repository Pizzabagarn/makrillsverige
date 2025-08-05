-- STEG 1: Kopiera BARA sjöar (supersnabbt, inga timeouts)

TRUNCATE TABLE water_bodies_unified;

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
  'Lake copied directly',
  false
FROM water_bodies_integrated
WHERE water_type = 'lake'
  AND ST_IsValid(geometry) = true 
  AND name IS NOT NULL 
  AND name != '';

-- Resultat
SELECT 'STEP 1 COMPLETE - LAKES COPIED' as status, COUNT(*) as lakes_copied 
FROM water_bodies_unified;