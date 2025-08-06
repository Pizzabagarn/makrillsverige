-- UNDERSÖK ID-PROBLEMET för VISS-data

-- 1. Kolla ID-skillnader mellan gamla och nya tabellen
SELECT 
    'ID SKILLNADER' as test,
    'GAMLA TABELL' as source,
    MIN(id) as min_id,
    MAX(id) as max_id,
    COUNT(*) as count
FROM water_bodies_with_places_fast_lookup
WHERE water_type = 'lake' AND country = 'SE'

UNION ALL

SELECT 
    'ID SKILLNADER' as test,
    'NYA TABELL' as source,
    MIN(id) as min_id,
    MAX(id) as max_id,
    COUNT(*) as count
FROM water_bodies_merged_fast_lookup
WHERE water_type = 'lake' AND country = 'SE';

-- 2. Kolla om samma sjö har olika ID i nya tabellen
SELECT 
    'VÄNERN ID TEST' as test,
    'GAMLA' as source,
    id,
    name
FROM water_bodies_with_places_fast_lookup 
WHERE name ILIKE '%vänern%' AND water_type = 'lake'
LIMIT 3

UNION ALL

SELECT 
    'VÄNERN ID TEST' as test,
    'NYA' as source,
    id,
    name
FROM water_bodies_merged_fast_lookup 
WHERE name ILIKE '%vänern%' AND water_type = 'lake'
LIMIT 3;

SELECT 'ID-MAPPING UNDERSÖKNING KLAR!' as status;

-- 1. Kolla ID-skillnader mellan gamla och nya tabellen
SELECT 
    'ID SKILLNADER' as test,
    'GAMLA TABELL' as source,
    MIN(id) as min_id,
    MAX(id) as max_id,
    COUNT(*) as count
FROM water_bodies_with_places_fast_lookup
WHERE water_type = 'lake' AND country = 'SE'

UNION ALL

SELECT 
    'ID SKILLNADER' as test,
    'NYA TABELL' as source,
    MIN(id) as min_id,
    MAX(id) as max_id,
    COUNT(*) as count
FROM water_bodies_merged_fast_lookup
WHERE water_type = 'lake' AND country = 'SE';

-- 2. Kolla om samma sjö har olika ID i nya tabellen
SELECT 
    'VÄNERN ID TEST' as test,
    'GAMLA' as source,
    id,
    name
FROM water_bodies_with_places_fast_lookup 
WHERE name ILIKE '%vänern%' AND water_type = 'lake'
LIMIT 3

UNION ALL

SELECT 
    'VÄNERN ID TEST' as test,
    'NYA' as source,
    id,
    name
FROM water_bodies_merged_fast_lookup 
WHERE name ILIKE '%vänern%' AND water_type = 'lake'
LIMIT 3;

SELECT 'ID-MAPPING UNDERSÖKNING KLAR!' as status;