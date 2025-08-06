-- STEG 1: Säkerhetskopia och grundfunktioner
-- Kör detta först (snabbt)

-- Säkerhetskopia (om inte redan gjord)
DROP TABLE IF EXISTS water_bodies_with_places_backup CASCADE;
CREATE TABLE water_bodies_with_places_backup AS 
SELECT * FROM water_bodies_with_places;

-- Avståndsfunktion
CREATE OR REPLACE FUNCTION calculate_segment_distance(
    geom1 GEOMETRY,
    geom2 GEOMETRY
) RETURNS NUMERIC AS $$
BEGIN
    RETURN ST_Distance(
        ST_Transform(geom1, 3857),
        ST_Transform(geom2, 3857)
    ) / 1000.0;
END;
$$ LANGUAGE plpgsql;

-- Analysvy (lätt)
CREATE OR REPLACE VIEW waterway_segments_analysis AS
SELECT 
    name,
    water_type,
    municipality,
    COUNT(*) as segment_count
FROM water_bodies_with_places_fast_lookup
WHERE water_type IN ('river', 'stream') 
  AND name IS NOT NULL
  AND municipality IS NOT NULL
  AND ST_IsValid(geometry) = true
GROUP BY name, water_type, municipality
HAVING COUNT(*) > 1
ORDER BY segment_count DESC;

SELECT 'STEG 1 KLAR ✅' as status;
-- Kör detta först (snabbt)

-- Säkerhetskopia (om inte redan gjord)
DROP TABLE IF EXISTS water_bodies_with_places_backup CASCADE;
CREATE TABLE water_bodies_with_places_backup AS 
SELECT * FROM water_bodies_with_places;

-- Avståndsfunktion
CREATE OR REPLACE FUNCTION calculate_segment_distance(
    geom1 GEOMETRY,
    geom2 GEOMETRY
) RETURNS NUMERIC AS $$
BEGIN
    RETURN ST_Distance(
        ST_Transform(geom1, 3857),
        ST_Transform(geom2, 3857)
    ) / 1000.0;
END;
$$ LANGUAGE plpgsql;

-- Analysvy (lätt)
CREATE OR REPLACE VIEW waterway_segments_analysis AS
SELECT 
    name,
    water_type,
    municipality,
    COUNT(*) as segment_count
FROM water_bodies_with_places_fast_lookup
WHERE water_type IN ('river', 'stream') 
  AND name IS NOT NULL
  AND municipality IS NOT NULL
  AND ST_IsValid(geometry) = true
GROUP BY name, water_type, municipality
HAVING COUNT(*) > 1
ORDER BY segment_count DESC;

SELECT 'STEG 1 KLAR ✅' as status;