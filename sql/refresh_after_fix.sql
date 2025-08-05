-- STEG 4: Uppdatera materialized view efter fix
-- Kör detta sist efter alla batches är klara

-- Uppdatera materialized view
REFRESH MATERIALIZED VIEW water_bodies_unified_fast_lookup;

-- Ge final statistik
SELECT 
  'FINAL STATISTICS' as status,
  COUNT(*) as total_unified_waters,
  COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
  COUNT(*) FILTER (WHERE water_type = 'river') as rivers,
  COUNT(*) FILTER (WHERE original_segment_count > 1) as multi_segment_waters,
  MAX(original_segment_count) as max_segments_in_single_water,
  AVG(original_segment_count) as avg_segments_per_water,
  COUNT(*) FILTER (WHERE name ILIKE '%vänern%') as vanern_count,
  COUNT(*) FILTER (WHERE name ILIKE '%vatn' OR name ILIKE '%sø' OR name ILIKE '%järvi%') as nordic_lakes
FROM water_bodies_unified;

-- Kontrollera Vänern specifikt
SELECT 
  'VÄNERN CHECK' as check_type,
  name,
  original_segment_count,
  ST_Area(ST_Transform(geometry, 3857)) / 1000000 as area_km2_calculated,
  total_area_km2,
  unification_method
FROM water_bodies_unified 
WHERE name ILIKE '%vänern%';