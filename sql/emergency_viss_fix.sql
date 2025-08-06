-- AKUT FIX: Använd GAMLA tabellen för VISS-data tills vi förstår problemet

-- 1. Kolla om gamla tabellen fortfarande finns och fungerar
SELECT 
    'GAMLA TABELLEN TEST' as test,
    COUNT(*) as total_sjöar,
    COUNT(*) FILTER (WHERE country = 'SE') as svenska_sjöar,
    COUNT(*) FILTER (WHERE ST_IsValid(geometry) = true) as giltiga_geometrier
FROM water_bodies_with_places_fast_lookup
WHERE water_type = 'lake';

-- 2. Testa klick på Vänern i gamla tabellen
SELECT 
    'KLICK GAMLA TABELL VÄNERN' as test,
    id,
    name,
    country,
    area_km2
FROM water_bodies_with_places_fast_lookup
WHERE ST_Contains(geometry, ST_Point(13.1, 58.9, 4326))
  AND water_type = 'lake'
  AND name ILIKE '%vänern%'
LIMIT 1;

-- 3. Testa med större tolerans i gamla tabellen
SELECT 
    'KLICK GAMLA TABELL TOLERANS' as test,
    id,
    name,
    country,
    area_km2,
    ST_Distance(
        ST_Transform(geometry, 3857),
        ST_Transform(ST_Point(13.1, 58.9, 4326), 3857)
    ) / 1000.0 as avstand_km
FROM water_bodies_with_places_fast_lookup
WHERE water_type = 'lake'
  AND name ILIKE '%vänern%'
  AND ST_DWithin(
    ST_Transform(geometry, 3857),
    ST_Transform(ST_Point(13.1, 58.9, 4326), 3857),
    50000  -- 50km tolerans
  )
ORDER BY area_km2 DESC
LIMIT 1;