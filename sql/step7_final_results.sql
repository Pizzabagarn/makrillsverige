-- STEG 7: Slutresultat och verifiering
-- Kör efter steg 6

-- Visa slutresultat
SELECT 
    '🎯 SLUTRESULTAT SAMMANSLAGNING' as info,
    COUNT(*) as total_waterways,
    COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
    COUNT(*) FILTER (WHERE water_type IN ('river', 'stream')) as rivers_streams,
    COUNT(*) FILTER (WHERE segments_merged > 1) as merged_waterways,
    COUNT(*) FILTER (WHERE has_natural_gaps = TRUE) as waterways_with_gaps,
    SUM(segments_merged) as original_segments_total
FROM water_bodies_with_places_merged;

-- Visa exempel på sammanslagda vattendrag
SELECT 
    '📋 EXEMPEL SAMMANSLAGDA VATTENDRAG' as info,
    name,
    segments_merged,
    has_natural_gaps,
    ROUND(area_km2::NUMERIC, 3) as area_km2
FROM water_bodies_with_places_merged 
WHERE segments_merged > 1 
ORDER BY segments_merged DESC 
LIMIT 10;

-- Jämför med original
SELECT 
    '📊 JÄMFÖRELSE MED ORIGINAL' as info,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) as original_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_merged) as merged_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) - 
    (SELECT COUNT(*) FROM water_bodies_with_places_merged) as segments_reduced;

-- Test klick-precision (om Höje å finns)
SELECT 
    '🧪 TEST KLICK-PRECISION' as info,
    name,
    ST_GeometryType(geometry) as geometry_type,
    segments_merged
FROM water_bodies_with_places_merged 
WHERE name LIKE '%Höje å%'
LIMIT 3;

SELECT '✅ SAMMANSLAGNING KOMPLETT!' as final_status;
-- Kör efter steg 6

-- Visa slutresultat
SELECT 
    '🎯 SLUTRESULTAT SAMMANSLAGNING' as info,
    COUNT(*) as total_waterways,
    COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
    COUNT(*) FILTER (WHERE water_type IN ('river', 'stream')) as rivers_streams,
    COUNT(*) FILTER (WHERE segments_merged > 1) as merged_waterways,
    COUNT(*) FILTER (WHERE has_natural_gaps = TRUE) as waterways_with_gaps,
    SUM(segments_merged) as original_segments_total
FROM water_bodies_with_places_merged;

-- Visa exempel på sammanslagda vattendrag
SELECT 
    '📋 EXEMPEL SAMMANSLAGDA VATTENDRAG' as info,
    name,
    segments_merged,
    has_natural_gaps,
    ROUND(area_km2::NUMERIC, 3) as area_km2
FROM water_bodies_with_places_merged 
WHERE segments_merged > 1 
ORDER BY segments_merged DESC 
LIMIT 10;

-- Jämför med original
SELECT 
    '📊 JÄMFÖRELSE MED ORIGINAL' as info,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) as original_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_merged) as merged_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) - 
    (SELECT COUNT(*) FROM water_bodies_with_places_merged) as segments_reduced;

-- Test klick-precision (om Höje å finns)
SELECT 
    '🧪 TEST KLICK-PRECISION' as info,
    name,
    ST_GeometryType(geometry) as geometry_type,
    segments_merged
FROM water_bodies_with_places_merged 
WHERE name LIKE '%Höje å%'
LIMIT 3;

SELECT '✅ SAMMANSLAGNING KOMPLETT!' as final_status;