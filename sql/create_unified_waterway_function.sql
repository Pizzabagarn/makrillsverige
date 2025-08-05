-- SQL-funktion för att skapa unified waterway med ST_Collect geometri
-- Denna funktion gör att hela vattendraget blir klickbart överallt

-- Drop existing function first
DROP FUNCTION IF EXISTS create_unified_waterway(JSONB);

CREATE OR REPLACE FUNCTION create_unified_waterway(waterway_data JSONB)
RETURNS void AS $$
DECLARE
    segment_ids BIGINT[];
    collected_geometry GEOMETRY;
    total_length NUMERIC;
BEGIN
    -- Extrahera segment IDs från input
    segment_ids := ARRAY(SELECT jsonb_array_elements_text(waterway_data->'original_segment_ids')::BIGINT);
    
    -- Skapa ST_Collect geometri från alla segment (BEVARAR GAP)
    -- Detta gör att hela vattendraget blir klickbart på vilken del som helst
    SELECT ST_Collect(geometry)
    INTO collected_geometry
    FROM water_bodies_integrated 
    WHERE id = ANY(segment_ids)
      AND geometry IS NOT NULL;
    
    -- Beräkna total längd för vattendrag (rivers/streams)
    IF (waterway_data->>'water_type') IN ('river', 'stream') THEN
        SELECT ST_Length(ST_Transform(collected_geometry, 3857)) / 1000.0
        INTO total_length;
    ELSE
        total_length := NULL;
    END IF;
    
    -- Verifiera att vi fick en giltig geometri
    IF collected_geometry IS NULL THEN
        RAISE EXCEPTION 'Kunde inte skapa geometri från segment: %', segment_ids;
    END IF;
    
    -- Säkerställ att geometrin är giltig
    IF NOT ST_IsValid(collected_geometry) THEN
        -- Försök reparera geometrin
        collected_geometry := ST_MakeValid(collected_geometry);
        
        -- Om den fortfarande inte är giltig, logga varning men fortsätt
        IF NOT ST_IsValid(collected_geometry) THEN
            RAISE WARNING 'Geometri för % är fortfarande ogiltig efter ST_MakeValid', waterway_data->>'display_name';
        END IF;
    END IF;
    
    -- Infoga unified waterway
    INSERT INTO water_bodies_unified (
        name,
        display_name,
        search_terms,
        municipality,
        geometry,
        lat,
        lon,
        total_area_km2,
        total_length_km,
        original_segment_count,
        original_segment_ids,
        unification_method,
        gap_handling,
        is_split_section,
        split_parent_name,
        split_section_order,
        water_type,
        data_source,
        source_priority,
        depth_mean,
        depth_max,
        volume_m3,
        ecological_status,
        fishing_regulations,
        water_quality_status,
        region,
        tags,
        processing_notes,
        disambiguation_source
    ) VALUES (
        waterway_data->>'name',
        waterway_data->>'display_name',
        waterway_data->>'search_terms',
        waterway_data->>'municipality',
        collected_geometry, -- ST_Collect geometri - klickbar överallt!
        (waterway_data->>'lat')::DOUBLE PRECISION,
        (waterway_data->>'lon')::DOUBLE PRECISION,
        (waterway_data->>'total_area_km2')::NUMERIC,
        total_length,
        (waterway_data->>'original_segment_count')::INTEGER,
        segment_ids,
        waterway_data->>'unification_method',
        waterway_data->>'gap_handling',
        (waterway_data->>'is_split_section')::BOOLEAN,
        waterway_data->>'split_parent_name',
        (waterway_data->>'split_section_order')::INTEGER,
        waterway_data->>'water_type',
        waterway_data->>'data_source',
        (waterway_data->>'source_priority')::INTEGER,
        (waterway_data->>'depth_mean')::NUMERIC,
        (waterway_data->>'depth_max')::NUMERIC,
        (waterway_data->>'volume_m3')::NUMERIC,
        waterway_data->>'ecological_status',
        (waterway_data->>'fishing_regulations')::JSONB,
        waterway_data->>'water_quality_status',
        waterway_data->>'region',
        (waterway_data->>'tags')::JSONB,
        waterway_data->>'processing_notes',
        waterway_data->>'disambiguation_source'
    );
    
    -- Logga framgång
    RAISE NOTICE 'Skapat unified waterway: % (% segment)', 
        waterway_data->>'display_name', 
        waterway_data->>'original_segment_count';
        
END;
$$ LANGUAGE plpgsql;

-- Hjälpfunktion för att uppdatera materialized view
CREATE OR REPLACE FUNCTION refresh_materialized_view(view_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_name);
    RAISE NOTICE 'Refreshed materialized view: %', view_name;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback till vanlig refresh om CONCURRENTLY misslyckas
        EXECUTE format('REFRESH MATERIALIZED VIEW %I', view_name);
        RAISE NOTICE 'Refreshed materialized view (non-concurrent): %', view_name;
END;
$$ LANGUAGE plpgsql;

-- Test-funktion för att verifiera att geometri är klickbar
CREATE OR REPLACE FUNCTION test_unified_waterway_clickability(
    waterway_id BIGINT,
    test_lat DOUBLE PRECISION,
    test_lon DOUBLE PRECISION
)
RETURNS BOOLEAN AS $$
DECLARE
    test_point GEOMETRY;
    waterway_geom GEOMETRY;
    is_clickable BOOLEAN := FALSE;
BEGIN
    -- Skapa test-punkt
    test_point := ST_Point(test_lon, test_lat, 4326);
    
    -- Hämta waterway geometri
    SELECT geometry INTO waterway_geom
    FROM water_bodies_unified
    WHERE id = waterway_id;
    
    IF waterway_geom IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Testa om punkten är inom en rimlig distans från vattendraget
    -- (simulerar klick-tolerans)
    SELECT ST_DWithin(
        ST_Transform(waterway_geom, 3857),
        ST_Transform(test_point, 3857),
        1000 -- 1km tolerans
    ) INTO is_clickable;
    
    RETURN is_clickable;
END;
$$ LANGUAGE plpgsql;

-- Kommentarer
COMMENT ON FUNCTION create_unified_waterway(JSONB) IS 'Skapar unified waterway med ST_Collect geometri som är klickbar överallt';
COMMENT ON FUNCTION refresh_materialized_view(TEXT) IS 'Uppdaterar materialized view med fallback för concurrency';
COMMENT ON FUNCTION test_unified_waterway_clickability(BIGINT, DOUBLE PRECISION, DOUBLE PRECISION) IS 'Testar om en punkt är klickbar för unified waterway';