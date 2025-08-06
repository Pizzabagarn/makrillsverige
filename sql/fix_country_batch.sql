-- FIXA COUNTRY-KODER i små batchar för att undvika timeout

-- BATCH 1: Bara svenska vattendrag först (10000 åt gången)
UPDATE water_bodies_merged_fixed 
SET country = (
    SELECT DISTINCT orig.country 
    FROM water_bodies_with_places_fast_lookup orig
    WHERE orig.id = ANY(water_bodies_merged_fixed.original_segment_ids)
      AND orig.country = 'SE'
    LIMIT 1
)
WHERE water_type IN ('river', 'stream')
  AND original_segment_ids IS NOT NULL
  AND (country != 'SE' OR country IS NULL)
  AND id <= 50000;

SELECT 'BATCH 1 KLAR - SVENSKA VATTENDRAG (ID <= 50000)' as status;