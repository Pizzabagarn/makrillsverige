-- UNDERSÖK EXAKT VILKA TYPER TABELLEN HAR

-- 1. Kolla alla kolumn-typer i materialized view
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'water_bodies_merged_fast_lookup'
ORDER BY ordinal_position;

-- 2. Specifikt kolla problematiska kolumner
SELECT 
    'KOLUMN TYPER' as info,
    pg_typeof(id) as id_type,
    pg_typeof(name) as name_type,
    pg_typeof(water_type) as water_type_type,
    pg_typeof(lat) as lat_type,
    pg_typeof(lon) as lon_type,
    pg_typeof(area_km2) as area_km2_type,
    pg_typeof(source_priority) as source_priority_type,
    pg_typeof(depth_mean) as depth_mean_type,
    pg_typeof(depth_max) as depth_max_type,
    pg_typeof(volume_m3) as volume_m3_type,
    pg_typeof(segment_count) as segment_count_type,
    pg_typeof(cluster_size) as cluster_size_type,
    pg_typeof(osm_id) as osm_id_type,
    pg_typeof(name_conflicts) as name_conflicts_type
FROM water_bodies_merged_fast_lookup 
LIMIT 1;

SELECT 'UNDERSÖKNING KLAR - NU SER VI EXAKTA TYPER!' as status;