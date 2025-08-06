-- ENKEL FUNGERANDE KLICKFUNKTION
-- Klicka på bäck = få bäck. Klicka på sjö = få sjö. Klicka nära = få närmaste.

DROP FUNCTION IF EXISTS find_merged_water_body_containing_point(NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION find_merged_water_body_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS SETOF water_bodies_merged_fast_lookup AS $$
BEGIN
  -- STEG 1: EXAKT TRÄFF - klick INUTI vattendrag
  RETURN QUERY
  SELECT *
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- Snabb förfiltrering
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    -- EXAKT träff
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    -- Sjöar först vid överlapp
    CASE WHEN w.water_type = 'lake' THEN 1 ELSE 2 END,
    -- Närmast först
    ST_Distance(ST_Transform(w.geometry, 3857), ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857))
  LIMIT 5;

  -- Om vi fick resultat, sluta här
  IF FOUND THEN
    RETURN;
  END IF;

  -- STEG 2: NÄRHET - klick NÄRA vattendrag
  RETURN QUERY
  SELECT *
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- Snabb förfiltrering
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    -- NÄRA vattendrag
    AND ST_DWithin(w.geometry, ST_Point(click_lon, click_lat, 4326), search_radius_deg)
  ORDER BY
    -- Närmast först
    ST_Distance(ST_Transform(w.geometry, 3857), ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)),
    -- Sjöar först vid samma avstånd
    CASE WHEN w.water_type = 'lake' THEN 1 ELSE 2 END
  LIMIT 3;

  RETURN;
END;
$$ LANGUAGE plpgsql;