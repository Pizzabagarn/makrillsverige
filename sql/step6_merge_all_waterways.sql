-- STEG 6: Slå ihop ALLA vattendrag (i batchar för att undvika timeout)
-- Kör efter steg 5

-- Funktion för att slå ihop alla vattendrag i små batchar
CREATE OR REPLACE FUNCTION merge_all_waterways_batch()
RETURNS TEXT AS $$
DECLARE
    waterway_record RECORD;
    group_record RECORD;
    processed_count INTEGER := 0;
    batch_size INTEGER := 10; -- Små batchar
    total_waterways INTEGER;
BEGIN
    -- Räkna totalt antal unika vattendrag
    SELECT COUNT(DISTINCT (name, water_type, municipality)) INTO total_waterways
    FROM water_bodies_with_places_fast_lookup
    WHERE water_type IN ('river', 'stream')
      AND name IS NOT NULL 
      AND municipality IS NOT NULL;
    
    RAISE NOTICE 'Startar sammanslagning av % unika vattendrag...', total_waterways;
    
    -- Gå igenom alla unika vattendrag
    FOR waterway_record IN 
        SELECT DISTINCT name, water_type, municipality
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL 
          AND municipality IS NOT NULL
        ORDER BY name, municipality
    LOOP
        -- Skippa om vi redan har detta vattendrag (från test)
        IF EXISTS (
            SELECT 1 FROM water_bodies_with_places_merged 
            WHERE name = waterway_record.name || ' (' || waterway_record.municipality || ')'
        ) THEN
            CONTINUE;
        END IF;
        
        -- Gruppera segment för detta vattendrag
        FOR group_record IN 
            SELECT * FROM group_waterway_segments_no_gaps(
                waterway_record.name, 
                waterway_record.water_type, 
                waterway_record.municipality
            )
        LOOP
            -- Skapa sammanslagen post
            INSERT INTO water_bodies_with_places_merged (
                name, water_type, municipality, geometry,
                lat, lon, area_km2, data_source, source_priority,
                depth_mean, depth_max, volume_m3, ecological_status,
                cluster_size, cluster_method, osm_id, osm_type,
                fishing_regulations, water_quality_status, region,
                water_district, tags, metadata_source, county, country,
                display_name, original_segment_ids, merge_group_id, 
                has_natural_gaps, merge_method, segments_merged
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
                data_source, source_priority, depth_mean, depth_max,
                volume_m3, ecological_status, cluster_size, cluster_method,
                osm_id, osm_type, fishing_regulations, water_quality_status,
                region, water_district, tags, metadata_source, county, country,
                waterway_record.name || ' (' || waterway_record.municipality || ')',
                group_record.segment_ids, group_record.group_id, group_record.has_gaps,
                'proximity_5km_no_gaps', group_record.total_segments
            FROM water_bodies_with_places_fast_lookup
            WHERE id = group_record.segment_ids[1]
            LIMIT 1;
            
            processed_count := processed_count + 1;
            
            -- Progress update varje 10:e
            IF processed_count % batch_size = 0 THEN
                RAISE NOTICE 'Bearbetat % av % vattendrag...', processed_count, total_waterways;
                -- Kort paus för att undvika timeout
                PERFORM pg_sleep(0.1);
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN format('✅ Sammanslagning klar! %s vattendrag bearbetade', processed_count);
END;
$$ LANGUAGE plpgsql;

-- Kör sammanslagningen
SELECT merge_all_waterways_batch() as result;