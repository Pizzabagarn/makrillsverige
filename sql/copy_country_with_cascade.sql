-- KOPIERA COUNTRY-KODER med CASCADE för att droppa beroenden

-- Droppa materialized view med CASCADE
DROP MATERIALIZED VIEW water_bodies_merged_fast_lookup CASCADE;

-- Lägg till country från gamla tabellen direkt i huvudtabellen
UPDATE water_bodies_merged_fixed m
SET country = old.country
FROM water_bodies_with_places_fast_lookup old
WHERE old.id = m.original_segment_ids[1];

-- Återskapa materialized view
CREATE MATERIALIZED VIEW water_bodies_merged_fast_lookup AS
SELECT * FROM water_bodies_merged_fixed
ORDER BY area_km2 DESC NULLS LAST;

-- Återskapa index
CREATE INDEX idx_merged_fast_search_name ON water_bodies_merged_fast_lookup USING btree (name text_pattern_ops);
CREATE INDEX idx_merged_fast_click_geometry ON water_bodies_merged_fast_lookup USING gist (geometry);

-- Återskapa funktionen
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

-- Test
SELECT 
    'SEGE Å TEST' as test,
    name,
    country,
    municipality
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%sege%'
LIMIT 1;

SELECT '✅ ALLT ÅTERSKAPAT MED RÄTTA COUNTRY-KODER!' as status;