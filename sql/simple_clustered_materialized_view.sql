-- ENKEL OCH FUNGERANDE MATERIALIZED VIEW med klustring
-- Slår ihop segment med samma namn inom 5km (precis som det gamla systemet)

-- 1. Ta bort den felaktiga materialized view
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup CASCADE;

-- 2. Skapa ENKEL materialized view med ST_ClusterDBSCAN
CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup AS
WITH clustered_data AS (
  SELECT 
    *,
    -- GEOGRAFISK KLUSTRING: samma namn inom 5km blir samma kluster
    ST_ClusterDBSCAN(geometry, 5000, 1) OVER (PARTITION BY name ORDER BY area_km2 DESC) as cluster_id
  FROM water_bodies_with_places
  WHERE name IS NOT NULL 
    AND geometry IS NOT NULL
    AND ST_IsValid(geometry) = true
),

-- 3. Slå ihop kluster till unified geometrier
unified_clusters AS (
  SELECT 
    -- Ta första (största) ID från varje kluster
    (array_agg(id ORDER BY area_km2 DESC))[1] as id,
    
    name,
    (array_agg(display_name ORDER BY area_km2 DESC))[1] as display_name,
    (array_agg(water_type ORDER BY area_km2 DESC))[1] as water_type,
    
    -- KRITISK: ST_Collect slår ihop alla geometrier i klustret
    CASE 
      WHEN count(*) > 1 THEN ST_Collect(geometry)
      ELSE (array_agg(geometry))[1]
    END as geometry,
    
    -- Summera area för hela klustret
    sum(COALESCE(area_km2, 0)) as area_km2,
    
    (array_agg(data_source ORDER BY area_km2 DESC))[1] as data_source,
    (array_agg(source_priority ORDER BY area_km2 DESC))[1] as source_priority,
    (array_agg(original_id ORDER BY area_km2 DESC))[1] as original_id,
    (array_agg(depth_mean ORDER BY area_km2 DESC))[1] as depth_mean,
    (array_agg(depth_max ORDER BY area_km2 DESC))[1] as depth_max,
    (array_agg(volume_m3 ORDER BY area_km2 DESC))[1] as volume_m3,
    (array_agg(ecological_status ORDER BY area_km2 DESC))[1] as ecological_status,
    
    -- Räkna segment i klustret
    count(*)::integer as segment_count,
    
    CASE 
      WHEN count(*) > 1 THEN 'geographic_clustering'
      ELSE (array_agg(unification_method ORDER BY area_km2 DESC))[1]
    END as unification_method,
    
    count(*)::integer as cluster_size,
    
    CASE 
      WHEN count(*) > 1 THEN 'dbscan_5km'
      ELSE (array_agg(cluster_method ORDER BY area_km2 DESC))[1]
    END as cluster_method,
    
    (array_agg(osm_id ORDER BY area_km2 DESC))[1] as osm_id,
    (array_agg(osm_type ORDER BY area_km2 DESC))[1] as osm_type,
    (array_agg(fishing_regulations ORDER BY area_km2 DESC))[1] as fishing_regulations,
    (array_agg(water_quality_status ORDER BY area_km2 DESC))[1] as water_quality_status,
    (array_agg(region ORDER BY area_km2 DESC))[1] as region,
    (array_agg(water_district ORDER BY area_km2 DESC))[1] as water_district,
    (array_agg(tags ORDER BY area_km2 DESC))[1] as tags,
    (array_agg(metadata_source ORDER BY area_km2 DESC))[1] as metadata_source,
    
    -- Platsnamn från första (största) segmentet
    (array_agg(municipality ORDER BY area_km2 DESC))[1] as municipality,
    (array_agg(municipality_type ORDER BY area_km2 DESC))[1] as municipality_type,
    (array_agg(county ORDER BY area_km2 DESC))[1] as county,
    (array_agg(country ORDER BY area_km2 DESC))[1] as country,
    (array_agg(name_conflicts ORDER BY area_km2 DESC))[1] as name_conflicts,
    (array_agg(disambiguation_method ORDER BY area_km2 DESC))[1] as disambiguation_method,
    (array_agg(administrative_source ORDER BY area_km2 DESC))[1] as administrative_source,
    
    -- Originella koordinater från största segmentet
    (array_agg(lat ORDER BY area_km2 DESC))[1] as lat,
    (array_agg(lon ORDER BY area_km2 DESC))[1] as lon
    
  FROM clustered_data
  GROUP BY name, cluster_id
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

FROM unified_clusters
ORDER BY area_km2 DESC NULLS LAST;

-- 5. KRITISKA INDEX
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

-- TESTA RESULTATET
SELECT 
  name, 
  count(*) as entries,
  max(area_km2) as max_area,
  max(cluster_size) as max_cluster_size,
  max(segment_count) as max_segments
FROM water_bodies_with_places_fast_lookup 
WHERE name ILIKE '%vänern%'
GROUP BY name
ORDER BY max_area DESC;