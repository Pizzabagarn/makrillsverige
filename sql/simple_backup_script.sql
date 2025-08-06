-- ENKEL SÄKERHETSKOPIA (Kör i Supabase SQL Editor)
-- Backup innan vattendrag-sammanslagning

-- 1. Backup av huvudtabell
DROP TABLE IF EXISTS water_bodies_with_places_backup CASCADE;
CREATE TABLE water_bodies_with_places_backup AS 
SELECT * FROM water_bodies_with_places;

-- 2. Backup av materialized view  
DROP MATERIALIZED VIEW IF EXISTS water_bodies_with_places_fast_lookup_backup CASCADE;
CREATE MATERIALIZED VIEW water_bodies_with_places_fast_lookup_backup AS
SELECT * FROM water_bodies_with_places_fast_lookup;

-- 3. Verifiering
SELECT 
    'BACKUP CHECK' as status,
    (SELECT COUNT(*) FROM water_bodies_with_places) as original_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_backup) as backup_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup) as original_mv_count,
    (SELECT COUNT(*) FROM water_bodies_with_places_fast_lookup_backup) as backup_mv_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM water_bodies_with_places) = (SELECT COUNT(*) FROM water_bodies_with_places_backup)
        THEN '✅ BACKUP SUCCESS'
        ELSE '❌ BACKUP FAILED'
    END as result;