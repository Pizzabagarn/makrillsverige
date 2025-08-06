-- SÄKERHETSKOPIA av water_bodies_with_places och relaterade funktioner
-- Kör INNAN vi ändrar något med vattendrag-sammanslagning

-- 1. Skapa backup-tabell med EXAKT samma struktur och data
DROP TABLE IF EXISTS water_bodies_with_places_backup CASCADE;

CREATE TABLE water_bodies_with_places_backup AS 
SELECT * FROM water_bodies_with_places;

-- 2. Skapa index på backup (för prestanda om vi behöver återställa)
CREATE INDEX idx_backup_places_id ON water_bodies_with_places_backup (id);
CREATE INDEX idx_backup_places_name ON water_bodies_with_places_backup (name);
CREATE INDEX idx_backup_places_water_type ON water_bodies_with_places_backup (water_type);

-- 3. Backup av materialized view
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup_backup CASCADE;

CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup_backup AS
SELECT * FROM water_bodies_with_places_fast_lookup;

-- 4. Backup av PostGIS-funktioner (som text)
CREATE TABLE IF NOT EXISTS function_backups (
    function_name TEXT PRIMARY KEY,
    function_definition TEXT,
    backup_date TIMESTAMP DEFAULT NOW()
);

-- Spara aktuella funktioner
INSERT INTO function_backups (function_name, function_definition) VALUES 
('find_water_body_with_places_containing_point', 
'-- BACKUP av PostGIS-funktion från ' || NOW() || '
-- Denna funktion kan återställas om något går fel

CREATE OR REPLACE FUNCTION find_water_body_with_places_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS TABLE(
  id BIGINT,
  name TEXT,
  water_type TEXT,
  geometry GEOMETRY,
  lat NUMERIC,
  lon NUMERIC,
  area_km2 NUMERIC,
  data_source TEXT,
  source_priority INTEGER,
  original_id TEXT,
  depth_mean NUMERIC,
  depth_max NUMERIC,
  volume_m3 NUMERIC,
  ecological_status TEXT,
  segment_count INTEGER,
  unification_method TEXT,
  cluster_size INTEGER,
  cluster_method TEXT,
  osm_id BIGINT,
  osm_type TEXT,
  fishing_regulations TEXT,
  water_quality_status TEXT,
  region TEXT,
  water_district TEXT,
  tags JSONB,
  metadata_source TEXT,
  municipality TEXT,
  municipality_type TEXT,
  county TEXT,
  country TEXT,
  display_name TEXT,
  name_conflicts INTEGER,
  disambiguation_method TEXT,
  administrative_source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id, w.name, w.water_type, w.geometry, w.lat, w.lon, w.area_km2,
    w.data_source, w.source_priority, w.original_id, w.depth_mean, w.depth_max,
    w.volume_m3, w.ecological_status, w.segment_count, w.unification_method,
    w.cluster_size, w.cluster_method, w.osm_id, w.osm_type, w.fishing_regulations,
    w.water_quality_status, w.region, w.water_district, w.tags, w.metadata_source,
    w.municipality, w.municipality_type, w.county, w.country, w.display_name,
    w.name_conflicts, w.disambiguation_method, w.administrative_source
  FROM water_bodies_with_places_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    CASE 
      WHEN w.data_source = ''SMHI'' AND w.water_type = ''lake'' THEN 1
      WHEN w.water_type = ''lake'' THEN 2
      WHEN w.water_type = ''river'' THEN 3
      WHEN w.water_type = ''stream'' THEN 4
      ELSE 5
    END,
    w.source_priority ASC,
    ST_Area(ST_Transform(w.geometry, 3857)) DESC,
    ST_Distance(
      ST_Transform(ST_Centroid(w.geometry), 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) ASC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;')

ON CONFLICT (function_name) DO UPDATE SET 
    function_definition = EXCLUDED.function_definition,
    backup_date = NOW();

-- 5. Verifiering av backup
SELECT 
    'BACKUP VERIFICATION' as check_type,
    (SELECT COUNT(*) FROM water_bodies_with_places) as original_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_backup) as backup_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) as materialized_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup_backup) as backup_materialized_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM water_bodies_with_places) = (SELECT COUNT(*) FROM water_bodies_with_places_backup)
        THEN 'BACKUP OK ✅'
        ELSE 'BACKUP FAILED ❌'
    END as backup_status;

-- 6. Instruktioner för återställning
COMMENT ON TABLE water_bodies_with_places_backup IS 
'SÄKERHETSKOPIA av water_bodies_with_places. 
 
 ÅTERSTÄLLNING:
 1. DROP TABLE water_bodies_with_places CASCADE;
 2. CREATE TABLE water_bodies_with_places AS SELECT * FROM water_bodies_with_places_backup;
 3. Återskapa index och funktioner från function_backups tabell
 4. REFRESH MATERIALIZED VIEW water_bodies_with_places_fast_lookup;';

