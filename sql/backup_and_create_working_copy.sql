-- ===================================================================
-- SÄKER BACKUP OCH ARBETSKOPIA - Disambiguation Project
-- ===================================================================
-- Detta script skapar en säker backup och en arbetskopia för 
-- administrativa disambiguation utan att röra originaldata

-- 1. SÄKER BACKUP av fungerande production-tabell
-- ===================================================================
DROP TABLE IF EXISTS water_bodies_integrated_production_backup;
CREATE TABLE water_bodies_integrated_production_backup AS 
SELECT * FROM water_bodies_integrated;

-- Lägg till index på backup för säkerhet
CREATE INDEX idx_backup_geometry ON water_bodies_integrated_production_backup USING GIST (geometry);
CREATE INDEX idx_backup_name ON water_bodies_integrated_production_backup (name);
CREATE INDEX idx_backup_coords ON water_bodies_integrated_production_backup (lat, lon);

-- 2. ARBETSKOPIA för disambiguation-experiment  
-- ===================================================================
DROP TABLE IF EXISTS water_bodies_with_places;
CREATE TABLE water_bodies_with_places AS 
SELECT 
    id,
    name,
    water_type,
    geometry,
    lat,
    lon,
    area_km2,
    data_source,
    source_priority,
    original_id,
    
    -- SMHI-specific fields
    depth_mean,
    depth_max,
    volume_m3,
    ecological_status,
    segment_count,
    unification_method,
    cluster_size,
    cluster_method,
    
    -- OSM-specific fields
    osm_id,
    osm_type,
    region,
    fishing_regulations,
    water_quality_status,
    water_district,
    main_catchment,
    sub_catchment,
    
    -- Common fields
    tags,
    metadata_source,
    created_at,
    updated_at,
    
    -- NYA KOLUMNER för disambiguation
    NULL::TEXT as municipality,              -- "Malmö", "Oslo", "København" (rent namn)
    NULL::TEXT as municipality_type,         -- "tätort", "småort", "kommune", "kommun" (typ av plats)
    NULL::TEXT as county,                   -- "Skåne län" / "Rogaland fylke" / "Region Syddanmark"  
    NULL::TEXT as country,                  -- 'SE', 'NO', 'DK' (från administrativa gränser)
    NULL::TEXT as display_name,             -- "Vombsjön (Malmö)" (rent visningsnamn)
    0 as name_conflicts,                    -- Antal andra med samma namn
    NULL::TEXT as disambiguation_method,     -- 'none', 'municipality', 'county', 'municipality_county'
    NULL::TEXT as administrative_source      -- 'scb', 'kartverket', 'dataforsyningen' (källa för platsdata)
    
FROM water_bodies_integrated;

-- Lägg till DEFAULT-constraints efter tabellen är skapad
ALTER TABLE water_bodies_with_places 
    ALTER COLUMN name_conflicts SET DEFAULT 0;

-- Index för snabb prestanda på arbetskopian
CREATE INDEX idx_places_geometry ON water_bodies_with_places USING GIST (geometry);
CREATE INDEX idx_places_name ON water_bodies_with_places (name);
CREATE INDEX idx_places_coords ON water_bodies_with_places (lat, lon);
CREATE INDEX idx_places_country ON water_bodies_with_places (country);
CREATE INDEX idx_places_display_name ON water_bodies_with_places (display_name);

-- 3. ADMINISTRATIVA GRÄNSER - REDAN IMPORTERADE
-- ===================================================================
-- De administrativa gränserna är redan importerade via import_administrative_boundaries.py
-- Tabellerna som redan finns:
-- - administrative_boundaries_sweden (5,114 tätorter + småorter)
-- - administrative_boundaries_norway (372 kommuner + fylker)  
-- - administrative_boundaries_denmark (104 kommuner + regioner)
-- 
-- Inget behöver skapas här - vi använder befintliga tabeller.

-- 4. VERIFICATION
-- ===================================================================
SELECT 
    'Original table' as table_name,
    COUNT(*) as record_count,
    COUNT(DISTINCT name) as unique_names,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM water_bodies_integrated

UNION ALL

SELECT 
    'Backup table' as table_name,
    COUNT(*) as record_count, 
    COUNT(DISTINCT name) as unique_names,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM water_bodies_integrated_production_backup

UNION ALL

SELECT 
    'Working copy' as table_name,
    COUNT(*) as record_count,
    COUNT(DISTINCT name) as unique_names, 
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM water_bodies_with_places;

-- Visa potentiella namn-konflikter
SELECT 
    name,
    COUNT(*) as occurrences,
    STRING_AGG(DISTINCT water_type, ', ') as water_types,
    STRING_AGG(DISTINCT data_source, ', ') as sources
FROM water_bodies_with_places 
WHERE name IS NOT NULL 
GROUP BY name 
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 20;