-- FIXA MATERIALIZED VIEW med KLUSTRING!
-- Detta kommer att återskapa stora sjöar som Vänern korrekt

-- 1. Ta bort den felaktiga materialized view
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup CASCADE;

-- 2. Skapa NY materialized view med GEOGRAFISK KLUSTRING
CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup AS
WITH clustered_waters AS (
  SELECT 
    id,
    name,
    display_name,
    water_type,
    geometry,
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
    name_conflicts,
    disambiguation_method,
    administrative_source,
    lat,
    lon,
    
    -- GEOGRAFISK KLUSTRING: Slå ihop segment med samma namn inom 5km
    -- Detta återställer Vänern och andra stora sjöar!
    ST_ClusterDBSCAN(geometry, 5000, 1) OVER (PARTITION BY name) as geographic_cluster_id
    
  FROM water_bodies_with_places
  WHERE name IS NOT NULL 
    AND geometry IS NOT NULL
    AND ST_IsValid(geometry) = true
),

-- 3. Slå ihop kluster till unified geometrier (för stora sjöar som Vänern)
unified_waters AS (
  SELECT 
    -- För kluster med flera segment: använd ST_Collect för att slå ihop
    CASE 
      WHEN COUNT(*) OVER (PARTITION BY name, geographic_cluster_id) > 1 THEN
        ROW_NUMBER() OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC)
      ELSE 1
    END as row_num,
    
    -- Använd första (största) segmentet som bas
    FIRST_VALUE(id) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as id,
    name,
    FIRST_VALUE(display_name) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as display_name,
    FIRST_VALUE(water_type) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as water_type,
    
    -- KRITISK: Slå ihop geometrier för kluster med flera segment
    CASE 
      WHEN COUNT(*) OVER (PARTITION BY name, geographic_cluster_id) > 1 THEN
        ST_Collect(geometry) OVER (PARTITION BY name, geographic_cluster_id)
      ELSE geometry
    END as geometry,
    
    -- Summera area för kluster
    SUM(COALESCE(area_km2, 0)) OVER (PARTITION BY name, geographic_cluster_id) as area_km2,
    
    FIRST_VALUE(data_source) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as data_source,
    FIRST_VALUE(source_priority) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as source_priority,
    FIRST_VALUE(original_id) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as original_id,
    FIRST_VALUE(depth_mean) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as depth_mean,
    FIRST_VALUE(depth_max) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as depth_max,
    FIRST_VALUE(volume_m3) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as volume_m3,
    FIRST_VALUE(ecological_status) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as ecological_status,
    
    -- Räkna segment i klustret
    COUNT(*) OVER (PARTITION BY name, geographic_cluster_id) as segment_count,
    
    CASE 
      WHEN COUNT(*) OVER (PARTITION BY name, geographic_cluster_id) > 1 THEN 'geographic_clustering'
      ELSE FIRST_VALUE(unification_method) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC)
    END as unification_method,
    
    COUNT(*) OVER (PARTITION BY name, geographic_cluster_id) as cluster_size,
    
    CASE 
      WHEN COUNT(*) OVER (PARTITION BY name, geographic_cluster_id) > 1 THEN 'dbscan_5km'
      ELSE FIRST_VALUE(cluster_method) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC)
    END as cluster_method,
    
    FIRST_VALUE(osm_id) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as osm_id,
    FIRST_VALUE(osm_type) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as osm_type,
    FIRST_VALUE(fishing_regulations) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as fishing_regulations,
    FIRST_VALUE(water_quality_status) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as water_quality_status,
    FIRST_VALUE(region) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as region,
    FIRST_VALUE(water_district) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as water_district,
    FIRST_VALUE(tags) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as tags,
    FIRST_VALUE(metadata_source) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as metadata_source,
    FIRST_VALUE(municipality) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as municipality,
    FIRST_VALUE(municipality_type) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as municipality_type,
    FIRST_VALUE(county) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as county,
    FIRST_VALUE(country) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as country,
    FIRST_VALUE(name_conflicts) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as name_conflicts,
    FIRST_VALUE(disambiguation_method) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as disambiguation_method,
    FIRST_VALUE(administrative_source) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as administrative_source,
    
    -- Beräkna centroid från unified geometri
    FIRST_VALUE(lat) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as lat,
    FIRST_VALUE(lon) OVER (PARTITION BY name, geographic_cluster_id ORDER BY area_km2 DESC) as lon
    
  FROM clustered_waters
)

-- 4. Slutlig SELECT med förberäknade centroider
SELECT 
    id,
    name,
    display_name,
    water_type,
    geometry,
    
    -- FÖRBERÄKNADE koordinater för blixtsnabb lookup
    ST_Y(ST_PointOnSurface(geometry)) as center_lat,
    ST_X(ST_PointOnSurface(geometry)) as center_lon,
    
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
    name_conflicts,
    disambiguation_method,
    administrative_source,
    
    -- SAMMA popularity score som gamla systemet
    CASE 
        WHEN area_km2 > 100 THEN 1000 + area_km2::INTEGER
        WHEN area_km2 > 10 THEN 500 + area_km2::INTEGER  
        WHEN area_km2 > 1 THEN 100 + area_km2::INTEGER
        ELSE 50
    END as popularity_score,
    
    lat,
    lon

FROM unified_waters
WHERE row_num = 1  -- Bara första raden från varje kluster
ORDER BY area_km2 DESC NULLS LAST;

-- 5. SAMMA INDEX som innan
CREATE INDEX IF NOT EXISTS idx_places_fast_ultra_hot_clickable_waters 
ON water_bodies_with_places_fast_lookup (center_lat, center_lon, popularity_score DESC, area_km2 DESC)
WHERE popularity_score > 10 AND area_km2 > 0.1;

CREATE INDEX IF NOT EXISTS idx_places_fast_ultra_hot_display_names 
ON water_bodies_with_places_fast_lookup (display_name text_pattern_ops, area_km2 DESC)
WHERE area_km2 > 0.1;

CREATE INDEX IF NOT EXISTS idx_places_fast_search_optimized 
ON water_bodies_with_places_fast_lookup (name text_pattern_ops, data_source, area_km2 DESC)
WHERE name IS NOT NULL AND geometry IS NOT NULL;

-- ANALYZE för att uppdatera query planner statistics
ANALYZE water_bodies_with_places_fast_lookup;