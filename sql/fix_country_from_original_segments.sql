-- FIXA COUNTRY-KODER från ursprungliga segment i gamla tabellen

-- 1. Visa problemet först
SELECT 
    'PROBLEM CHECK' as test,
    COUNT(*) FILTER (WHERE country = 'SE') as svenska,
    COUNT(*) FILTER (WHERE country = 'DK') as danska,
    COUNT(*) FILTER (WHERE country = 'NO') as norska,
    COUNT(*) FILTER (WHERE country IS NULL) as saknar_country
FROM water_bodies_merged_fast_lookup
WHERE water_type IN ('river', 'stream');

-- 2. Fixa country-koder från ursprungliga segment
UPDATE water_bodies_merged_fast_lookup 
SET country = (
    SELECT DISTINCT orig.country 
    FROM water_bodies_with_places_fast_lookup orig
    WHERE orig.id = ANY(water_bodies_merged_fast_lookup.original_segment_ids)
      AND orig.country IS NOT NULL
    LIMIT 1
)
WHERE water_type IN ('river', 'stream', 'lake')
  AND original_segment_ids IS NOT NULL
  AND array_length(original_segment_ids, 1) > 0;

-- 3. Verifiera resultatet
SELECT 
    'EFTER FIX' as test,
    COUNT(*) FILTER (WHERE country = 'SE') as svenska,
    COUNT(*) FILTER (WHERE country = 'DK') as danska, 
    COUNT(*) FILTER (WHERE country = 'NO') as norska,
    COUNT(*) FILTER (WHERE country IS NULL) as saknar_country
FROM water_bodies_merged_fast_lookup
WHERE water_type IN ('river', 'stream');

-- 4. Testa Sege å specifikt
SELECT 
    'SEGE Å TEST' as test,
    name,
    municipality,
    country,
    original_segment_ids[1:3] as första_segment_ids
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%sege%'
LIMIT 3;

SELECT '✅ COUNTRY-KODER FIXADE FRÅN URSPRUNGLIGA SEGMENT!' as status;