-- FIXA COUNTRY-KODER i huvudtabellen och refresha materialized view

-- 1. Uppdatera HUVUDTABELLEN (inte materialized view)
UPDATE water_bodies_merged_fixed 
SET country = (
    SELECT DISTINCT orig.country 
    FROM water_bodies_with_places_fast_lookup orig
    WHERE orig.id = ANY(water_bodies_merged_fixed.original_segment_ids)
      AND orig.country IS NOT NULL
    LIMIT 1
)
WHERE water_type IN ('river', 'stream', 'lake')
  AND original_segment_ids IS NOT NULL
  AND array_length(original_segment_ids, 1) > 0;

-- 2. Refresha materialized view
REFRESH MATERIALIZED VIEW water_bodies_merged_fast_lookup;

-- 3. Verifiera resultatet
SELECT 
    'EFTER FIX OCH REFRESH' as test,
    COUNT(*) FILTER (WHERE country = 'SE') as svenska,
    COUNT(*) FILTER (WHERE country = 'DK') as danska, 
    COUNT(*) FILTER (WHERE country = 'NO') as norska,
    COUNT(*) FILTER (WHERE country IS NULL) as saknar_country
FROM water_bodies_merged_fast_lookup
WHERE water_type IN ('river', 'stream');

-- 4. Testa Sege å
SELECT 
    'SEGE Å EFTER FIX' as test,
    name,
    municipality,
    country,
    water_type
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%sege%'
  AND municipality ILIKE '%burlöv%'
LIMIT 1;

SELECT '✅ COUNTRY-KODER FIXADE I HUVUDTABELL OCH REFRESHADE!' as status;