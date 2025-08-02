-- SKAPA FUNKTION FÖR ATT LÄGGA TILL LAT/LON KOLUMNER

CREATE OR REPLACE FUNCTION add_lat_lon_columns()
RETURNS TEXT AS $$
BEGIN
  -- Lägg till kolumner om de inte finns
  BEGIN
    ALTER TABLE water_bodies ADD COLUMN lat DOUBLE PRECISION;
  EXCEPTION
    WHEN duplicate_column THEN
      -- Kolumn finns redan
      NULL;
  END;
  
  BEGIN
    ALTER TABLE water_bodies ADD COLUMN lon DOUBLE PRECISION;
  EXCEPTION
    WHEN duplicate_column THEN
      -- Kolumn finns redan
      NULL;
  END;
  
  -- Skapa index
  CREATE INDEX IF NOT EXISTS idx_water_bodies_coordinates 
  ON water_bodies (lat, lon) 
  WHERE lat IS NOT NULL AND lon IS NOT NULL;
  
  RETURN 'Lat/lon kolumner och index skapade';
END;
$$ LANGUAGE plpgsql; 