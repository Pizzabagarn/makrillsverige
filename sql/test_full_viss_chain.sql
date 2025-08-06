-- TESTA HELA VISS-KEDJAN från klick till data

-- 1. Testa klick-funktion på Vänern (ungefär koordinater)
SELECT 
    'KLICK TEST VÄNERN' as test,
    id,
    name,
    country,
    area_km2
FROM find_merged_water_body_containing_point(58.9, 13.1, 0.02)
WHERE name ILIKE '%vänern%'
LIMIT 1;

-- 2. Testa getWaterBodyWithPlacesDetails direkt på Vänern ID
SELECT 
    'VISS DATA TEST' as test,
    id,
    name,
    country,
    lat,
    lon
FROM water_bodies_merged_fast_lookup
WHERE id = 26117;

-- 3. Kolla om det finns svenska sjöar som ska ha VISS-data
SELECT 
    'SVENSKA SJÖAR MED VISS' as test,
    COUNT(*) as count,
    array_agg(name ORDER BY area_km2 DESC) FILTER (WHERE area_km2 > 100) as top_lakes
FROM water_bodies_merged_fast_lookup
WHERE water_type = 'lake' 
  AND country = 'SE'
  AND name IS NOT NULL;