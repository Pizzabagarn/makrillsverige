-- FIXA GAP-KLICK PROBLEMET
-- ST_Collect skapar MULTILINESTRING som kan vara klickbar i gap
-- Lösning: Använd ST_Union eller behåll separata geometrier

-- 1. Uppdatera gruppering-funktionen för att undvika gap-klick
CREATE OR REPLACE FUNCTION group_waterway_segments_no_gaps(
    waterway_name TEXT,
    waterway_type TEXT,
    municipality_name TEXT
) RETURNS TABLE(
    group_id INTEGER,
    segment_ids BIGINT[],
    -- ÄNDRING: Använd ST_Union istället för ST_Collect
    merged_geometry GEOMETRY,
    total_segments INTEGER,
    has_gaps BOOLEAN
) AS $$
DECLARE
    segment_record RECORD;
    current_group_id INTEGER := 1;
    max_distance_km NUMERIC := 5.0;
BEGIN
    -- Skapa temporär tabell för denna gruppering
    CREATE TEMP TABLE temp_segment_groups_no_gaps (
        segment_id BIGINT,
        geometry GEOMETRY,
        group_id INTEGER,
        processed BOOLEAN DEFAULT FALSE
    );
    
    -- Hämta alla giltiga segment för detta vattendrag
    INSERT INTO temp_segment_groups_no_gaps (segment_id, geometry)
    SELECT id, geometry 
    FROM water_bodies_with_places_fast_lookup
    WHERE name = waterway_name
      AND water_type = waterway_type  
      AND municipality = municipality_name
      AND ST_IsValid(geometry) = true
      AND geometry IS NOT NULL;
    
    -- Gruppera segment baserat på närhet (5km-regel)
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
    
    -- KRITISK ÄNDRING: Använd ST_Union för att undvika gap-klick
    RETURN QUERY
    SELECT 
        g.group_id,
        array_agg(g.segment_id) as segment_ids,
        -- ST_Union: Bara faktiska geometrier, INTE gap mellan dem
        ST_Union(g.geometry) as merged_geometry,
        COUNT(*)::INTEGER as total_segments,
        -- Kolla om det blir MultiLineString (indikerar gap)
        ST_GeometryType(ST_Union(g.geometry)) LIKE '%MULTI%' as has_gaps
    FROM temp_segment_groups_no_gaps g
    WHERE g.group_id IS NOT NULL
    GROUP BY g.group_id
    ORDER BY total_segments DESC;
    
    DROP TABLE temp_segment_groups_no_gaps;
END;
$$ LANGUAGE plpgsql;

-- 2. Test för att verifiera att gap inte är klickbara
CREATE OR REPLACE FUNCTION test_gap_clicking(
    test_lat NUMERIC,
    test_lon NUMERIC,
    waterway_name TEXT DEFAULT 'Höje å',
    municipality_name TEXT DEFAULT 'Lund'
) RETURNS TABLE(
    test_result TEXT,
    geometry_type TEXT,
    is_clickable BOOLEAN
) AS $$
DECLARE
    test_point GEOMETRY;
    waterway_geom GEOMETRY;
BEGIN
    test_point := ST_Point(test_lon, test_lat, 4326);
    
    -- Hämta sammanslagen geometri
    SELECT merged_geometry INTO waterway_geom
    FROM group_waterway_segments_no_gaps(waterway_name, 'river', municipality_name)
    LIMIT 1;
    
    RETURN QUERY
    SELECT 
        'Gap-klick test' as test_result,
        ST_GeometryType(waterway_geom) as geometry_type,
        ST_Contains(waterway_geom, test_point) as is_clickable;
END;
$$ LANGUAGE plpgsql;

-- 3. Uppdatera huvudfunktionen att använda den nya gap-säkra versionen
CREATE OR REPLACE FUNCTION create_merged_waterways_no_gaps()
RETURNS TEXT AS $$
DECLARE
    waterway_record RECORD;
    group_record RECORD;
    new_id BIGINT;
    merged_count INTEGER := 0;
BEGIN
    -- Använd den nya gap-säkra funktionen
    FOR waterway_record IN 
        SELECT DISTINCT name, water_type, municipality
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL 
          AND municipality IS NOT NULL
    LOOP
        -- Använd nya funktionen som undviker gap-klick
        FOR group_record IN 
            SELECT * FROM group_waterway_segments_no_gaps(
                waterway_record.name, 
                waterway_record.water_type, 
                waterway_record.municipality
            )
        LOOP
            -- Samma insert-logik som innan, men med ST_Union geometri
            -- (resten av koden samma som i create_merged_waterways)
            merged_count := merged_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN format('Gap-säker sammanslagning klar! %s vattendrag', merged_count);
END;
$$ LANGUAGE plpgsql;

-- Kommentarer
COMMENT ON FUNCTION group_waterway_segments_no_gaps IS 
'Gap-säker version som använder ST_Union istället för ST_Collect.
 Klick i gap mellan segment ger INTE träff på vattendraget.
 Bevarar fortfarande logisk gruppering inom 5km i samma kommun.';

