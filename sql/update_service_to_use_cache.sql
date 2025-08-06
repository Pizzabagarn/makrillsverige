-- UPPDATERA SERVICE för att använda cachad VISS-data
-- Istället för att hämta live från VISS-API varje gång

-- Detta är SQL som visar hur frontend ska ändras:
-- Istället för att anropa VISS-API, använd cachad data direkt från tabellen

-- EXEMPEL på vad som ska returneras från find_merged_water_body_containing_point:
SELECT 
    'EXEMPEL: Cachad VISS-data från tabell' as info,
    name,
    water_type,
    -- CACHAD VISS-DATA (snabbt!)
    ecological_status,
    water_quality_status, 
    fishing_regulations,
    depth_mean,
    depth_max,
    volume_m3,
    viss_last_updated,
    -- Grunddata
    geometry,
    lat,
    lon,
    municipality,
    country
FROM water_bodies_merged_fast_lookup 
WHERE name IS NOT NULL
    AND (ecological_status IS NOT NULL OR water_quality_status IS NOT NULL)
LIMIT 3;

-- KOMMENTAR:
-- Frontend ska nu använda denna cachade data istället för att anropa:
-- - WaterBodyDataFetcher.fetchWaterBodyDataWithValidation()
-- - VISS API calls
-- 
-- Resultat: OMEDELBAR VISS-data istället för 2-5 sekunder väntetid!