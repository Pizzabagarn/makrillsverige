-- UNDERSÖK ID-PROBLEMET KORREKT

-- 1. Kolla gamla tabellen
SELECT 
    'GAMLA TABELL SJÖAR' as info,
    COUNT(*) as total_lakes,
    COUNT(*) FILTER (WHERE country = 'SE') as swedish_lakes,
    MIN(id) as min_id,
    MAX(id) as max_id
FROM water_bodies_with_places_fast_lookup
WHERE water_type = 'lake';

-- 2. Kolla nya tabellen  
SELECT 
    'NYA TABELL SJÖAR' as info,
    COUNT(*) as total_lakes,
    COUNT(*) FILTER (WHERE country = 'SE') as swedish_lakes,
    MIN(id) as min_id,
    MAX(id) as max_id
FROM water_bodies_merged_fast_lookup
WHERE water_type = 'lake';

-- 3. Testa specifik sjö i gamla tabellen
SELECT 
    'VÄNERN GAMLA TABELL' as test,
    id,
    name,
    country,
    area_km2
FROM water_bodies_with_places_fast_lookup 
WHERE name ILIKE '%vänern%' 
  AND water_type = 'lake' 
  AND area_km2 > 1000
LIMIT 1;

-- 4. Samma sjö i nya tabellen
SELECT 
    'VÄNERN NYA TABELL' as test,
    id,
    name,
    country,
    area_km2
FROM water_bodies_merged_fast_lookup 
WHERE name ILIKE '%vänern%' 
  AND water_type = 'lake' 
  AND area_km2 > 1000
LIMIT 1;