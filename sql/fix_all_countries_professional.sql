-- PROFESSIONELL FIX: ALLA LÄNDERS COUNTRY-KODER

-- BATCH 1: ID 1-30000
UPDATE water_bodies_merged_fixed 
SET country = (
    SELECT orig.country 
    FROM water_bodies_with_places_fast_lookup orig
    WHERE orig.id = water_bodies_merged_fixed.original_segment_ids[1]
    LIMIT 1
)
WHERE id BETWEEN 1 AND 30000
  AND original_segment_ids IS NOT NULL
  AND array_length(original_segment_ids, 1) > 0;

SELECT 'BATCH 1 KLAR (ID 1-30000)' as status;