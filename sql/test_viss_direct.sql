-- TESTA VISS-KEDJAN DIREKT I SQL

-- 1. Testa klick-funktion på Vänerns koordinater
SELECT 
    'KLICK FUNKTIONS-TEST' as test,
    COUNT(*) as antal_resultat
FROM find_merged_water_body_containing_point(58.9, 13.1, 0.1);

-- 2. Om inget resultat, testa större radius
SELECT 
    'KLICK MED STÖRRE RADIUS' as test,
    id,
    name,
    area_km2
FROM find_merged_water_body_containing_point(58.9, 13.1, 1.0)
WHERE name ILIKE '%vänern%'
LIMIT 1;

-- 3. Testa direkt på Vänerns exakta position
SELECT 
    'DIREKT GEOMETRI-TEST' as test,
    id,
    name,
    area_km2,
    ST_Contains(geometry, ST_Point(13.1, 58.9, 4326)) as contains_point
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%vänern%' 
  AND area_km2 > 1000
LIMIT 1;

-- 4. Kolla om geometri är korrekt
SELECT 
    'GEOMETRI INFO' as test,
    name,
    ST_GeometryType(geometry) as geom_type,
    ST_IsValid(geometry) as is_valid,
    ST_X(ST_Centroid(geometry)) as center_lon,
    ST_Y(ST_Centroid(geometry)) as center_lat
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%vänern%' 
  AND area_km2 > 1000
LIMIT 1;