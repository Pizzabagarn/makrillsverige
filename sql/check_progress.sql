-- KONTROLLERA PROGRESS - kör när som helst för att se status

SELECT 
  'CURRENT PROGRESS' as status,
  COUNT(*) as total_waters_unified,
  COUNT(*) FILTER (WHERE water_type = 'lake') as lakes_done,
  COUNT(*) FILTER (WHERE water_type IN ('river', 'stream') AND original_segment_count = 1) as single_rivers_done,
  COUNT(*) FILTER (WHERE water_type IN ('river', 'stream') AND original_segment_count > 1) as multi_rivers_done
FROM water_bodies_unified;

-- Visa kvarvarande multi-segment rivers som behöver processas
SELECT 
  'REMAINING WORK' as status,
  COUNT(DISTINCT name) as remaining_multi_segment_rivers,
  CASE 
    WHEN COUNT(DISTINCT name) = 0 THEN 'ALL DONE! 🎉'
    ELSE CONCAT('Run step3_merge_top5_rivers.sql ', CEIL(COUNT(DISTINCT name)::numeric / 5), ' more times')
  END as next_action
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

-- Lista nästa 10 rivers som kommer processas
SELECT 
  'NEXT 10 TO PROCESS' as info,
  name,
  COUNT(*) as segments
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
LIMIT 10;