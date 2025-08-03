-- Spatial hjälpfunktioner för skandinavisk vattenkarta
-- Dessa funktioner ska köras i Supabase för att stödja spatial queries

-- Funktion för att hitta vattendrag inom ett visst avstånd från en punkt
CREATE OR REPLACE FUNCTION water_bodies_within_distance(
  center_lat FLOAT,
  center_lon FLOAT, 
  max_distance_km FLOAT
)
RETURNS TABLE (
  id BIGINT,
  osm_id BIGINT,
  name TEXT,
  water_type TEXT,
  area_km2 NUMERIC,
  tags JSONB,
  geometry GEOMETRY
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wb.id,
    wb.osm_id,
    wb.name,
    wb.water_type,
    wb.area_km2,
    wb.tags,
    wb.geometry
  FROM water_bodies wb
  WHERE 
    ST_DWithin(
      ST_Transform(wb.geometry, 3857),  -- Web Mercator för distansberäkning
      ST_Transform(ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326), 3857),
      max_distance_km * 1000  -- Konvertera km till meter
    )
    AND wb.name IS NOT NULL
  ORDER BY 
    ST_Distance(
      ST_Transform(wb.geometry, 3857),
      ST_Transform(ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326), 3857)
    )
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Funktion för att beräkna centroid för komplexa geometrier
CREATE OR REPLACE FUNCTION get_water_body_centroid(geom GEOMETRY)
RETURNS GEOMETRY AS $$
BEGIN
  -- Returnera centroid som alltid ligger inom geometrin för polygon
  IF ST_GeometryType(geom) IN ('ST_Polygon', 'ST_MultiPolygon') THEN
    RETURN ST_PointOnSurface(geom);
  ELSE
    RETURN ST_Centroid(geom);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Index för snabbare spatial queries
CREATE INDEX IF NOT EXISTS idx_water_bodies_geometry_3857 
ON water_bodies USING GIST (ST_Transform(geometry, 3857));

-- View för snabbare queries med förberäknade centroider
CREATE OR REPLACE VIEW water_bodies_with_centroids AS
SELECT 
  id,
  osm_id,
  name,
  water_type,
  area_km2,
  tags,
  geometry,
  get_water_body_centroid(geometry) as centroid,
  ST_X(get_water_body_centroid(geometry)) as center_lon,
  ST_Y(get_water_body_centroid(geometry)) as center_lat
FROM water_bodies
WHERE name IS NOT NULL AND geometry IS NOT NULL;

-- Trigger för att uppdatera centroid när geometri ändras
CREATE OR REPLACE FUNCTION update_water_body_centroid()
RETURNS TRIGGER AS $$
BEGIN
  -- Denna trigger kan användas om vi vill lagra centroider som separata kolumner
  -- för bättre prestanda, men vi använder view istället
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Säkerhetsinställningar
GRANT EXECUTE ON FUNCTION water_bodies_within_distance TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_water_body_centroid TO anon, authenticated;
GRANT SELECT ON water_bodies_with_centroids TO anon, authenticated;