SELECT 'BACKUP KLAR! Säkert att börja med vattendrag-sammanslagning.' as status;
-- Kör INNAN vi ändrar något med vattendrag-sammanslagning

-- 1. Skapa backup-tabell med EXAKT samma struktur och data
DROP TABLE IF EXISTS water_bodies_with_places_backup CASCADE;

CREATE TABLE water_bodies_with_places_backup AS 
SELECT * FROM water_bodies_with_places;

-- 2. Skapa index på backup (för prestanda om vi behöver återställa)
CREATE INDEX idx_backup_places_id ON water_bodies_with_places_backup (id);
CREATE INDEX idx_backup_places_name ON water_bodies_with_places_backup (name);
CREATE INDEX idx_backup_places_water_type ON water_bodies_with_places_backup (water_type);

-- 3. Backup av materialized view
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup_backup CASCADE;

CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup_backup AS
SELECT * FROM water_bodies_with_places_fast_lookup;

-- 4. Backup av PostGIS-funktioner (som text)
CREATE TABLE IF NOT EXISTS function_backups (
    function_name TEXT PRIMARY KEY,
    function_definition TEXT,
    backup_date TIMESTAMP DEFAULT NOW()
);

-- Spara aktuella funktioner
INSERT INTO function_backups (function_name, function_definition) VALUES 
('find_water_body_with_places_containing_point', 
'-- BACKUP av PostGIS-funktion från ' || NOW() || '
-- Denna funktion kan återställas om något går fel

CREATE OR REPLACE FUNCTION find_water_body_with_places_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS TABLE(
  id BIGINT,
  name TEXT,
  water_type TEXT,
  geometry GEOMETRY,
  lat NUMERIC,
  lon NUMERIC,
  area_km2 NUMERIC,
  data_source TEXT,
  source_priority INTEGER,
  original_id TEXT,
  depth_mean NUMERIC,
  depth_max NUMERIC,
  volume_m3 NUMERIC,
  ecological_status TEXT,
  segment_count INTEGER,
  unification_method TEXT,
  cluster_size INTEGER,
  cluster_method TEXT,
  osm_id BIGINT,
  osm_type TEXT,
  fishing_regulations TEXT,
  water_quality_status TEXT,
  region TEXT,
  water_district TEXT,
  tags JSONB,
  metadata_source TEXT,
  municipality TEXT,
  municipality_type TEXT,
  county TEXT,
  country TEXT,
  display_name TEXT,
  name_conflicts INTEGER,
  disambiguation_method TEXT,
  administrative_source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id, w.name, w.water_type, w.geometry, w.lat, w.lon, w.area_km2,
    w.data_source, w.source_priority, w.original_id, w.depth_mean, w.depth_max,
    w.volume_m3, w.ecological_status, w.segment_count, w.unification_method,
    w.cluster_size, w.cluster_method, w.osm_id, w.osm_type, w.fishing_regulations,
    w.water_quality_status, w.region, w.water_district, w.tags, w.metadata_source,
    w.municipality, w.municipality_type, w.county, w.country, w.display_name,
    w.name_conflicts, w.disambiguation_method, w.administrative_source
  FROM water_bodies_with_places_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    CASE 
      WHEN w.data_source = ''SMHI'' AND w.water_type = ''lake'' THEN 1
      WHEN w.water_type = ''lake'' THEN 2
      WHEN w.water_type = ''river'' THEN 3
      WHEN w.water_type = ''stream'' THEN 4
      ELSE 5
    END,
    w.source_priority ASC,
    ST_Area(ST_Transform(w.geometry, 3857)) DESC,
    ST_Distance(
      ST_Transform(ST_Centroid(w.geometry), 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) ASC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;')

ON CONFLICT (function_name) DO UPDATE SET 
    function_definition = EXCLUDED.function_definition,
    backup_date = NOW();

-- 5. Verifiering av backup
SELECT 
    'BACKUP VERIFICATION' as check_type,
    (SELECT COUNT(*) FROM water_bodies_with_places) as original_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_backup) as backup_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) as materialized_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup_backup) as backup_materialized_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM water_bodies_with_places) = (SELECT COUNT(*) FROM water_bodies_with_places_backup)
        THEN 'BACKUP OK ✅'
        ELSE 'BACKUP FAILED ❌'
    END as backup_status;

-- 6. Instruktioner för återställning
COMMENT ON TABLE water_bodies_with_places_backup IS 
'SÄKERHETSKOPIA av water_bodies_with_places. 
 
 ÅTERSTÄLLNING:
 1. DROP TABLE water_bodies_with_places CASCADE;
 2. CREATE TABLE water_bodies_with_places AS SELECT * FROM water_bodies_with_places_backup;
 3. Återskapa index och funktioner från function_backups tabell
 4. REFRESH MATERIALIZED VIEW water_bodies_with_places_fast_lookup;';

SELECT 'BACKUP KLAR! Säkert att börja med vattendrag-sammanslagning.' as status;