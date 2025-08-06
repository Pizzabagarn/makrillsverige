-- SKAPA FUNKTION MED EXAKT SAMMA TYPER SOM water_bodies_merged_fast_lookup
-- Kopierat från water_bodies_with_places_merged som har dessa typer

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
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    CASE 
      WHEN w.water_type = 'lake' THEN 1
      WHEN w.water_type = 'river' THEN 2
      WHEN w.water_type = 'stream' THEN 3
      ELSE 4
    END,
    w.area_km2 DESC NULLS LAST
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

SELECT 'FUNKTION SKAPAD MED SETOF - ANVÄNDER TABELLENS EXAKTA STRUKTUR!' as status;