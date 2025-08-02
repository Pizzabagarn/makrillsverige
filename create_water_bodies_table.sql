-- Skapa tabell för svenska vattendrag i Supabase
-- Detta kommer att lagra ALLA 294,741 vattendrag från OSM

CREATE TABLE IF NOT EXISTS water_bodies (
  id BIGSERIAL PRIMARY KEY,
  osm_id BIGINT,
  osm_type TEXT, -- 'way' eller 'relation'
  name TEXT,
  water_type TEXT, -- 'water', 'river', 'stream', 'reservoir'
  geometry GEOMETRY(GEOMETRY, 4326), -- PostGIS geometry
  bbox GEOMETRY(POLYGON, 4326), -- Bounding box för snabb sökning
  area_km2 NUMERIC, -- Area i kvadratkilometer
  tags JSONB, -- Alla OSM-tags som JSON
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index för snabb geospatial sökning
CREATE INDEX IF NOT EXISTS idx_water_bodies_geometry 
ON water_bodies USING GIST (geometry);

CREATE INDEX IF NOT EXISTS idx_water_bodies_bbox 
ON water_bodies USING GIST (bbox);

-- Index för vanliga queries
CREATE INDEX IF NOT EXISTS idx_water_bodies_water_type 
ON water_bodies (water_type);

CREATE INDEX IF NOT EXISTS idx_water_bodies_name 
ON water_bodies (name) WHERE name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_water_bodies_osm 
ON water_bodies (osm_type, osm_id);

-- Funktioner för att uppdatera updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_water_bodies_updated_at 
BEFORE UPDATE ON water_bodies 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) - tillåt alla att läsa
ALTER TABLE water_bodies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON water_bodies
    FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert" ON water_bodies
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Allow authenticated update" ON water_bodies
    FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Kommentarer
COMMENT ON TABLE water_bodies IS 'Svenska vattendrag från OpenStreetMap';
COMMENT ON COLUMN water_bodies.osm_id IS 'OpenStreetMap ID';
COMMENT ON COLUMN water_bodies.osm_type IS 'OSM element type (way/relation)';
COMMENT ON COLUMN water_bodies.geometry IS 'PostGIS geometry i WGS84';
COMMENT ON COLUMN water_bodies.bbox IS 'Bounding box för geometrin';
COMMENT ON COLUMN water_bodies.area_km2 IS 'Area i kvadratkilometer (endast för polygoner)';
COMMENT ON COLUMN water_bodies.tags IS 'Alla OSM-tags som JSONB'; 