-- STEG 2: Kopiera enskilda rivers/streams (de med bara 1 segment)
-- SUPERSNABBT - inga ST_Collect operationer

INSERT INTO water_bodies_unified (
  name, display_name, search_terms, geometry, lat, lon,
  total_area_km2, depth_max, original_segment_count, original_segment_ids,
  unification_method, water_type, data_source, processing_notes, is_split_section
)
SELECT 
  w.name,
  w.name as display_name,
  w.name as search_terms,
  w.geometry,
  w.lat, w.lon,
  w.area_km2,
  w.depth_max,
  1,
  ARRAY[w.id],
  'direct_copy',
  w.water_type,
  w.data_source,
  'Single river segment',
  false
FROM water_bodies_integrated w
WHERE w.water_type IN ('river', 'stream')
  AND ST_IsValid(w.geometry) = true 
  AND w.name IS NOT NULL 
  AND w.name != ''
  -- Bara de som har exakt 1 segment (UNDVIKER multi-segment för nu)
  AND w.name IN (
    SELECT name 
    FROM water_bodies_integrated
    WHERE water_type IN ('river', 'stream')
      AND ST_IsValid(geometry) = true 
      AND name IS NOT NULL 
      AND name != ''
    GROUP BY name 
    HAVING COUNT(*) = 1  -- BARA single-segment rivers
  );

-- Resultat
SELECT 
  'STEP 2 COMPLETE - SINGLE RIVERS COPIED' as status,
  COUNT(*) as single_rivers_copied,
  (SELECT COUNT(*) FROM water_bodies_unified) as total_waters_so_far
FROM water_bodies_unified 
WHERE water_type IN ('river', 'stream');