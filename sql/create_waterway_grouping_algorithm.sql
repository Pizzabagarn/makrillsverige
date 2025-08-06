-- SMART VATTENDRAG-SAMMANSLAGNING
-- Slår ihop åar/bäckar/älvar med gap-tolerans och kommun-gruppering

-- 1. Analysera nuvarande segment först
CREATE OR REPLACE VIEW waterway_segments_analysis AS
SELECT 
    name,
    water_type,
    municipality,
    COUNT(*) as segment_count,
    -- Beräkna bounding box för hela vattendraget
    ST_XMin(ST_Extent(geometry)) as min_lon,
    ST_XMax(ST_Extent(geometry)) as max_lon,
    ST_YMin(ST_Extent(geometry)) as min_lat,
    ST_YMax(ST_Extent(geometry)) as max_lat,
    -- Total längd av alla segment
    SUM(COALESCE(area_km2, 0)) as total_area_km2
FROM water_bodies_with_places_fast_lookup
WHERE water_type IN ('river', 'stream') 
  AND name IS NOT NULL
  AND municipality IS NOT NULL
  AND ST_IsValid(geometry) = true  -- Skippa trasig geometri
GROUP BY name, water_type, municipality
HAVING COUNT(*) > 1  -- Bara vattendrag med flera segment
ORDER BY segment_count DESC;

-- 2. Funktion för att beräkna avstånd mellan segment
CREATE OR REPLACE FUNCTION calculate_segment_distance(
    geom1 GEOMETRY,
    geom2 GEOMETRY
) RETURNS NUMERIC AS $$
BEGIN
    -- Returnera avstånd i km mellan närmaste punkter
    RETURN ST_Distance(
        ST_Transform(geom1, 3857),
        ST_Transform(geom2, 3857)
    ) / 1000.0;  -- Konvertera till km
END;
$$ LANGUAGE plpgsql;

