-- REFRESHA MATERIALIZED VIEW efter country-fix

REFRESH MATERIALIZED VIEW water_bodies_merged_fast_lookup;

-- Testa resultatet
SELECT 
    'SEGE Å FINAL TEST' as test,
    name,
    municipality,
    country,
    water_type
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%sege%'
  AND municipality ILIKE '%burlöv%'
LIMIT 1;

SELECT '✅ MATERIALIZED VIEW REFRESHAD!' as status;