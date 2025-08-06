-- KOLLA VILKA MATERIALIZED VIEWS SOM FINNS

-- 1. Lista alla materialized views
SELECT 
    'MATERIALIZED VIEWS' as info,
    schemaname,
    matviewname,
    hasindexes,
    ispopulated
FROM pg_matviews 
WHERE matviewname LIKE '%water%'
ORDER BY matviewname;

-- 2. Kolla om den nya materialized viewn finns och är populerad
SELECT 
    'NYA MATERIALIZED VIEW STATUS' as test,
    COUNT(*) as antal_rader,
    COUNT(*) FILTER (WHERE water_type = 'lake') as sjöar,
    COUNT(*) FILTER (WHERE ST_IsValid(geometry) = false) as ogiltiga_geometrier
FROM water_bodies_merged_fast_lookup;

-- 3. Jämför med huvudtabellen
SELECT 
    'HUVUDTABELL STATUS' as test,
    COUNT(*) as antal_rader,
    COUNT(*) FILTER (WHERE water_type = 'lake') as sjöar,
    COUNT(*) FILTER (WHERE ST_IsValid(geometry) = false) as ogiltiga_geometrier
FROM water_bodies_with_places_merged;

-- 4. Kolla index på materialized view
SELECT 
    'INDEX PÅ MATERIALIZED VIEW' as info,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'water_bodies_merged_fast_lookup'
ORDER BY indexname;

-- 1. Lista alla materialized views
SELECT 
    'MATERIALIZED VIEWS' as info,
    schemaname,
    matviewname,
    hasindexes,
    ispopulated
FROM pg_matviews 
WHERE matviewname LIKE '%water%'
ORDER BY matviewname;

-- 2. Kolla om den nya materialized viewn finns och är populerad
SELECT 
    'NYA MATERIALIZED VIEW STATUS' as test,
    COUNT(*) as antal_rader,
    COUNT(*) FILTER (WHERE water_type = 'lake') as sjöar,
    COUNT(*) FILTER (WHERE ST_IsValid(geometry) = false) as ogiltiga_geometrier
FROM water_bodies_merged_fast_lookup;

-- 3. Jämför med huvudtabellen
SELECT 
    'HUVUDTABELL STATUS' as test,
    COUNT(*) as antal_rader,
    COUNT(*) FILTER (WHERE water_type = 'lake') as sjöar,
    COUNT(*) FILTER (WHERE ST_IsValid(geometry) = false) as ogiltiga_geometrier
FROM water_bodies_with_places_merged;

-- 4. Kolla index på materialized view
SELECT 
    'INDEX PÅ MATERIALIZED VIEW' as info,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'water_bodies_merged_fast_lookup'
ORDER BY indexname;