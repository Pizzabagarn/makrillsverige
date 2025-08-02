-- LÄGG TILL LAT/LON KOLUMNER till water_bodies tabellen
-- Behövs för spatial queries och koordinat-caching

-- Lägg till kolumner
ALTER TABLE water_bodies 
ADD COLUMN IF NOT EXISTS lat NUMERIC,
ADD COLUMN IF NOT EXISTS lon NUMERIC,
ADD COLUMN IF NOT EXISTS area_km2 NUMERIC,
ADD COLUMN IF NOT EXISTS created_manually BOOLEAN DEFAULT FALSE;

-- Skapa index för snabbare spatial queries
CREATE INDEX IF NOT EXISTS idx_water_bodies_lat_lon ON water_bodies(lat, lon);
CREATE INDEX IF NOT EXISTS idx_water_bodies_coords ON water_bodies(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;

-- Sätt befintliga poster till icke-manuella
UPDATE water_bodies SET created_manually = FALSE WHERE created_manually IS NULL;

COMMIT; 