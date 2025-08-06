-- KOPIERA ALL VISS-DATA från gamla tabellen
-- Både grundläggande fält OCH komplex JSON-data

-- Kopiera grundläggande VISS-fält
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
WHERE old.id = ANY(m.original_segment_ids)
    AND (old.ecological_status IS NOT NULL 
         OR old.water_quality_status IS NOT NULL
         OR old.fishing_regulations IS NOT NULL
         OR old.depth_mean IS NOT NULL);

-- Kontrollera resultat
SELECT 
    'VISS-DATA KOPIERAT!' as status,
    COUNT(*) as total_rows,
    COUNT(ecological_status) as has_ecological,
    COUNT(water_quality_status) as has_water_quality,
    COUNT(fishing_regulations) as has_fishing,
    COUNT(depth_mean) as has_depth,
    COUNT(volume_m3) as has_volume
FROM water_bodies_merged_fast_lookup;

-- Visa exempel på kopierad data
SELECT 
    'EXEMPEL VISS-DATA' as info,
    name,
    ecological_status,
    water_quality_status,
    fishing_regulations,
    depth_mean,
    depth_max,
    municipality
FROM water_bodies_merged_fast_lookup 
WHERE ecological_status IS NOT NULL
LIMIT 5;