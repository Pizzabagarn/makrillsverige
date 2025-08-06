-- TESTA GEOMETRI-PROBLEM och lösningar
-- Kontrollera att funktionen hanterar alla typer av geometriproblem

-- 1. ANALYSERA GEOMETRITYPER i din databas
SELECT '=== GEOMETRIANALYS ===' as section;

SELECT 
    ST_GeometryType(geometry) as geom_type,
    data_source,
    water_type,
    COUNT(*) as count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
FROM water_bodies_merged_fast_lookup 
WHERE geometry IS NOT NULL
GROUP BY ST_GeometryType(geometry), data_source, water_type
ORDER BY count DESC;

-- 2. HITTA PROBLEMGEOMETRIER
SELECT '=== POTENTIELLA PROBLEMGEOMETRIER ===' as section;

-- Geometrier som kan ha hål eller vara ofullständiga
SELECT 
    'MÖJLIGA HÅL/OFULLSTÄNDIGA' as problem_type,
    name,
    water_type,
    data_source,
    area_km2,
    ST_GeometryType(geometry) as geom_type,
    ST_IsValid(geometry) as is_valid,
    ST_Area(ST_Transform(geometry, 3857)) / 1000000 as calculated_area_km2
FROM water_bodies_merged_fast_lookup 
WHERE geometry IS NOT NULL
  AND water_type = 'lake'
  AND data_source != 'SMHI'  -- OSM-data mer sannolikt att ha problem
  AND (
    ST_GeometryType(geometry) = 'ST_LineString' OR  -- Bara kanter
    ST_GeometryType(geometry) = 'ST_MultiLineString' OR  -- Flera kanter
    NOT ST_IsValid(geometry) OR  -- Ogiltig geometri
    (area_km2 > 1.0 AND ST_Area(ST_Transform(geometry, 3857)) / 1000000 < area_km2 * 0.1)  -- Mycket mindre än förväntad area
  )
ORDER BY area_km2 DESC NULLS LAST
LIMIT 10;

-- 3. TESTA KLICKFUNKTIONEN med olika scenarier
SELECT '=== FUNKTIONSTEST ===' as section;

-- Test A: SMHI-sjö (ska fungera perfekt)
SELECT 
    'TEST A: SMHI-SJÖ (perfekt geometri)' as test_case,
    name,
    water_type,
    data_source,
    area_km2,
    'Förväntat: Exakt träff' as expected
FROM find_merged_water_body_containing_point(58.0, 13.5, 0.02)  -- Vänern-området
WHERE data_source = 'SMHI'
LIMIT 2;

-- Test B: OSM-sjö (kan ha geometriproblem)
SELECT 
    'TEST B: OSM-SJÖ (möjlig geometriproblem)' as test_case,
    name,
    water_type,
    data_source,
    area_km2,
    'Förväntat: Smart närhetsmatch' as expected
FROM find_merged_water_body_containing_point(59.3, 18.1, 0.02)  -- Stockholm-området
WHERE data_source != 'SMHI' OR data_source IS NULL
LIMIT 2;

-- Test C: Litet vattendrag (smart hjälp)
SELECT 
    'TEST C: LITET VATTENDRAG (smart hjälp)' as test_case,
    name,
    water_type,
    data_source,
    COALESCE(area_km2, 0) as area_km2,
    'Förväntat: Närhetsmatch för små vattendrag' as expected
FROM find_merged_water_body_containing_point(57.7, 12.0, 0.02)  -- Göteborg-området
WHERE water_type IN ('river', 'stream')
LIMIT 2;

-- 4. JÄMFÖR GEOMETRIMETODER
SELECT '=== GEOMETRIMETOD-JÄMFÖRELSE ===' as section;

-- Kolla hur många träffar vi får med olika metoder för samma punkt
WITH test_point AS (
  SELECT 58.0::numeric as lat, 13.5::numeric as lon, 0.02::numeric as radius
),
exact_contains AS (
  SELECT COUNT(*) as exact_count
  FROM water_bodies_merged_fast_lookup w, test_point t
  WHERE w.geometry IS NOT NULL
    AND ST_Contains(w.geometry, ST_Point(t.lon, t.lat, 4326))
),
proximity_dwithin AS (
  SELECT COUNT(*) as proximity_count
  FROM water_bodies_merged_fast_lookup w, test_point t
  WHERE w.geometry IS NOT NULL
    AND ST_DWithin(w.geometry, ST_Point(t.lon, t.lat, 4326), t.radius)
),
envelope_within AS (
  SELECT COUNT(*) as envelope_count
  FROM water_bodies_merged_fast_lookup w, test_point t
  WHERE w.geometry IS NOT NULL
    AND w.water_type = 'lake'
    AND ST_Within(ST_Point(t.lon, t.lat, 4326), ST_Envelope(w.geometry))
)
SELECT 
  e.exact_count as "ST_Contains träffar",
  p.proximity_count as "ST_DWithin träffar", 
  env.envelope_count as "ST_Envelope träffar",
  'Fler träffar = bättre för ofullständiga geometrier' as note
FROM exact_contains e, proximity_dwithin p, envelope_within env;

-- 5. PRESTANDA med nya funktionen
SELECT '=== PRESTANDATEST ===' as section;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM find_merged_water_body_containing_point(57.7, 11.9, 0.02);

SELECT '✅ GEOMETRI-EDGE CASE TEST KLART!' as final_status;