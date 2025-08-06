-- JÄMFÖR GAMLA VS NYA TABELLEN FÖR VISS-DATA

-- 1. Kolla Vänern i GAMLA tabellen
SELECT 
    'VÄNERN GAMLA TABELL' as test,
    id,
    name,
    country,
    area_km2,
    ST_IsValid(geometry) as is_valid,
    ST_X(ST_Centroid(geometry)) as center_lon,
    ST_Y(ST_Centroid(geometry)) as center_lat
FROM water_bodies_with_places_fast_lookup
WHERE name ILIKE '%vänern%' 
  AND area_km2 > 1000
LIMIT 1;

-- 2. Samma sjö i NYA tabellen  
SELECT 
    'VÄNERN NYA TABELL' as test,
    id,
    name,
    country,
    area_km2,
    ST_IsValid(geometry) as is_valid,
    ST_X(ST_Centroid(geometry)) as center_lon,
    ST_Y(ST_Centroid(geometry)) as center_lat
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%vänern%' 
  AND area_km2 > 1000
LIMIT 1;

-- 3. Testa klick med GAMLA tabellen
SELECT 
    'KLICK GAMLA TABELL' as test,
    COUNT(*) as antal_träffar
FROM water_bodies_with_places_fast_lookup
WHERE ST_Contains(geometry, ST_Point(13.1, 58.9, 4326))
  AND name ILIKE '%vänern%';

-- 4. Samma klick med NYA tabellen
SELECT 
    'KLICK NYA TABELL' as test,
    COUNT(*) as antal_träffar
FROM water_bodies_merged_fast_lookup
WHERE ST_Contains(geometry, ST_Point(13.1, 58.9, 4326))
  AND name ILIKE '%vänern%';