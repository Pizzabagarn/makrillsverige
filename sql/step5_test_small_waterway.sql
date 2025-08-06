-- STEG 5: Testa med ett litet vattendrag först
-- Kör efter steg 4

-- Test med Höje å i Lund (om den finns)
DO $$
DECLARE
    group_record RECORD;
    new_id BIGINT;
BEGIN
    -- Testa gruppering för Höje å
    FOR group_record IN 
        SELECT * FROM group_waterway_segments_no_gaps('Höje å', 'river', 'Lund')
        LIMIT 1  -- Bara första gruppen
    LOOP
        -- Skapa sammanslagen post
        INSERT INTO water_bodies_with_places_merged (
            name, water_type, municipality, geometry,
            lat, lon, area_km2, data_source, source_priority,
            display_name, original_segment_ids, merge_group_id, 
            has_natural_gaps, merge_method, segments_merged
        )
        SELECT 
            'Höje å (Lund)',
            'river',
            'Lund',
            group_record.merged_geometry,
            ST_Y(ST_Centroid(group_record.merged_geometry)),
            ST_X(ST_Centroid(group_record.merged_geometry)),
            (SELECT SUM(COALESCE(area_km2, 0)) 
             FROM water_bodies_with_places_fast_lookup 
             WHERE id = ANY(group_record.segment_ids)),
            data_source,
            source_priority,
            'Höje å (Lund)',
            group_record.segment_ids,
            group_record.group_id,
            group_record.has_gaps,
            'proximity_5km_no_gaps',
            group_record.total_segments
        FROM water_bodies_with_places_fast_lookup
        WHERE id = group_record.segment_ids[1]
        LIMIT 1;
        
        RAISE NOTICE 'Skapade Höje å med % segment', group_record.total_segments;
    END LOOP;
END $$;

-- Visa resultat
SELECT 
    'STEG 5 TEST RESULTAT' as info,
    name,
    segments_merged,
    has_natural_gaps
FROM water_bodies_with_places_merged 
WHERE name LIKE '%Höje å%';

SELECT 'STEG 5 KLAR ✅ - Test genomfört' as status;