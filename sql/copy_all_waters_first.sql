-- STEG 1: Kopiera ALLA vatten från water_bodies_integrated (1:1 kopia)
-- Inga filter, ingen klassificering, inga komplexa operationer!

-- Rensa först
TRUNCATE TABLE water_bodies_unified;

-- Kopiera ALLA 142,739 vatten exakt som de är
INSERT INTO water_bodies_unified (
  name, display_name, search_terms, geometry, lat, lon,
  total_area_km2, depth_max, original_segment_count, original_segment_ids,
  unification_method, water_type, data_source, processing_notes, is_split_section
)
SELECT 
  name,                          -- Exakt samma namn
  name as display_name,          -- Samma som display_name för nu
  name as search_terms,          -- Samma som search_terms för nu
  geometry,                      -- Exakt samma geometri
  lat, 
  lon,
  area_km2,                      -- Kolumnnamn från original tabellen
  depth_max,
  1 as original_segment_count,   -- Alla startar som single segment
  ARRAY[id] as original_segment_ids,  -- Original ID
  'single' as unification_method,     -- Alla börjar som single
  water_type,                    -- ANVÄND BEFINTLIG KLASSIFICERING!
  data_source,
  'Direct 1:1 copy from water_bodies_integrated' as processing_notes,
  false as is_split_section
FROM water_bodies_integrated
WHERE ST_IsValid(geometry) = true   -- Bara filtera bort korrupt geometri
  AND name IS NOT NULL 
  AND name != '';

-- Visa resultat
SELECT 
  'ALLA VATTEN KOPIERADE' as status,
  COUNT(*) as total_copied,
  COUNT(*) FILTER (WHERE water_type = 'lake') as lakes,
  COUNT(*) FILTER (WHERE water_type = 'river') as rivers,
  COUNT(*) FILTER (WHERE water_type = 'stream') as streams,
  COUNT(*) FILTER (WHERE water_type IS NULL OR water_type = '') as unknown_type
FROM water_bodies_unified;

-- Kontrollera att vi har ungefär 142,739 rader
SELECT 'ORIGINAL TABELLEN HAR' as check, COUNT(*) as total_rows 
FROM water_bodies_integrated 
WHERE ST_IsValid(geometry) = true AND name IS NOT NULL AND name != '';