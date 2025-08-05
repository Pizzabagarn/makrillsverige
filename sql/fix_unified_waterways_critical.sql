-- KRITISK FIX för unified waterways
-- Fixar: 1) OSM-sjöar saknas, 2) Stora sjöar fragmenterade

-- RENSA och börja om
TRUNCATE TABLE water_bodies_unified;

-- FÖRBÄTTRAD klassificering som inkluderar ALLA nordiska sjöar
WITH water_classification AS (
  SELECT 
    *,
    CASE 
      -- SVENSKA sjötermer
      WHEN name ILIKE '%sjö%' OR name ILIKE '%tjärn%' OR name ILIKE '%vatten%' 
           OR name ILIKE '%träsk%' OR name ILIKE '%göl%' OR name ILIKE '%viken%'
           OR name ILIKE '%fjärd%' 
      -- NORSKA sjötermer  
           OR name ILIKE '%vatn' OR name ILIKE '%tjern' OR name ILIKE '%tjørn'
      -- DANSKA sjötermer
           OR name ILIKE '%sø' OR name ILIKE '%-å' 
      -- FINSKA sjötermer
           OR name ILIKE '%järvi' OR name ILIKE '%lampi' OR name ILIKE '%lompolo'
      -- OSM water_type
           OR water_type = 'lake' 
      -- Extra säkerhet för stora områden (troliga sjöar)
           OR (area_km2 > 1 AND water_type IS NULL AND name NOT ILIKE '%å' AND name NOT ILIKE '%älv%' AND name NOT ILIKE '%bäck%')
      THEN 'lake'
      
      WHEN name ILIKE '%å' OR name ILIKE '%älv%' OR name ILIKE '%bäck%' 
           OR name ILIKE '%ström%' OR water_type IN ('river', 'stream') THEN 'river'
      ELSE 'unknown'
    END as detected_water_type
  FROM water_bodies_integrated
  WHERE ST_IsValid(geometry) = true 
    AND name IS NOT NULL 
    AND name != ''
),

-- Gruppera ALLA vatten (både sjöar och åar) efter namn för sammansättning
all_water_groups AS (
  SELECT 
    name,
    detected_water_type,
    COUNT(*) as segment_count,
    ARRAY_AGG(id ORDER BY area_km2 DESC NULLS LAST) as segment_ids,
    
    -- ST_Collect för ALLA (både sjöar och åar som har flera segment)
    CASE 
      WHEN COUNT(*) > 1 THEN ST_Collect(geometry ORDER BY area_km2 DESC NULLS LAST)
      ELSE MAX(geometry) -- För enskilda segment
    END as unified_geometry,
    
    SUM(COALESCE(area_km2, 0)) as total_area,
    MAX(COALESCE(depth_max, 0)) as max_depth,
    AVG(lat) as avg_lat,
    AVG(lon) as avg_lon,
    STRING_AGG(DISTINCT data_source, ', ') as combined_sources
    
  FROM water_classification
  GROUP BY name, detected_water_type
),

-- Beräkna centroider för unified geometrier
final_waters AS (
  SELECT 
    name,
    detected_water_type,
    segment_count,
    segment_ids,
    unified_geometry,
    total_area,
    max_depth,
    combined_sources,
    
    -- Använd ST_PointOnSurface för bättre centroider
    ST_Y(ST_PointOnSurface(unified_geometry)) as center_lat,
    ST_X(ST_PointOnSurface(unified_geometry)) as center_lon
    
  FROM all_water_groups
  WHERE unified_geometry IS NOT NULL
)

-- INFOGA ALLA VATTEN (både sjöar och åar)
INSERT INTO water_bodies_unified (
  name, display_name, search_terms, geometry, lat, lon,
  total_area_km2, depth_max, original_segment_count, original_segment_ids,
  unification_method, water_type, data_source, processing_notes, is_split_section
)
SELECT 
  name,
  name as display_name,
  name as search_terms,
  unified_geometry,
  center_lat,
  center_lon,
  total_area,
  max_depth,
  segment_count,
  segment_ids,
  
  CASE 
    WHEN segment_count = 1 THEN 'single'
    ELSE 'st_collect_merge'
  END as unification_method,
  
  detected_water_type as water_type,
  combined_sources,
  
  CASE 
    WHEN segment_count = 1 THEN 'Single segment'
    ELSE CONCAT('Merged ', segment_count, ' segments using ST_Collect')
  END as processing_notes,
  
  false as is_split_section

FROM final_waters;

-- Ge statistik
SELECT 
  'FIXED UNIFIED SYSTEM' as status,
  COUNT(*) as total_unified,
  COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
  COUNT(*) FILTER (WHERE water_type = 'river') as rivers,
  COUNT(*) FILTER (WHERE original_segment_count > 1) as multi_segment,
  AVG(original_segment_count) as avg_segments_per_water
FROM water_bodies_unified;