-- TESTA VISS-DATA EFTER DUBLETT-FIX

-- 1. Testa klick på Vänern med nya unika ID:n
SELECT 
    'KLICK TEST EFTER FIX' as test,
    id,
    name,
    country,
    area_km2
FROM find_merged_water_body_containing_point(58.9, 13.1, 0.5)
WHERE name ILIKE '%vänern%'
LIMIT 1;

-- 2. Testa direkt på Vänerns nya ID
SELECT 
    'DIREKT ID TEST' as test,
    id,
    name,
    country,
    ST_IsValid(geometry) as geometri_giltig
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%vänern%' 
  AND area_km2 > 1000
LIMIT 1;

-- 3. Kolla att det bara finns EN Vänern nu
SELECT 
    'VÄNERN DUBLETTER' as test,
    COUNT(*) as antal_vänern
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%vänern%' 
  AND area_km2 > 1000;

SELECT 'VISS-TEST EFTER FIX KLAR!' as status;