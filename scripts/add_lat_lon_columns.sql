-- LÄGG TILL LAT/LON KOLUMNER till water_bodies tabellen

ALTER TABLE water_bodies 
ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;

-- Skapa index för snabba geografiska sökningar
CREATE INDEX IF NOT EXISTS idx_water_bodies_coordinates 
ON water_bodies (lat, lon) 
WHERE lat IS NOT NULL AND lon IS NOT NULL;

-- Kommentar för dokumentation
COMMENT ON COLUMN water_bodies.lat IS 'Latitude (decimal degrees)';
COMMENT ON COLUMN water_bodies.lon IS 'Longitude (decimal degrees)'; 