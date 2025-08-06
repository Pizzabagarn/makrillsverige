-- BATCH 2: ID 30001-60000
UPDATE water_bodies_merged_fixed 
SET country = (
    SELECT orig.country 
    FROM water_bodies_with_places_fast_lookup orig
    WHERE orig.id = water_bodies_merged_fixed.original_segment_ids[1]
    LIMIT 1
)
WHERE id BETWEEN 30001 AND 60000
  AND original_segment_ids IS NOT NULL
  AND array_length(original_segment_ids, 1) > 0;

SELECT 'BATCH 2 KLAR (ID 30001-60000)' as status;