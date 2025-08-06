-- OPTIMERA KLICKFUNKTION för water_bodies_merged_fast_lookup
-- Lägg till spatial förfiltrering för dramatisk prestandaförbättring

DROP FUNCTION IF EXISTS find_merged_water_body_containing_point(NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION find_merged_water_body_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS SETOF water_bodies_merged_fast_lookup AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- KRITISK OPTIMERING: Spatial förfiltrering FÖRST
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    -- SEDAN exakt geometritest
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    -- Prioritera sjöar över vattendrag
    CASE 
      WHEN w.water_type = 'lake' THEN 1
      WHEN w.water_type = 'river' THEN 2
      WHEN w.water_type = 'stream' THEN 3
      ELSE 4
    END,
    -- Större sjöar först
    w.area_km2 DESC NULLS LAST,
    -- Närmare klickpunkt
    ST_Distance(
      ST_Transform(ST_Centroid(w.geometry), 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) ASC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Kontrollera att funktionen skapades korrekt
SELECT 
    'OPTIMERAD FUNKTION SKAPAD!' as status,
    EXISTS(
        SELECT 1 FROM pg_proc 
        WHERE proname = 'find_merged_water_body_containing_point'
    ) as function_exists;

-- Test med en känd koordinat (Göteborg-området)
SELECT 
    'TEST KLICK' as test,
    name,
    water_type,
    area_km2,
    municipality,
    country
FROM find_merged_water_body_containing_point(57.7, 11.9, 0.02)
LIMIT 3;