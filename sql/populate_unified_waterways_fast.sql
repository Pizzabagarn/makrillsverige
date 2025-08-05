-- ================================================================
-- SNABB SQL-BASERAD POPULATION AV WATER_BODIES_UNIFIED
-- ================================================================
-- Rör ALDRIG water_bodies_integrated - endast läsning!

-- STEG 1: Rensa unified-tabellen
TRUNCATE TABLE water_bodies_unified;

-- STEG 2: Identifiera vattentyper först
WITH water_classification AS (
  SELECT 
    *,
    CASE 
      WHEN name ILIKE '%sjö%' OR name ILIKE '%tjärn%' OR name ILIKE '%vatten%' 
           OR name ILIKE '%träsk%' OR name ILIKE '%göl%' OR name ILIKE '%viken%'
           OR name ILIKE '%fjärd%' OR water_type = 'lake' THEN 'lake'
      WHEN name ILIKE '%å' OR name ILIKE '%älv%' OR name ILIKE '%bäck%' 
           OR name ILIKE '%ström%' OR water_type IN ('river', 'stream') THEN 'river'
      ELSE 'unknown'
    END as detected_water_type
  FROM water_bodies_integrated
  WHERE ST_IsValid(geometry) = true  -- Filtrera korrupt geometri direkt
    AND name IS NOT NULL 
    AND name != ''
),

-- STEG 3: Geografisk klustring för åar/floder (5km-regel)
river_clusters AS (
  SELECT 
    *,
    ST_ClusterDBSCAN(geometry, 5000, 1) OVER (PARTITION BY name) as cluster_id
  FROM water_classification
  WHERE detected_water_type = 'river'
),

-- STEG 4: Slå ihop river-segment per kluster
unified_rivers AS (
  SELECT 
    name,
    cluster_id,
    ST_Collect(geometry) as unified_geometry,
    ST_Centroid(ST_Collect(geometry)) as centroid_geom,
    COUNT(*) as segment_count,
    ARRAY_AGG(id) as original_segment_ids,
    AVG(lat) as avg_lat,
    AVG(lon) as avg_lon,
    SUM(COALESCE(area_km2, 0)) as total_area,
    MAX(COALESCE(depth_max, 0)) as max_depth,
    STRING_AGG(DISTINCT data_source, ', ') as combined_sources,
    STRING_AGG(DISTINCT COALESCE(tags::text, ''), '; ') as combined_tags
  FROM river_clusters
  GROUP BY name, cluster_id
),

-- STEG 5: Kontroll för långa vattendrag (>50km)
long_river_check AS (
  SELECT 
    *,
    ST_Length(unified_geometry::geography) / 1000 as length_km,
    CASE 
      WHEN ST_Length(unified_geometry::geography) > 50000 AND segment_count > 10 
      THEN true 
      ELSE false 
    END as needs_splitting
  FROM unified_rivers
)

-- STEG 6-9: EN STOR INSERT MED ALLA TYPER (CTEs fungerar bara inom samma query)
INSERT INTO water_bodies_unified (
  name, display_name, search_terms, geometry, lat, lon,
  total_area_km2, depth_max, original_segment_count, original_segment_ids,
  unification_method, water_type, data_source, tags, processing_notes, is_split_section
)
-- Alla sjöar (oförändrade)
SELECT 
  name,
  name as display_name,
  name as search_terms,
  geometry,
  lat, lon,
  area_km2 as total_area_km2,
  depth_max,
  1 as original_segment_count,
  ARRAY[id] as original_segment_ids,
  'single' as unification_method,
  'lake' as water_type,
  data_source,
  NULL::jsonb as tags,
  'Direct copy - lake/pond' as processing_notes,
  false as is_split_section
FROM water_classification
WHERE detected_water_type = 'lake'

UNION ALL

-- Sammansatta åar/floder (korta)
SELECT 
  name,
  name as display_name,
  name as search_terms,
  unified_geometry,
  ST_Y(ST_Centroid(unified_geometry)),
  ST_X(ST_Centroid(unified_geometry)),
  total_area as total_area_km2,
  max_depth,
  segment_count,
  original_segment_ids,
  CASE 
    WHEN segment_count = 1 THEN 'single'
    ELSE 'st_collect_merge'
  END as unification_method,
  'river' as water_type,
  combined_sources,
  NULL::jsonb as tags,
  CONCAT('Merged ', segment_count, ' segments using ST_Collect') as processing_notes,
  false as is_split_section
FROM long_river_check
WHERE needs_splitting = false

UNION ALL

-- Långa vattendrag (>50km) - INGEN OMDÖPNING ÄN
SELECT 
  name,
  name as display_name,
  name as search_terms,
  unified_geometry,
  ST_Y(ST_Centroid(unified_geometry)),
  ST_X(ST_Centroid(unified_geometry)),
  total_area as total_area_km2,
  max_depth,
  segment_count,
  original_segment_ids,
  'st_collect_long_river' as unification_method,
  'river' as water_type,
  combined_sources,
  NULL::jsonb as tags,
  CONCAT('Long river ', ROUND(length_km::numeric, 1), 'km - merged segments, needs future splitting/geocoding') as processing_notes,
  true as is_split_section
FROM long_river_check
WHERE needs_splitting = true

UNION ALL

-- Okända vattentyper
SELECT 
  name,
  name as display_name,
  name as search_terms,
  geometry,
  lat, lon,
  area_km2 as total_area_km2,
  depth_max,
  1 as original_segment_count,
  ARRAY[id] as original_segment_ids,
  'single' as unification_method,
  'unknown' as water_type,
  data_source,
  NULL::jsonb as tags,
  'Unknown water type - needs classification' as processing_notes,
  false as is_split_section
FROM water_classification
WHERE detected_water_type = 'unknown';

-- STEG 10: Uppdatera statistik
ANALYZE water_bodies_unified;

-- Visa resultat
SELECT 
  water_type,
  unification_method,
  COUNT(*) as count,
  AVG(original_segment_count) as avg_segments_per_waterway
FROM water_bodies_unified 
GROUP BY water_type, unification_method
ORDER BY water_type, count DESC;

-- Total sammanfattning
SELECT 
  'TOTALT' as category,
  COUNT(*) as unified_waterways,
  SUM(original_segment_count) as total_original_segments
FROM water_bodies_unified;