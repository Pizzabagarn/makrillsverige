-- OPTIMERAD KOORDINAT-INDEXERING för snabba kartklick
-- Kör denna SQL i Supabase för optimal prestanda

-- Först, se till att lat/lon kolumner finns
ALTER TABLE water_bodies 
ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;

-- Uppdatera saknade koordinater från geometri (om det behövs)
UPDATE water_bodies 
SET 
  lat = ST_Y(ST_Centroid(geometry)),
  lon = ST_X(ST_Centroid(geometry))
WHERE (lat IS NULL OR lon IS NULL) 
  AND geometry IS NOT NULL 
  AND name IS NOT NULL;

-- KRITISKA INDEX för snabba kartklick
-- Kombinerat index för lat/lon - MYCKET viktigt för bounding box queries
CREATE INDEX IF NOT EXISTS idx_water_bodies_lat_lon_combined 
ON water_bodies (lat, lon) 
WHERE lat IS NOT NULL AND lon IS NOT NULL AND name IS NOT NULL;

-- Area-baserad prioritering för bättre resultat
CREATE INDEX IF NOT EXISTS idx_water_bodies_area_desc 
ON water_bodies (area_km2 DESC NULLS LAST) 
WHERE name IS NOT NULL;

-- Kombinerat index för snabba filtered queries
CREATE INDEX IF NOT EXISTS idx_water_bodies_coords_with_area 
ON water_bodies (lat, lon, area_km2 DESC NULLS LAST) 
WHERE lat IS NOT NULL AND lon IS NOT NULL AND name IS NOT NULL;

-- Statistik-uppdatering för optimala query plans
ANALYZE water_bodies;

-- Kommentarer
COMMENT ON INDEX idx_water_bodies_lat_lon_combined IS 'KRITISKT för snabba kartklick - koordinat bounding box';
COMMENT ON INDEX idx_water_bodies_coords_with_area IS 'Kombinerat index för area-sorterade koordinat-queries';