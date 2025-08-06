-- STEG 4: Kopiera sjöar först (snabbt)
-- Kör efter steg 3

INSERT INTO water_bodies_with_places_merged (
    id, name, water_type, geometry, lat, lon, area_km2, data_source,
    source_priority, original_id, depth_mean, depth_max, volume_m3,
    ecological_status, segment_count, unification_method, cluster_size,
    cluster_method, osm_id, osm_type, fishing_regulations, water_quality_status,
    region, water_district, tags, metadata_source, municipality,
    municipality_type, county, country, display_name, name_conflicts,
    disambiguation_method, administrative_source,
    original_segment_ids, merge_group_id, has_natural_gaps, 
    merge_method, segments_merged
)
SELECT 
    id, name, water_type, geometry, lat, lon, area_km2, data_source,
    source_priority, original_id, depth_mean, depth_max, volume_m3,
    ecological_status, segment_count, unification_method, cluster_size,
    cluster_method, osm_id, osm_type, fishing_regulations, water_quality_status,
    region, water_district, tags, metadata_source, municipality,
    municipality_type, county, country, display_name, name_conflicts,
    disambiguation_method, administrative_source,
    ARRAY[id] as original_segment_ids,
    1 as merge_group_id,
    FALSE as has_natural_gaps,
    'no_merge_lake' as merge_method,
    1 as segments_merged
FROM water_bodies_with_places_fast_lookup 
WHERE water_type = 'lake';

SELECT 
    'STEG 4 KLAR ✅' as status,
    COUNT(*) as lakes_copied
FROM water_bodies_with_places_merged 
WHERE water_type = 'lake';