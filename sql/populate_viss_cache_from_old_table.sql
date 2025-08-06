-- KOPIERA VISS-CACHE från gamla tabellen till nya
-- Så slipper vi hämta VISS på nytt för alla sjöar

-- Kopiera VISS-data från water_bodies_with_places_fast_lookup till water_bodies_merged_fast_lookup
UPDATE water_bodies_merged_fast_lookup m
SET 
    ecological_status = old.ecological_status,
    water_quality_status = old.water_quality_status,
    fishing_regulations = old.fishing_regulations,
    depth_mean = old.depth_mean,
    depth_max = old.depth_max,
    volume_m3 = old.volume_m3,
    viss_last_updated = NOW()
FROM water_bodies_with_places_fast_lookup old
WHERE old.id = ANY(m.original_segment_ids)  -- Matcha mot original IDs
    AND (old.ecological_status IS NOT NULL 
         OR old.water_quality_status IS NOT NULL
         OR old.fishing_regulations IS NOT NULL);

-- Kontrollera hur många som fick VISS-data
SELECT 
    'VISS-CACHE KOPIERAT!' as status,
    COUNT(*) as total_rows,
    COUNT(ecological_status) as has_ecological_status,
    COUNT(water_quality_status) as has_water_quality,
    COUNT(fishing_regulations) as has_fishing_regs
FROM water_bodies_merged_fast_lookup;