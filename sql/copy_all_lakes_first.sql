-- ULTRASIMPLE: Kopiera ALLA sjöar först (de fungerar redan perfekt!)
-- Inga ändringar - bara rak kopiering

TRUNCATE TABLE water_bodies_unified;

-- STEG 1: Kopiera ALLA SJÖAR rakt av (inga ändringar!)
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
  water_type,  -- Använd befintlig klassificering!
  data_source,
  'Perfect lake - copied directly from water_bodies_integrated',
  false
FROM water_bodies_integrated
WHERE water_type = 'lake'
  AND ST_IsValid(geometry) = true 
  AND name IS NOT NULL 
  AND name != '';

-- Visa resultat
SELECT 'LAKES COPIED' as status, COUNT(*) as total_lakes 
FROM water_bodies_unified WHERE water_type = 'lake';