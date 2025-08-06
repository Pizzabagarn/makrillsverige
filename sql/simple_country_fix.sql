-- ENKEL OCH SNABB COUNTRY-FIX

-- Uppdatera bara de som saknar country eller har fel
UPDATE water_bodies_merged_fixed 
SET country = 'SE'
WHERE municipality IN ('Burlöv', 'Malmö', 'Lund', 'Stockholm', 'Göteborg', 'Helsingborg', 'Mariestad')
  AND (country IS NULL OR country != 'SE');

UPDATE water_bodies_merged_fixed 
SET country = 'DK' 
WHERE municipality IN ('Holstebro', 'Aalborg', 'Aarhus', 'København', 'Faaborg-Midtfyn', 'Jammerbugt', 'Vejle', 'Fredericia', 'Brønderslev')
  AND (country IS NULL OR country != 'DK');

UPDATE water_bodies_merged_fixed 
SET country = 'NO'
WHERE municipality IN ('Oslo', 'Bergen', 'Trondheim', 'Sunnfjord', 'Kongsberg')
  AND (country IS NULL OR country != 'NO');

-- Refresha materialized view
REFRESH MATERIALIZED VIEW water_bodies_merged_fast_lookup;

-- Test
SELECT 
    'COUNTRY FIX RESULTAT' as test,
    country,
    COUNT(*) as antal
FROM water_bodies_merged_fast_lookup
WHERE water_type IN ('river', 'stream')
GROUP BY country
ORDER BY COUNT(*) DESC;

SELECT '✅ COUNTRY-KODER FIXADE SNABBT!' as status;