-- FIXA SAKNAD FUNKTION
-- Kör detta innan du fortsätter

CREATE OR REPLACE FUNCTION calculate_segment_distance(
    geom1 GEOMETRY,
    geom2 GEOMETRY
) RETURNS NUMERIC AS $$
BEGIN
    -- Hantera NULL-värden
    IF geom1 IS NULL OR geom2 IS NULL THEN
        RETURN 999999; -- Stort värde så de inte grupperas
    END IF;
    
    -- Returnera avstånd i km mellan närmaste punkter
    RETURN ST_Distance(
        ST_Transform(geom1, 3857),
        ST_Transform(geom2, 3857)
    ) / 1000.0;
EXCEPTION
    WHEN OTHERS THEN
        -- Om geometri-transformation misslyckas
        RETURN 999999;
END;
$$ LANGUAGE plpgsql;

-- Testa funktionen
SELECT 
    'FUNKTION TEST' as test,
    calculate_segment_distance(
        ST_Point(13.0, 55.6, 4326),
        ST_Point(13.1, 55.7, 4326)
    ) as distance_km;

SELECT 'FUNKTION SKAPAD ✅' as status;