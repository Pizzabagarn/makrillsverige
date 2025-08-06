-- KOPIERA COUNTRY-KODER DIREKT UTAN HÅRDKODNING

-- Droppa materialized view
DROP MATERIALIZED VIEW water_bodies_merged_fast_lookup;

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

SELECT '✅ COUNTRY KOPIERAT FRÅN GAMLA TABELLEN!' as status;