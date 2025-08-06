-- PERFEKT PRECISION KLICKFUNKTION
-- EXAKT träff om klick INUTI geometri, annars närmaste

DROP FUNCTION IF EXISTS find_merged_water_body_containing_point(NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION find_merged_water_body_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS SETOF water_bodies_merged_fast_lookup AS $$
BEGIN
  -- STEG 1: EXAKT TRÄFF - klick INUTI geometri
  -- Om vi hittar något här, returnera det DIREKT (ingen gissning)
  
  RETURN QUERY
  SELECT *
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- Spatial förfiltrering för prestanda
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    -- EXAKT: Klick måste vara INUTI geometrin
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    -- Vid överlapp: sjöar först, sedan större area
    CASE WHEN w.water_type = 'lake' THEN 1 ELSE 2 END,
    ST_Area(ST_Transform(w.geometry, 3857)) DESC
  LIMIT 1; -- Bara EN exakt träff

  -- Om vi fick exakt träff, sluta här
  IF FOUND THEN
    RETURN;
  END IF;

  -- STEG 2: NÄRMASTE GISSNING - bara om ingen exakt träff
  -- Nu får vi gissa det mest troliga
  
  RETURN QUERY
  SELECT *
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- Spatial förfiltrering
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    -- NÄRHET: Klick nära geometrin
    AND ST_DWithin(w.geometry, ST_Point(click_lon, click_lat, 4326), search_radius_deg)
  ORDER BY
    -- Närmast först
    ST_Distance(
      ST_Transform(w.geometry, 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ),
    -- Vid samma avstånd: sjöar först
    CASE WHEN w.water_type = 'lake' THEN 1 ELSE 2 END,
    -- Större area först
    ST_Area(ST_Transform(w.geometry, 3857)) DESC
  LIMIT 3; -- Max 3 gissningar

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Skapa nödvändiga index
CREATE INDEX IF NOT EXISTS idx_merged_geometry_gist 
ON water_bodies_merged_fast_lookup USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_merged_lat_lon_btree 
ON water_bodies_merged_fast_lookup (lat, lon);

-- Uppdatera statistik
ANALYZE water_bodies_merged_fast_lookup;

SELECT 
    'PERFEKT PRECISION FUNKTION SKAPAD!' as status,
    'Exakt träff om INUTI, gissning om UTANFÖR' as logic;