-- 3. Funktion för att gruppera segment inom 5km i samma kommun
CREATE OR REPLACE FUNCTION group_waterway_segments(
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
    -- Skapa temporär tabell för denna gruppering
    CREATE TEMP TABLE temp_segment_groups (
        segment_id BIGINT,
        geometry GEOMETRY,
        group_id INTEGER,
        processed BOOLEAN DEFAULT FALSE
    );
    
    -- Hämta alla giltiga segment för detta vattendrag
    INSERT INTO temp_segment_groups (segment_id, geometry)
    SELECT id, geometry 
    FROM water_bodies_with_places_fast_lookup
    WHERE name = waterway_name
      AND water_type = waterway_type  
      AND municipality = municipality_name
      AND ST_IsValid(geometry) = true  -- Skippa trasiga geometrier
      AND geometry IS NOT NULL;
    
    -- Gruppera segment baserat på närhet (5km-regel)
    FOR segment_record IN 
        SELECT segment_id, geometry FROM temp_segment_groups WHERE NOT processed
    LOOP
        -- Tilldela aktuell grupp
        UPDATE temp_segment_groups 
        SET group_id = current_group_id, processed = TRUE
        WHERE segment_id = segment_record.segment_id;
        
        -- Hitta alla närliggande segment (inom 5km)
        UPDATE temp_segment_groups 
        SET group_id = current_group_id, processed = TRUE
        WHERE NOT processed 
          AND calculate_segment_distance(geometry, segment_record.geometry) <= max_distance_km;
        
        -- Nästa grupp
        current_group_id := current_group_id + 1;
    END LOOP;
    
    -- Returnera grupperade resultat
    RETURN QUERY
    SELECT 
        g.group_id,
        array_agg(g.segment_id) as segment_ids,
        -- ST_Collect bevarar gap mellan segment - perfekt!
        ST_Collect(g.geometry) as merged_geometry,
        COUNT(*)::INTEGER as total_segments,
        -- Kontrollera om det finns gap (mer än 1 geometry i collection)
        ST_NumGeometries(ST_Collect(g.geometry)) > 1 as has_gaps
    FROM temp_segment_groups g
    WHERE g.group_id IS NOT NULL
    GROUP BY g.group_id
    ORDER BY total_segments DESC;
    
    -- Cleanup
    DROP TABLE temp_segment_groups;
END;
$$ LANGUAGE plpgsql;

-- 4. Test-funktion för en specifik å
CREATE OR REPLACE FUNCTION test_waterway_grouping(
    test_name TEXT DEFAULT 'Höje å',
    test_municipality TEXT DEFAULT 'Lund'
) RETURNS TABLE(
    group_info TEXT,
    segment_count INTEGER,
    has_gaps BOOLEAN,
    geometry_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        format('Grupp %s: %s segment', g.group_id, g.total_segments) as group_info,
        g.total_segments as segment_count,
        g.has_gaps,
        ST_GeometryType(g.merged_geometry) as geometry_type
    FROM group_waterway_segments(test_name, 'river', test_municipality) g;
END;
$$ LANGUAGE plpgsql;

-- 5. Visa analysresultat
SELECT 
    'ANALYS: Vattendrag som kan slås ihop' as info,
    name,
    water_type,
    municipality, 
    segment_count,
    ROUND(total_area_km2::NUMERIC, 2) as total_area_km2
FROM waterway_segments_analysis 
WHERE segment_count >= 3  -- Fokusera på vattendrag med många segment
LIMIT 10;

-- Kommentarer
COMMENT ON FUNCTION group_waterway_segments IS 
'Grupperar vattendrag-segment inom 5km i samma kommun. 
 Använder ST_Collect som bevarar gap mellan segment.
 Hanterar trasig geometri genom att skippa ogiltiga segment.';

COMMENT ON FUNCTION calculate_segment_distance IS
'Beräknar avstånd i km mellan två geometrier. 
 Använder EPSG:3857 för korrekt distansberäkning.';
-- Slår ihop åar/bäckar/älvar med gap-tolerans och kommun-gruppering

-- 1. Analysera nuvarande segment först
CREATE OR REPLACE VIEW waterway_segments_analysis AS
SELECT 
    name,
    water_type,
    municipality,
    COUNT(*) as segment_count,
    -- Beräkna bounding box för hela vattendraget
    ST_XMin(ST_Extent(geometry)) as min_lon,
    ST_XMax(ST_Extent(geometry)) as max_lon,
    ST_YMin(ST_Extent(geometry)) as min_lat,
    ST_YMax(ST_Extent(geometry)) as max_lat,
    -- Total längd av alla segment
    SUM(COALESCE(area_km2, 0)) as total_area_km2
FROM water_bodies_with_places_fast_lookup
WHERE water_type IN ('river', 'stream') 
  AND name IS NOT NULL
  AND municipality IS NOT NULL
  AND ST_IsValid(geometry) = true  -- Skippa trasig geometri
GROUP BY name, water_type, municipality
HAVING COUNT(*) > 1  -- Bara vattendrag med flera segment
ORDER BY segment_count DESC;

-- 2. Funktion för att beräkna avstånd mellan segment
CREATE OR REPLACE FUNCTION calculate_segment_distance(
    geom1 GEOMETRY,
    geom2 GEOMETRY
) RETURNS NUMERIC AS $$
BEGIN
    -- Returnera avstånd i km mellan närmaste punkter
    RETURN ST_Distance(
        ST_Transform(geom1, 3857),
        ST_Transform(geom2, 3857)
    ) / 1000.0;  -- Konvertera till km
END;
$$ LANGUAGE plpgsql;

-- 3. Funktion för att gruppera segment inom 5km i samma kommun
CREATE OR REPLACE FUNCTION group_waterway_segments(
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
    -- Skapa temporär tabell för denna gruppering
    CREATE TEMP TABLE temp_segment_groups (
        segment_id BIGINT,
        geometry GEOMETRY,
        group_id INTEGER,
        processed BOOLEAN DEFAULT FALSE
    );
    
    -- Hämta alla giltiga segment för detta vattendrag
    INSERT INTO temp_segment_groups (segment_id, geometry)
    SELECT id, geometry 
    FROM water_bodies_with_places_fast_lookup
    WHERE name = waterway_name
      AND water_type = waterway_type  
      AND municipality = municipality_name
      AND ST_IsValid(geometry) = true  -- Skippa trasiga geometrier
      AND geometry IS NOT NULL;
    
    -- Gruppera segment baserat på närhet (5km-regel)
    FOR segment_record IN 
        SELECT segment_id, geometry FROM temp_segment_groups WHERE NOT processed
    LOOP
        -- Tilldela aktuell grupp
        UPDATE temp_segment_groups 
        SET group_id = current_group_id, processed = TRUE
        WHERE segment_id = segment_record.segment_id;
        
        -- Hitta alla närliggande segment (inom 5km)
        UPDATE temp_segment_groups 
        SET group_id = current_group_id, processed = TRUE
        WHERE NOT processed 
          AND calculate_segment_distance(geometry, segment_record.geometry) <= max_distance_km;
        
        -- Nästa grupp
        current_group_id := current_group_id + 1;
    END LOOP;
    
    -- Returnera grupperade resultat
    RETURN QUERY
    SELECT 
        g.group_id,
        array_agg(g.segment_id) as segment_ids,
        -- ST_Collect bevarar gap mellan segment - perfekt!
        ST_Collect(g.geometry) as merged_geometry,
        COUNT(*)::INTEGER as total_segments,
        -- Kontrollera om det finns gap (mer än 1 geometry i collection)
        ST_NumGeometries(ST_Collect(g.geometry)) > 1 as has_gaps
    FROM temp_segment_groups g
    WHERE g.group_id IS NOT NULL
    GROUP BY g.group_id
    ORDER BY total_segments DESC;
    
    -- Cleanup
    DROP TABLE temp_segment_groups;
END;
$$ LANGUAGE plpgsql;

-- 4. Test-funktion för en specifik å
CREATE OR REPLACE FUNCTION test_waterway_grouping(
    test_name TEXT DEFAULT 'Höje å',
    test_municipality TEXT DEFAULT 'Lund'
) RETURNS TABLE(
    group_info TEXT,
    segment_count INTEGER,
    has_gaps BOOLEAN,
    geometry_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        format('Grupp %s: %s segment', g.group_id, g.total_segments) as group_info,
        g.total_segments as segment_count,
        g.has_gaps,
        ST_GeometryType(g.merged_geometry) as geometry_type
    FROM group_waterway_segments(test_name, 'river', test_municipality) g;
END;
$$ LANGUAGE plpgsql;

-- 5. Visa analysresultat
SELECT 
    'ANALYS: Vattendrag som kan slås ihop' as info,
    name,
    water_type,
    municipality, 
    segment_count,
    ROUND(total_area_km2::NUMERIC, 2) as total_area_km2
FROM waterway_segments_analysis 
WHERE segment_count >= 3  -- Fokusera på vattendrag med många segment
LIMIT 10;

-- Kommentarer
COMMENT ON FUNCTION group_waterway_segments IS 
'Grupperar vattendrag-segment inom 5km i samma kommun. 
 Använder ST_Collect som bevarar gap mellan segment.
 Hanterar trasig geometri genom att skippa ogiltiga segment.';

COMMENT ON FUNCTION calculate_segment_distance IS
'Beräknar avstånd i km mellan två geometrier. 
 Använder EPSG:3857 för korrekt distansberäkning.';