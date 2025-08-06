-- TESTA PRESTANDA OCH PRECISION för nya klickfunktionen
-- Jämför gamla vs nya funktionen

-- 1. PRESTANDATEST med EXPLAIN ANALYZE
SELECT '=== PRESTANDATEST ===' as test_section;

-- Test gamla långsamma versionen (utan spatial förfiltrering)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM water_bodies_merged_fast_lookup w
WHERE w.geometry IS NOT NULL
  AND w.name IS NOT NULL
  AND ST_Contains(w.geometry, ST_Point(11.9, 57.7, 4326))
ORDER BY area_km2 DESC NULLS LAST
LIMIT 5;

SELECT '=== NYA OPTIMERADE FUNKTIONEN ===' as test_section;

-- Test nya snabba versionen (med spatial förfiltrering)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM find_merged_water_body_containing_point(57.7, 11.9, 0.02);

-- 2. PRECISIONSTEST med olika koordinater
SELECT '=== PRECISIONSTEST ===' as test_section;

-- Test 1: Klick mitt i en stor sjö (ska ge exakt träff)
SELECT 
    'TEST 1: STOR SJÖ' as test_case,
    name,
    water_type,
    area_km2,
    municipality,
    'Exakt träff förväntat' as expected_result
FROM find_merged_water_body_containing_point(58.0, 13.0, 0.02)  -- Vänern-området
LIMIT 3;

-- Test 2: Klick nära en liten å (ska ge smart hjälp)
SELECT 
    'TEST 2: LITEN Å' as test_case,
    name,
    water_type,
    COALESCE(area_km2, 0) as area_km2,
    municipality,
    'Smart hjälp förväntat för små vattendrag' as expected_result
FROM find_merged_water_body_containing_point(59.3, 18.0, 0.02)  -- Stockholm-området
LIMIT 3;

-- Test 3: Klick i vatten utan vattendrag (ska ge tomt resultat)
SELECT 
    'TEST 3: ÖPPET VATTEN' as test_case,
    COALESCE(name, 'INGEN TRÄFF') as name,
    COALESCE(water_type, 'N/A') as water_type,
    'Ingen träff förväntat' as expected_result
FROM find_merged_water_body_containing_point(57.0, 10.0, 0.02)  -- Öppet hav
LIMIT 1;

-- 3. INDEXSTATUS
SELECT '=== INDEXSTATUS ===' as test_section;

SELECT 
    indexname,
    indexdef,
    CASE 
        WHEN indexname LIKE '%geometry%' THEN 'KRITISK för ST_Contains'
        WHEN indexname LIKE '%lat%' OR indexname LIKE '%lon%' THEN 'KRITISK för spatial förfiltrering'
        WHEN indexname LIKE '%water_type%' THEN 'VIKTIGT för prioritering'
        ELSE 'STANDARD'
    END as importance
FROM pg_indexes 
WHERE tablename = 'water_bodies_merged_fast_lookup'
ORDER BY importance, indexname;

-- 4. TABELLSTATISTIK
SELECT '=== TABELLSTATISTIK ===' as test_section;

SELECT 
    'TOTALT ANTAL RADER' as metric,
    COUNT(*) as value
FROM water_bodies_merged_fast_lookup
UNION ALL
SELECT 
    'RADER MED GEOMETRI' as metric,
    COUNT(*) as value
FROM water_bodies_merged_fast_lookup 
WHERE geometry IS NOT NULL
UNION ALL
SELECT 
    'RADER MED NAMN' as metric,
    COUNT(*) as value
FROM water_bodies_merged_fast_lookup 
WHERE name IS NOT NULL
UNION ALL
SELECT 
    'SJÖAR' as metric,
    COUNT(*) as value
FROM water_bodies_merged_fast_lookup 
WHERE water_type = 'lake'
UNION ALL
SELECT 
    'VATTENDRAG (rivers/streams)' as metric,
    COUNT(*) as value
FROM water_bodies_merged_fast_lookup 
WHERE water_type IN ('river', 'stream');

-- 5. FUNKTIONSSTATUS
SELECT '=== FUNKTIONSSTATUS ===' as test_section;

SELECT 
    'find_merged_water_body_containing_point' as function_name,
    EXISTS(
        SELECT 1 FROM pg_proc 
        WHERE proname = 'find_merged_water_body_containing_point'
    ) as exists,
    'OPTIMERAD VERSION' as version;

SELECT '✅ PRESTANDA- OCH PRECISIONTEST KLART!' as final_status;