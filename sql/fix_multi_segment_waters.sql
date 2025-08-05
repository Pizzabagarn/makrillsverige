-- STEG 3: Hantera multi-segment vatten (som Vänern) i små batches
-- Kör detta EFTER fix_unified_step_by_step.sql

-- Hitta alla vatten med flera segment (begränsa till 50 åt gången för att undvika timeout)
WITH multi_segment_names AS (
  SELECT name, COUNT(*) as segment_count
  FROM water_bodies_integrated 
  WHERE ST_IsValid(geometry) = true AND name IS NOT NULL AND name != ''
  GROUP BY name 
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC  -- Börja med de mest fragmenterade (som Vänern)
  LIMIT 50  -- Processa bara 50 åt gången
),

-- Samla alla segment för dessa vatten
multi_segment_data AS (
  SELECT 
    w.name,
    COUNT(*) as total_segments,
    ARRAY_AGG(w.id ORDER BY w.area_km2 DESC NULLS LAST) as segment_ids,
    
    -- ST_Collect för att slå ihop alla segment
    ST_Collect(w.geometry ORDER BY w.area_km2 DESC NULLS LAST) as unified_geometry,
    
    SUM(COALESCE(w.area_km2, 0)) as total_area,
    MAX(COALESCE(w.depth_max, 0)) as max_depth,
    STRING_AGG(DISTINCT w.data_source, ', ') as combined_sources,
    
    -- Klassificera vattentyp
    CASE 
      WHEN w.name ILIKE '%sjö%' OR w.name ILIKE '%tjärn%' OR w.name ILIKE '%vatten%' 
           OR w.name ILIKE '%träsk%' OR w.name ILIKE '%göl%' OR w.name ILIKE '%viken%'
           OR w.name ILIKE '%fjärd%' 
           OR w.name ILIKE '%vatn' OR w.name ILIKE '%tjern' OR w.name ILIKE '%tjørn'
           OR w.name ILIKE '%sø'
           OR w.name ILIKE '%järvi' OR w.name ILIKE '%lampi' OR w.name ILIKE '%lompolo'
           OR MAX(w.water_type) = 'lake' 
      THEN 'lake'
      WHEN w.name ILIKE '%å' OR w.name ILIKE '%älv%' OR w.name ILIKE '%bäck%' 
           OR w.name ILIKE '%ström%' OR MAX(w.water_type) IN ('river', 'stream') 
      THEN 'river'
      ELSE 'unknown'
    END as detected_water_type
    
  FROM water_bodies_integrated w
  INNER JOIN multi_segment_names msn ON w.name = msn.name
  WHERE ST_IsValid(w.geometry) = true
  GROUP BY w.name
)

-- Infoga de sammansatta vattendragen
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
  ST_Y(ST_PointOnSurface(unified_geometry)) as center_lat,
  ST_X(ST_PointOnSurface(unified_geometry)) as center_lon,
  total_area,
  max_depth,
  total_segments,
  segment_ids,
  'st_collect_merge',
  detected_water_type,
  combined_sources,
  CONCAT('Merged ', total_segments, ' segments using ST_Collect - BATCH 1'),
  false
FROM multi_segment_data
WHERE unified_geometry IS NOT NULL;

-- Visa resultat
SELECT 
  'BATCH 1 PROCESSED' as status,
  COUNT(*) as waters_processed,
  MAX(original_segment_count) as max_segments_in_batch,
  string_agg(name, ', ') as processed_waters
FROM water_bodies_unified 
WHERE processing_notes LIKE '%BATCH 1%';

-- Visa totala antalet kvar att processa
SELECT 
  'REMAINING TO PROCESS' as status,
  COUNT(*) as remaining_multi_segment_waters
FROM (
  SELECT name
  FROM water_bodies_integrated 
  WHERE ST_IsValid(geometry) = true AND name IS NOT NULL AND name != ''
  GROUP BY name 
  HAVING COUNT(*) > 1
) remaining
WHERE name NOT IN (
  SELECT name FROM water_bodies_unified WHERE processing_notes LIKE '%BATCH%'
);