-- STEGVIS FIX för unified waterways (undviker timeout)
-- Fixar Vänern och OSM-sjöar utan att processa allt på en gång

-- STEG 1: Rensa unified tabellen
TRUNCATE TABLE water_bodies_unified;

-- STEG 2: Lägg till ALLA enskilda vatten först (snabbt)
INSERT INTO water_bodies_unified (
  name, display_name, search_terms, geometry, lat, lon,
  total_area_km2, depth_max, original_segment_count, original_segment_ids,
  unification_method, water_type, data_source, processing_notes, is_split_section
)
SELECT 
  name,
  name as display_name,
  name as search_terms,
  geometry,
  lat, lon,
  area_km2,
  depth_max,
  1,
  ARRAY[id],
  'single',
  CASE 
    -- FÖRBÄTTRAD klassificering för OSM-sjöar
    WHEN name ILIKE '%sjö%' OR name ILIKE '%tjärn%' OR name ILIKE '%vatten%' 
         OR name ILIKE '%träsk%' OR name ILIKE '%göl%' OR name ILIKE '%viken%'
         OR name ILIKE '%fjärd%' 
         -- NORSKA
         OR name ILIKE '%vatn' OR name ILIKE '%tjern' OR name ILIKE '%tjørn'
         -- DANSKA  
         OR name ILIKE '%sø'
         -- FINSKA
         OR name ILIKE '%järvi' OR name ILIKE '%lampi' OR name ILIKE '%lompolo'
         -- OSM water_type
         OR water_type = 'lake' 
    THEN 'lake'
    WHEN name ILIKE '%å' OR name ILIKE '%älv%' OR name ILIKE '%bäck%' 
         OR name ILIKE '%ström%' OR water_type IN ('river', 'stream') 
    THEN 'river'
    ELSE 'unknown'
  END,
  data_source,
  'Single segment - direct copy',
  false
FROM water_bodies_integrated
WHERE ST_IsValid(geometry) = true 
  AND name IS NOT NULL 
  AND name != ''
  -- Bara ta vatten som bara har 1 segment (för att undvika dubletter)
  AND name NOT IN (
    SELECT name 
    FROM water_bodies_integrated 
    WHERE ST_IsValid(geometry) = true AND name IS NOT NULL AND name != ''
    GROUP BY name 
    HAVING COUNT(*) > 1
  );

-- Visa progress
SELECT 'STEG 2 KLART' as status, COUNT(*) as single_segment_waters 
FROM water_bodies_unified;