-- PROFESSIONELL LÖSNING: En körning, alla vattendrag, inga timeouts
-- Använder INSERT...SELECT istället för loopar för maximal prestanda

-- 1. Skapa temporär tabell för grupperade vattendrag (snabbt)
CREATE TEMP TABLE waterway_groups AS
SELECT 
    name,
    water_type, 
    municipality,
    COUNT(*) as segment_count,
    array_agg(id ORDER BY area_km2 DESC NULLS LAST) as segment_ids,
    ST_Union(geometry) as merged_geometry,  -- ST_Union för gap-säkerhet
    SUM(COALESCE(area_km2, 0)) as total_area
FROM water_bodies_with_places_fast_lookup
WHERE water_type IN ('river', 'stream')
  AND name IS NOT NULL 
  AND municipality IS NOT NULL
  AND ST_IsValid(geometry) = true
GROUP BY name, water_type, municipality;

-- 2. Infoga sammanslagda vattendrag (EN operation)
INSERT INTO water_bodies_with_places_merged (
    name, water_type, municipality, geometry, lat, lon, area_km2,
    data_source, source_priority, display_name,
    original_segment_ids, merge_group_id, has_natural_gaps, 
    merge_method, segments_merged
)
SELECT 
    wg.name || ' (' || wg.municipality || ')' as name,
    wg.water_type,
    wg.municipality,
    wg.merged_geometry,
    ST_Y(ST_Centroid(wg.merged_geometry)) as lat,
    ST_X(ST_Centroid(wg.merged_geometry)) as lon,
    wg.total_area,
    COALESCE(orig.data_source, 'MERGED') as data_source,
    COALESCE(orig.source_priority, 1) as source_priority,
    wg.name || ' (' || wg.municipality || ')' as display_name,
    wg.segment_ids,
    1 as merge_group_id,
    ST_GeometryType(wg.merged_geometry) LIKE '%MULTI%' as has_natural_gaps,
    CASE 
        WHEN wg.segment_count > 1 THEN 'multi_segment_merge'
        ELSE 'single_segment'
    END as merge_method,
    wg.segment_count
FROM waterway_groups wg
LEFT JOIN water_bodies_with_places_fast_lookup orig ON orig.id = wg.segment_ids[1];

-- 3. Resultat
SELECT 
    '✅ PROFESSIONELL SAMMANSLAGNING KLAR!' as status,
    COUNT(*) as total_waterways,
    COUNT(*) FILTER (WHERE segments_merged > 1) as merged_waterways,
    COUNT(*) FILTER (WHERE segments_merged = 1) as single_segments,
    SUM(segments_merged) as original_segments_total
FROM water_bodies_with_places_merged
WHERE water_type IN ('river', 'stream');

-- 4. Exempel resultat
SELECT 
    'EXEMPEL SAMMANSLAGDA' as info,
    name,
    segments_merged,
    has_natural_gaps,
    ROUND(area_km2::NUMERIC, 2) as area_km2
FROM water_bodies_with_places_merged 
WHERE segments_merged > 1 
ORDER BY segments_merged DESC 
LIMIT 10;