-- STEG 4: Slutför och uppdatera materialized view

-- Uppdatera materialized view
REFRESH MATERIALIZED VIEW water_bodies_unified_fast_lookup;

-- Final statistik
SELECT 
  'FINAL STATISTICS' as summary,
  COUNT(*) as total_unified_waters,
  COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
  COUNT(*) FILTER (WHERE water_type IN ('river', 'stream')) as rivers_streams,
  COUNT(*) FILTER (WHERE original_segment_count > 1) as merged_multi_segment,
  COUNT(*) FILTER (WHERE unification_method = 'direct_copy') as direct_copies,
  COUNT(*) FILTER (WHERE unification_method = 'geographic_cluster_merge') as geographically_merged
FROM water_bodies_unified;

-- Kontrollera att vi har ungefär samma antal som ursprungligen
SELECT 
  'COMPARISON WITH ORIGINAL' as comparison,
  (SELECT COUNT(*) FROM water_bodies_integrated WHERE ST_IsValid(geometry) = true AND name IS NOT NULL AND name != '') as original_count,
  (SELECT COUNT(*) FROM water_bodies_unified) as unified_count,
  ROUND(
    (SELECT COUNT(*) FROM water_bodies_unified)::numeric / 
    (SELECT COUNT(*) FROM water_bodies_integrated WHERE ST_IsValid(geometry) = true AND name IS NOT NULL AND name != '')::numeric * 100, 
    1
  ) as unified_percentage;

-- Visa största merged rivers
SELECT 
  'BIGGEST MERGED RIVERS' as info,
  name,
  original_segment_count,
  ROUND(total_area_km2::numeric, 2) as area_km2
FROM water_bodies_unified 
WHERE water_type IN ('river', 'stream') 
  AND original_segment_count > 1
ORDER BY original_segment_count DESC
LIMIT 10;