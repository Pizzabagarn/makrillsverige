-- SMART KLICKSTRATEGI: Exakt precision + Lättklickade vattendrag
-- Två-stegs approach: Först exakt träff, sedan smart närhetssökning för vattendrag

DROP FUNCTION IF EXISTS find_merged_water_body_smart_click(NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION find_merged_water_body_smart_click(
  click_lat NUMERIC,
  click_lon NUMERIC,
  search_radius_deg NUMERIC
)
RETURNS SETOF water_bodies_merged_fast_lookup AS $$
DECLARE
  exact_results_count INTEGER := 0;
BEGIN
  -- STEG 1: EXAKT TRÄFF - kolla om klicket är INUTI någon geometri
  -- Detta ger 100% precision för sjöar och breda vattendrag
  
  RETURN QUERY
  SELECT *
  FROM water_bodies_merged_fast_lookup w
  WHERE w.geometry IS NOT NULL
    AND w.name IS NOT NULL
    -- Spatial förfiltrering först
    AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
    AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
    -- EXAKT geometritest
    AND ST_Contains(w.geometry, ST_Point(click_lon, click_lat, 4326))
  ORDER BY
    CASE 
      WHEN w.water_type = 'lake' THEN 1
      WHEN w.water_type = 'river' THEN 2
      WHEN w.water_type = 'stream' THEN 3
      ELSE 4
    END,
    w.area_km2 DESC NULLS LAST,
    ST_Distance(
      ST_Transform(ST_Centroid(w.geometry), 3857),
      ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
    ) ASC
  LIMIT 5;

  -- Kolla om vi fick exakta träffar
  GET DIAGNOSTICS exact_results_count = ROW_COUNT;
  
  -- STEG 2: Om INGA exakta träffar, sök ENDAST smala vattendrag i närheten
  -- Detta hjälper med smala åar/bäckar som är svåra att träffa exakt
  IF exact_results_count = 0 THEN
    RETURN QUERY
    SELECT *
    FROM water_bodies_merged_fast_lookup w
    WHERE w.geometry IS NOT NULL
      AND w.name IS NOT NULL
      -- Spatial förfiltrering
      AND w.lat BETWEEN click_lat - search_radius_deg AND click_lat + search_radius_deg
      AND w.lon BETWEEN click_lon - search_radius_deg AND click_lon + search_radius_deg
      -- ENDAST smala vattendrag (inte sjöar - de ska kräva exakt klick)
      AND w.water_type IN ('river', 'stream')
      -- Smart närhetssökning med mindre tolerans för vattendrag
      AND ST_DWithin(
        w.geometry, 
        ST_Point(click_lon, click_lat, 4326), 
        search_radius_deg * 0.5  -- Mindre tolerans = mer precision
      )
      -- EXTRA SÄKERHET: Bara riktigt smala vattendrag (inte stora sjöar som råkat klassas fel)
      AND (w.area_km2 IS NULL OR w.area_km2 < 10.0)  -- Max 10 km² för närhetssökning
    ORDER BY
      -- Prioritera vattendrag som är närmast klicket
      ST_Distance(
        ST_Transform(w.geometry, 3857),
        ST_Transform(ST_Point(click_lon, click_lat, 4326), 3857)
      ) ASC,
      -- Sedan prioritera typ
      CASE 
        WHEN w.water_type = 'river' THEN 1
        WHEN w.water_type = 'stream' THEN 2
        ELSE 3
      END,
      -- Större vattendrag först
      w.area_km2 DESC NULLS LAST
    LIMIT 3; -- Färre kandidater för närhetssökning
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- FÖRKLARING AV STRATEGIN:
-- 
-- EXAKT PRECISION för sjöar och breda vattendrag:
-- - ST_Contains säkerställer att du bara kommer till vattendrag du klickar INUTI
-- - Inga falska positives för stora sjöar
--
-- SMART HJÄLP för smala vattendrag:
-- - Om inget exakt träff, leta efter smala vattendrag i närheten
-- - ENDAST för river/stream under 10 km²
-- - Mindre tolerans (0.5x) för att undvika fel
--
-- RESULTAT:
-- - Sjöar: Kräver exakt klick (ingen risk för fel sjö)
-- - Breda vattendrag: Kräver exakt klick
-- - Smala åar/bäckar: Lättare att klicka, men fortfarande precist

-- Testa funktionen
SELECT 
    'SMART KLICKSTRATEGI SKAPAD!' as status,
    'Exakt precision + Smart hjälp för vattendrag' as strategy;

-- Test med känd koordinat  
SELECT 
    'TEST SMART KLICK' as test_type,
    name,
    water_type,
    area_km2,
    municipality
FROM find_merged_water_body_smart_click(57.7, 11.9, 0.02)
LIMIT 5;