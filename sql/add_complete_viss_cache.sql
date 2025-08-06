-- LÄGG TILL KOMPLETT VISS-CACHE baserat på gamla systemet
-- Alla kolumner som fanns i water_bodies_with_places_fast_lookup

ALTER TABLE water_bodies_merged_fast_lookup 
-- Grundläggande VISS-fält (fanns redan i gamla systemet)
ADD COLUMN IF NOT EXISTS ecological_status TEXT,
ADD COLUMN IF NOT EXISTS water_quality_status TEXT,
ADD COLUMN IF NOT EXISTS fishing_regulations TEXT,
ADD COLUMN IF NOT EXISTS depth_mean NUMERIC,
ADD COLUMN IF NOT EXISTS depth_max NUMERIC,
ADD COLUMN IF NOT EXISTS volume_m3 NUMERIC,

-- Utökad VISS-data (JSON för komplex data)
ADD COLUMN IF NOT EXISTS cached_viss_data JSONB,
ADD COLUMN IF NOT EXISTS viss_last_updated TIMESTAMP;

-- Skapa index
CREATE INDEX IF NOT EXISTS idx_merged_ecological_status 
ON water_bodies_merged_fast_lookup (ecological_status) 
WHERE ecological_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merged_water_quality 
ON water_bodies_merged_fast_lookup (water_quality_status) 
WHERE water_quality_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merged_viss_cache 
ON water_bodies_merged_fast_lookup USING gin (cached_viss_data) 
WHERE cached_viss_data IS NOT NULL;

-- Uppdatera statistik
ANALYZE water_bodies_merged_fast_lookup;

SELECT 'KOMPLETT VISS-CACHE TILLAGD!' as status;