-- LÄGG TILL VISS-CACHE i water_bodies_merged_fast_lookup
-- Så slipper vi hämta VISS live varje gång = SNABBT!

-- Lägg till VISS-cache kolumner
ALTER TABLE water_bodies_merged_fast_lookup 
ADD COLUMN IF NOT EXISTS cached_viss_data JSONB,
ADD COLUMN IF NOT EXISTS viss_last_updated TIMESTAMP,
ADD COLUMN IF NOT EXISTS ecological_status TEXT,
ADD COLUMN IF NOT EXISTS water_quality_status TEXT,
ADD COLUMN IF NOT EXISTS fishing_regulations TEXT,
ADD COLUMN IF NOT EXISTS depth_mean NUMERIC,
ADD COLUMN IF NOT EXISTS depth_max NUMERIC,
ADD COLUMN IF NOT EXISTS volume_m3 NUMERIC;

-- Skapa index för snabb VISS-cache lookup
CREATE INDEX IF NOT EXISTS idx_merged_viss_cache 
ON water_bodies_merged_fast_lookup (cached_viss_data) 
WHERE cached_viss_data IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merged_viss_updated 
ON water_bodies_merged_fast_lookup (viss_last_updated) 
WHERE viss_last_updated IS NOT NULL;

-- Uppdatera statistik
ANALYZE water_bodies_merged_fast_lookup;

SELECT 'VISS-CACHE KOLUMNER TILLAGDA!' as status;