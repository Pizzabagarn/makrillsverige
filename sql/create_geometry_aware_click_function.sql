-- GEOMETRI-MEDVETEN KLICKFUNKTION
-- Hanterar ofullständiga OSM-geometrier och olika datatypes
-- Löser problemet med sjöar som har hål, kanter, eller ofullständiga geometrier

DROP FUNCTION IF EXISTS find_merged_water_body_containing_point(NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION find_merged_water_body_containing_point(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS SETOF water_bodies_merged_fast_lookup AS $$
DECLARE
  exact_hit_count INTEGER := 0;
  proximity_hit_count INTEGER := 0;
BEGIN
  -- STEG 1: PERFEKT GEOMETRI (SMHI och bra OSM-data)
  -- Dessa har fyllda polygoner och fungerar perfekt med ST_Contains
  
  CREATE TEMP TABLE IF NOT EXISTS exact_hits AS
  SELECT *, 'exact_geometry' as match_type
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- Spatial förfiltrering först
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    -- EXAKT geometritest för bra data
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
    -- Prioritera SMHI-data som har bäst geometrier
    AND (w.data_source = 'SMHI' OR ST_GeometryType(w.geometry) = 'ST_Polygon' OR ST_GeometryType(w.geometry) = 'ST_MultiPolygon');
    
  SELECT COUNT(*) INTO exact_hit_count FROM exact_hits;
  
  -- Om vi har perfekta geometriträffar, använd dem
  IF exact_hit_count > 0 THEN
    RETURN QUERY
    SELECT w.* FROM exact_hits w
    ORDER BY
      CASE WHEN w.data_source = 'SMHI' THEN 1 ELSE 2 END, -- SMHI först
      CASE WHEN w.water_type = 'lake' THEN 1 WHEN w.water_type = 'river' THEN 2 ELSE 3 END,
      w.area_km2 DESC NULLS LAST
    LIMIT 5;
    
    DROP TABLE exact_hits;
    RETURN;
  END IF;
  
  -- STEG 2: SMART HANTERING AV OFULLSTÄNDIGA GEOMETRIER
  -- För OSM-data med hål, kanter, eller ofullständiga polygoner
  
  CREATE TEMP TABLE IF NOT EXISTS proximity_hits AS
  SELECT *, 
    ST_Distance(
      ST_Transform(w.geometry, 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) as distance_meters,
    'proximity_geometry' as match_type
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- Spatial förfiltrering
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    AND (
      -- STRATEGI A: Nära geometrikanten (för ofullständiga polygoner)
      ST_DWithin(
        w.geometry, 
        ST_Point(click_lon, click_lat, 4326), 
        CASE 
          WHEN w.water_type = 'lake' AND w.area_km2 > 1.0 THEN search_radius_deg * 2.0  -- Större tolerans för stora sjöar
          WHEN w.water_type = 'lake' THEN search_radius_deg * 1.0  -- Normal tolerans för små sjöar
          WHEN w.water_type = 'river' THEN search_radius_deg * 0.5  -- Mindre tolerans för vattendrag
          ELSE search_radius_deg * 0.3
        END
      )
      OR
      -- STRATEGI B: Klick inom sjöns bounding box (för sjöar med hål)
      (w.water_type = 'lake' AND ST_Within(
        ST_Point(click_lon, click_lat, 4326),
        ST_Envelope(w.geometry)
      ))
    );
    
  SELECT COUNT(*) INTO proximity_hit_count FROM proximity_hits;
  
  -- Returnera närhetträffar om vi hittat några
  IF proximity_hit_count > 0 THEN
    RETURN QUERY
    SELECT w.* FROM proximity_hits w
    ORDER BY
      -- Prioritera sjöar för närhetssökning (mest sannolikt att ha geometriproblem)
      CASE WHEN w.water_type = 'lake' THEN 1 WHEN w.water_type = 'river' THEN 2 ELSE 3 END,
      -- SMHI-data först (bäst kvalitet)
      CASE WHEN w.data_source = 'SMHI' THEN 1 ELSE 2 END,
      -- Närmast först
      w.distance_meters ASC,
      -- Större area först
      w.area_km2 DESC NULLS LAST
    LIMIT 5;
    
    DROP TABLE proximity_hits;
    RETURN;
  END IF;
  
  -- STEG 3: SISTA CHANSEN - VATTENDRAG MED MINIMAL TOLERANS
  -- Bara för riktigt smala vattendrag som är svåra att träffa
  
  RETURN QUERY
  SELECT *
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    AND w.water_type IN ('river', 'stream')
    AND (w.area_km2 IS NULL OR w.area_km2 < 3.0)  -- Bara små vattendrag
    AND ST_DWithin(
      w.geometry, 
      ST_Point(click_lon, click_lat, 4326), 
      search_radius_deg * 0.2  -- Mycket liten tolerans
    )
  ORDER BY
    ST_Distance(
      ST_Transform(w.geometry, 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) ASC
  LIMIT 2;
  
  -- Rensa temp tabeller
  DROP TABLE IF EXISTS exact_hits;
  DROP TABLE IF EXISTS proximity_hits;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- FÖRKLARING AV GEOMETRI-STRATEGIER:
-- 
-- PERFEKT GEOMETRI (SMHI + bra OSM):
-- ✅ ST_Contains för exakt precision
-- ✅ Fungerar perfekt för fyllda polygoner
--
-- OFULLSTÄNDIG GEOMETRI (dålig OSM):
-- ✅ ST_DWithin med smart tolerans baserat på sjöstorlek
-- ✅ ST_Within + ST_Envelope för sjöar med hål
-- ✅ Större tolerans för stora sjöar (mer sannolikt ofullständiga)
--
-- SÄKERHET:
-- ✅ Olika toleranser för olika vattentyper
-- ✅ SMHI prioriteras (bäst geometri)
-- ✅ Avstånd används för att välja bästa match

-- Skapa nödvändiga index
CREATE INDEX IF NOT EXISTS idx_merged_fast_geometry_gist 
ON water_bodies_merged_fast_lookup USING gist (geometry);

CREATE INDEX IF NOT EXISTS idx_merged_fast_lat_lon 
ON water_bodies_merged_fast_lookup (lat, lon);

CREATE INDEX IF NOT EXISTS idx_merged_fast_data_source_type 
ON water_bodies_merged_fast_lookup (data_source, water_type, area_km2 DESC);

ANALYZE water_bodies_merged_fast_lookup;

SELECT 
    'GEOMETRI-MEDVETEN FUNKTION SKAPAD!' as status,
    'Hanterar ofullständiga OSM-geometrier' as feature_1,
    'Smart tolerans baserat på sjöstorlek' as feature_2,
    'SMHI-data prioriteras för bäst kvalitet' as feature_3;