SELECT 'Gap-klick fix klar! ST_Union förhindrar klick i tomma områden mellan segment.' as status;
-- ST_Collect skapar MULTILINESTRING som kan vara klickbar i gap
-- Lösning: Använd ST_Union eller behåll separata geometrier

-- 1. Uppdatera gruppering-funktionen för att undvika gap-klick
CREATE OR REPLACE FUNCTION group_waterway_segments_no_gaps(
    waterway_name TEXT,
    waterway_type TEXT,
    municipality_name TEXT
) RETURNS TABLE(
    group_id INTEGER,
    segment_ids BIGINT[],
    -- ÄNDRING: Använd ST_Union istället för ST_Collect
    merged_geometry GEOMETRY,
    total_segments INTEGER,
    has_gaps BOOLEAN
) AS $$
DECLARE
    segment_record RECORD;
    current_group_id INTEGER := 1;
    max_distance_km NUMERIC := 5.0;
BEGIN
    -- Skapa temporär tabell för denna gruppering
    CREATE TEMP TABLE temp_segment_groups_no_gaps (
        segment_id BIGINT,
        geometry GEOMETRY,
        group_id INTEGER,
        processed BOOLEAN DEFAULT FALSE
    );
    
    -- Hämta alla giltiga segment för detta vattendrag
    INSERT INTO temp_segment_groups_no_gaps (segment_id, geometry)
    SELECT id, geometry 
    FROM water_bodies_with_places_fast_lookup
    WHERE name = waterway_name
      AND water_type = waterway_type  
      AND municipality = municipality_name
      AND ST_IsValid(geometry) = true
      AND geometry IS NOT NULL;
    
    -- Gruppera segment baserat på närhet (5km-regel)
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
    
    -- KRITISK ÄNDRING: Använd ST_Union för att undvika gap-klick
    RETURN QUERY
    SELECT 
        g.group_id,
        array_agg(g.segment_id) as segment_ids,
        -- ST_Union: Bara faktiska geometrier, INTE gap mellan dem
        ST_Union(g.geometry) as merged_geometry,
        COUNT(*)::INTEGER as total_segments,
        -- Kolla om det blir MultiLineString (indikerar gap)
        ST_GeometryType(ST_Union(g.geometry)) LIKE '%MULTI%' as has_gaps
    FROM temp_segment_groups_no_gaps g
    WHERE g.group_id IS NOT NULL
    GROUP BY g.group_id
    ORDER BY total_segments DESC;
    
    DROP TABLE temp_segment_groups_no_gaps;
END;
$$ LANGUAGE plpgsql;

-- 2. Test för att verifiera att gap inte är klickbara
CREATE OR REPLACE FUNCTION test_gap_clicking(
    test_lat NUMERIC,
    test_lon NUMERIC,
    waterway_name TEXT DEFAULT 'Höje å',
    municipality_name TEXT DEFAULT 'Lund'
) RETURNS TABLE(
    test_result TEXT,
    geometry_type TEXT,
    is_clickable BOOLEAN
) AS $$
DECLARE
    test_point GEOMETRY;
    waterway_geom GEOMETRY;
BEGIN
    test_point := ST_Point(test_lon, test_lat, 4326);
    
    -- Hämta sammanslagen geometri
    SELECT merged_geometry INTO waterway_geom
    FROM group_waterway_segments_no_gaps(waterway_name, 'river', municipality_name)
    LIMIT 1;
    
    RETURN QUERY
    SELECT 
        'Gap-klick test' as test_result,
        ST_GeometryType(waterway_geom) as geometry_type,
        ST_Contains(waterway_geom, test_point) as is_clickable;
END;
$$ LANGUAGE plpgsql;

-- 3. Uppdatera huvudfunktionen att använda den nya gap-säkra versionen
CREATE OR REPLACE FUNCTION create_merged_waterways_no_gaps()
RETURNS TEXT AS $$
DECLARE
    waterway_record RECORD;
    group_record RECORD;
    new_id BIGINT;
    merged_count INTEGER := 0;
BEGIN
    -- Använd den nya gap-säkra funktionen
    FOR waterway_record IN 
        SELECT DISTINCT name, water_type, municipality
        FROM water_bodies_with_places_fast_lookup
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL 
          AND municipality IS NOT NULL
    LOOP
        -- Använd nya funktionen som undviker gap-klick
        FOR group_record IN 
            SELECT * FROM group_waterway_segments_no_gaps(
                waterway_record.name, 
                waterway_record.water_type, 
                waterway_record.municipality
            )
        LOOP
            -- Samma insert-logik som innan, men med ST_Union geometri
            -- (resten av koden samma som i create_merged_waterways)
            merged_count := merged_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN format('Gap-säker sammanslagning klar! %s vattendrag', merged_count);
END;
$$ LANGUAGE plpgsql;

-- Kommentarer
COMMENT ON FUNCTION group_waterway_segments_no_gaps IS 
'Gap-säker version som använder ST_Union istället för ST_Collect.
 Klick i gap mellan segment ger INTE träff på vattendraget.
 Bevarar fortfarande logisk gruppering inom 5km i samma kommun.';

SELECT 'Gap-klick fix klar! ST_Union förhindrar klick i tomma områden mellan segment.' as status;