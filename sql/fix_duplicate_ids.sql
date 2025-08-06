-- FIXA DUBLETTER I NYA TABELLEN

-- 1. Hitta alla dubletter
SELECT 
    'DUBLETTER I NYA TABELLEN' as problem,
    id,
    COUNT(*) as antal_dubletter,
    array_agg(name || ' (' || COALESCE(municipality, 'Okänd') || ')') as namn
FROM water_bodies_merged_fast_lookup
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 10;

-- 2. Kolla totalt antal dubletter
SELECT 
    'DUBLETT STATISTIK' as info,
    COUNT(*) as totala_rader,
    COUNT(DISTINCT id) as unika_ids,
    COUNT(*) - COUNT(DISTINCT id) as antal_dubletter
FROM water_bodies_merged_fast_lookup;

-- 3. Skapa ny tabell med unika ID:n
DROP TABLE IF EXISTS water_bodies_merged_fixed CASCADE;

CREATE TABLE water_bodies_merged_fixed AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY area_km2 DESC NULLS LAST, id) as id,  -- NYA UNIKA ID:n
    name,
    water_type,
    geometry,
    center_lat,
    center_lon,
    lat,
    lon,
    area_km2,
    data_source,
    source_priority,
    original_id,
    depth_mean,
    depth_max,
    volume_m3,
    ecological_status,
    segment_count,
    unification_method,
    cluster_size,
    cluster_method,
    osm_id,
    osm_type,
    fishing_regulations,
    water_quality_status,
    region,
    water_district,
    tags,
    metadata_source,
    municipality,
    municipality_type,
    county,
    country,
    display_name,
    name_conflicts,
    disambiguation_method,
    administrative_source,
    original_segment_ids,
    merge_group_id,
    has_natural_gaps,
    merge_method,
    segments_merged
FROM water_bodies_merged_fast_lookup;

-- 4. Verifiera att dubletter är borta
SELECT 
    'FIXAD TABELL VERIFIERING' as test,
    COUNT(*) as totala_rader,
    COUNT(DISTINCT id) as unika_ids,
    CASE 
        WHEN COUNT(*) = COUNT(DISTINCT id) THEN '✅ INGA DUBLETTER'
        ELSE '❌ DUBLETTER KVAR'
    END as status
FROM water_bodies_merged_fixed;

SELECT 'DUBLETTER FIXADE!' as status;