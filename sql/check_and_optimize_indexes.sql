-- KONTROLLERA OCH OPTIMERA INDEX för water_bodies_merged_fast_lookup
-- För att säkerställa bästa prestanda för klickfunktionen

-- 1. Kontrollera befintliga index
SELECT 
    'BEFINTLIGA INDEX' as check_type,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'water_bodies_merged_fast_lookup'
ORDER BY indexname;

-- 2. Kontrollera tabellstorlek
SELECT 
    'TABELLSTORLEK' as check_type,
    pg_size_pretty(pg_total_relation_size('water_bodies_merged_fast_lookup')) as table_size,
    COUNT(*) as row_count
FROM water_bodies_merged_fast_lookup;

-- 3. Skapa kritiska index om de saknas

-- VIKTIGT: Spatial index för geometri (för ST_Contains optimering)
CREATE INDEX IF NOT EXISTS idx_merged_fast_geometry_gist 
ON water_bodies_merged_fast_lookup USING gist (geometry);

-- VIKTIGT: Lat/Lon index för spatial förfiltrering
CREATE INDEX IF NOT EXISTS idx_merged_fast_lat_lon_btree 
ON water_bodies_merged_fast_lookup (lat, lon);

-- VIKTIGT: Kombinerat index för namn och area (för sortering)
CREATE INDEX IF NOT EXISTS idx_merged_fast_name_area 
ON water_bodies_merged_fast_lookup (name, area_km2 DESC NULLS LAST) 
WHERE name IS NOT NULL;

-- VIKTIGT: Water type index (för prioritering)
CREATE INDEX IF NOT EXISTS idx_merged_fast_water_type 
ON water_bodies_merged_fast_lookup (water_type, area_km2 DESC NULLS LAST);

-- 4. Uppdatera statistik för query planner
ANALYZE water_bodies_merged_fast_lookup;

-- 5. Kontrollera att alla index skapades
SELECT 
    'NYA INDEX SKAPADE' as check_type,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'water_bodies_merged_fast_lookup'
ORDER BY indexname;

-- 6. Test query performance med EXPLAIN
EXPLAIN (ANALYZE, BUFFERS) 
SELECT *
FROM water_bodies_merged_fast_lookup w
WHERE w.geometry IS NOT NULL
  AND w.name IS NOT NULL
  AND w.lat BETWEEN 57.7 - 0.02 AND 57.7 + 0.02
  AND w.lon BETWEEN 11.9 - 0.02 AND 11.9 + 0.02
  AND ST_Contains(w.geometry, ST_Point(11.9, 57.7, 4326))
ORDER BY
  CASE 
    WHEN w.water_type = 'lake' THEN 1
    WHEN w.water_type = 'river' THEN 2
    WHEN w.water_type = 'stream' THEN 3
    ELSE 4
  END,
  w.area_km2 DESC NULLS LAST
LIMIT 5;