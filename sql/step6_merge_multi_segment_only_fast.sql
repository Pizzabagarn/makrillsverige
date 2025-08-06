-- STEG 6: SNABB version - bara vattendrag med FLERA segment
-- Skippar enstaka segment = mycket snabbare!

CREATE OR REPLACE FUNCTION merge_multi_segment_waterways_fast()
RETURNS TEXT AS $$
DECLARE
    waterway_record RECORD;
    group_record RECORD;
    processed_count INTEGER := 0;
    skipped_singles INTEGER := 0;
    total_multi_segment INTEGER;
BEGIN
    -- Räkna bara vattendrag med FLERA segment
    SELECT COUNT(*) INTO total_multi_segment
    FROM (
        SELECT name, water_type, municipality, COUNT(*) as seg_count
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL 
          AND municipality IS NOT NULL
        GROUP BY name, water_type, municipality
        HAVING COUNT(*) > 1  -- BARA flera segment
    ) multi_seg;
    
    RAISE NOTICE 'Startar SNABB sammanslagning av % vattendrag med flera segment...', total_multi_segment;
    
    -- Bara vattendrag med FLERA segment
    FOR waterway_record IN 
        SELECT name, water_type, municipality, COUNT(*) as segment_count
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL 
          AND municipality IS NOT NULL
        GROUP BY name, water_type, municipality
        HAVING COUNT(*) > 1  -- KRITISK: Bara flera segment
        ORDER BY COUNT(*) DESC  -- Störst först (mest effekt)
    LOOP
        -- Skippa om redan bearbetat
        IF EXISTS (
            SELECT 1 FROM water_bodies_with_places_merged 
            WHERE name = waterway_record.name || ' (' || waterway_record.municipality || ')'
        ) THEN
            CONTINUE;
        END IF;
        
        -- Gruppera segment
        FOR group_record IN 
            SELECT * FROM group_waterway_segments_no_gaps(
                waterway_record.name, 
                waterway_record.water_type, 
                waterway_record.municipality
            )
        LOOP
            -- Snabb insert utan alla fält
            INSERT INTO water_bodies_with_places_merged (
                name, water_type, municipality, geometry,
                lat, lon, area_km2, data_source, display_name,
                original_segment_ids, merge_group_id, has_natural_gaps, 
                merge_method, segments_merged
            )
            SELECT 
                waterway_record.name || ' (' || waterway_record.municipality || ')',
                waterway_record.water_type,
                waterway_record.municipality,
                group_record.merged_geometry,
                ST_Y(ST_Centroid(group_record.merged_geometry)),
                ST_X(ST_Centroid(group_record.merged_geometry)),
                (SELECT SUM(COALESCE(area_km2, 0)) 
                 FROM water_bodies_with_places_fast_lookup 
                 WHERE id = ANY(group_record.segment_ids)),
                'MERGED',  -- Snabb default
                waterway_record.name || ' (' || waterway_record.municipality || ')',
                group_record.segment_ids,
                group_record.group_id,
                group_record.has_gaps,
                'fast_multi_segment_merge',
                group_record.total_segments;
            
            processed_count := processed_count + 1;
            
            -- Progress varje 5:e
            IF processed_count % 5 = 0 THEN
                RAISE NOTICE '⚡ Snabb merge: % av % klara (% segment totalt)', 
                    processed_count, total_multi_segment, waterway_record.segment_count;
            END IF;
        END LOOP;
    END LOOP;
    
    -- Kopiera ENSTAKA segment rakt av (inga ändringar)
    INSERT INTO water_bodies_with_places_merged (
        SELECT *, 
               ARRAY[id] as original_segment_ids,
               1 as merge_group_id,
               FALSE as has_natural_gaps,
               'single_segment_copy' as merge_method,
               1 as segments_merged
        FROM water_bodies_with_places_fast_lookup 
        WHERE water_type IN ('river', 'stream')
          AND (name, water_type, municipality) IN (
              SELECT name, water_type, municipality
              FROM water_bodies_with_places_fast_lookup
              WHERE water_type IN ('river', 'stream')
                AND name IS NOT NULL 
                AND municipality IS NOT NULL
              GROUP BY name, water_type, municipality
              HAVING COUNT(*) = 1  -- BARA enstaka segment
          )
    );
    
    GET DIAGNOSTICS skipped_singles = ROW_COUNT;
    
    RETURN format('⚡ SNABB sammanslagning klar! %s multi-segment vattendrag, %s enstaka kopierade', 
                  processed_count, skipped_singles);
END;
$$ LANGUAGE plpgsql;

-- Kör den snabba versionen
SELECT merge_multi_segment_waterways_fast() as result;