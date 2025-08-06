-- VISA FAKTISKA TYPER - ENKLARE VERSION

SELECT 
    column_name,
    data_type,
    udt_name
FROM information_schema.columns 
WHERE table_name = 'water_bodies_merged_fast_lookup'
  AND column_name IN (
    'id', 'name', 'water_type', 'lat', 'lon', 'area_km2', 
    'source_priority', 'depth_mean', 'depth_max', 'volume_m3',
    'segment_count', 'cluster_size', 'osm_id', 'name_conflicts'
  )
ORDER BY column_name;