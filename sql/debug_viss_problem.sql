-- UNDERSÖK VARFÖR VISS-DATA INTE FUNGERAR FÖR SJÖAR

-- 1. Kolla om sjöar finns i nya tabellen
SELECT 
    'SJÖAR I NYA TABELLEN' as test,
    COUNT(*) as lake_count,
    COUNT(*) FILTER (WHERE country = 'SE') as swedish_lakes
FROM water_bodies_merged_fast_lookup 
WHERE water_type = 'lake';

-- 2. Testa specifik sjö (Vänern)
SELECT 
    'VÄNERN TEST' as test,
    name,
    country,
    area_km2
FROM water_bodies_merged_fast_lookup 
WHERE name ILIKE '%vänern%' 
  AND water_type = 'lake'
LIMIT 5;

-- 3. Jämför med gamla tabellen
SELECT 
    'JÄMFÖRELSE GAMLA/NYA' as test,
    'GAMLA' as source,
    COUNT(*) as lake_count
FROM water_bodies_with_places_fast_lookup 
WHERE water_type = 'lake' AND country = 'SE'

UNION ALL

SELECT 
    'JÄMFÖRELSE GAMLA/NYA' as test,
    'NYA' as source,
    COUNT(*) as lake_count
FROM water_bodies_merged_fast_lookup 
WHERE water_type = 'lake' AND country = 'SE';

SELECT 'DEBUG KLAR - NU SER VI PROBLEMET!' as status;

-- 1. Kolla om sjöar finns i nya tabellen
SELECT 
    'SJÖAR I NYA TABELLEN' as test,
    COUNT(*) as lake_count,
    COUNT(*) FILTER (WHERE country = 'SE') as swedish_lakes
FROM water_bodies_merged_fast_lookup 
WHERE water_type = 'lake';

-- 2. Testa specifik sjö (Vänern)
SELECT 
    'VÄNERN TEST' as test,
    name,
    country,
    area_km2
FROM water_bodies_merged_fast_lookup 
WHERE name ILIKE '%vänern%' 
  AND water_type = 'lake'
LIMIT 5;

-- 3. Jämför med gamla tabellen
SELECT 
    'JÄMFÖRELSE GAMLA/NYA' as test,
    'GAMLA' as source,
    COUNT(*) as lake_count
FROM water_bodies_with_places_fast_lookup 
WHERE water_type = 'lake' AND country = 'SE'

UNION ALL

SELECT 
    'JÄMFÖRELSE GAMLA/NYA' as test,
    'NYA' as source,
    COUNT(*) as lake_count
FROM water_bodies_merged_fast_lookup 
WHERE water_type = 'lake' AND country = 'SE';

SELECT 'DEBUG KLAR - NU SER VI PROBLEMET!' as status;