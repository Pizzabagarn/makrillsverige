-- PostGIS-funktion för att avgöra om en punkt är nära vatten
-- Används av väder-scriptet för intelligent grid-generering

CREATE OR REPLACE FUNCTION is_point_near_water(
    point_lat NUMERIC, 
    point_lon NUMERIC, 
    radius_meters NUMERIC DEFAULT 2000
)
RETURNS BOOLEAN AS $$
DECLARE
    point_geom GEOMETRY;
    nearby_count INTEGER;
BEGIN
    -- Skapa en point från lat/lon
    point_geom := ST_SetSRID(ST_MakePoint(point_lon, point_lat), 4326);
    
    -- Kolla om det finns vattendrag inom radius
    SELECT COUNT(*) INTO nearby_count
    FROM water_bodies
    WHERE ST_DWithin(
        ST_Transform(geometry, 3857),  -- Transform till meter
        ST_Transform(point_geom, 3857), -- Transform punkt till meter
        radius_meters
    )
    LIMIT 1; -- Vi behöver bara veta om det finns någon
    
    RETURN nearby_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Kommentar på funktionen
COMMENT ON FUNCTION is_point_near_water(NUMERIC, NUMERIC, NUMERIC) IS 
'Kontrollerar om en punkt (lat, lon) är inom angiven radie från något vattendrag'; 