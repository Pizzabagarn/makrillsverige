-- STEG 2: Skapa gruppering-funktionen
-- Kör efter steg 1

CREATE OR REPLACE FUNCTION group_waterway_segments_no_gaps(
    waterway_name TEXT,
    waterway_type TEXT,
    municipality_name TEXT
) RETURNS TABLE(
    group_id INTEGER,
    segment_ids BIGINT[],
    merged_geometry GEOMETRY,
    total_segments INTEGER,
    has_gaps BOOLEAN
) AS $$
DECLARE
    segment_record RECORD;
    current_group_id INTEGER := 1;
    max_distance_km NUMERIC := 5.0;
BEGIN
    CREATE TEMP TABLE temp_segment_groups_no_gaps (
        segment_id BIGINT,
        geometry GEOMETRY,
        group_id INTEGER,
        processed BOOLEAN DEFAULT FALSE
    );
    
    INSERT INTO temp_segment_groups_no_gaps (segment_id, geometry)
    SELECT id, geometry 
    FROM water_bodies_with_places_fast_lookup
    WHERE name = waterway_name
      AND water_type = waterway_type  
      AND municipality = municipality_name
      AND ST_IsValid(geometry) = true
      AND geometry IS NOT NULL;
    
    FOR segment_record IN 
        SELECT segment_id, geometry FROM temp_segment_groups_no_gaps WHERE NOT processed
    LOOP
        UPDATE temp_segment_groups_no_gaps 
        SET group_id = current_group_id, processed = TRUE
        WHERE segment_id = segment_record.segment_id;
        
        UPDATE temp_segment_groups_no_gaps 
        SET group_id = current_group_id, processed = TRUE
        WHERE NOT processed 
          AND calculate_segment_distance(geometry, segment_record.geometry) <= max_distance_km;
        
        current_group_id := current_group_id + 1;
    END LOOP;
    
    RETURN QUERY
    SELECT 
        g.group_id,
        array_agg(g.segment_id) as segment_ids,
        ST_Union(g.geometry) as merged_geometry,
        COUNT(*)::INTEGER as total_segments,
        ST_GeometryType(ST_Union(g.geometry)) LIKE '%MULTI%' as has_gaps
    FROM temp_segment_groups_no_gaps g
    WHERE g.group_id IS NOT NULL
    GROUP BY g.group_id
    ORDER BY total_segments DESC;
    
    DROP TABLE temp_segment_groups_no_gaps;
END;
$$ LANGUAGE plpgsql;

SELECT 'STEG 2 KLAR ✅ - Gruppering-funktion skapad' as status;