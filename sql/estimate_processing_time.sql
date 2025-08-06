-- UPPSKATTA BEARBETNINGSTID
-- Kör detta för att se ungefär hur lång tid steg 6 kommer ta

-- 1. Räkna antal vattendrag som ska bearbetas
SELECT 
    '📊 BEARBETNINGS-UPPSKATTNING' as info,
    COUNT(DISTINCT (name, water_type, municipality)) as unique_waterways,
    COUNT(*) as total_segments,
    COUNT(*) FILTER (WHERE water_type = 'river') as rivers,
    COUNT(*) FILTER (WHERE water_type = 'stream') as streams
FROM water_bodies_with_places_fast_lookup
WHERE water_type IN ('river', 'stream')
  AND name IS NOT NULL 
  AND municipality IS NOT NULL;

-- 2. Kolla hur många som redan är klara (från test)
SELECT 
    '✅ REDAN KLARA' as status,
    COUNT(*) as already_processed
FROM water_bodies_with_places_merged 
WHERE water_type IN ('river', 'stream');

-- 3. Beräkna återstående arbete
WITH stats AS (
    SELECT 
        COUNT(DISTINCT (name, water_type, municipality)) as total_unique,
        (SELECT COUNT(*) FROM water_bodies_with_places_merged WHERE water_type IN ('river', 'stream')) as already_done
    FROM water_bodies_with_places_fast_lookup
    WHERE water_type IN ('river', 'stream')
      AND name IS NOT NULL 
      AND municipality IS NOT NULL
)
SELECT 
    '⏱️ TIDSUPPSKATTNING' as info,
    total_unique as total_waterways,
    already_done as completed,
    (total_unique - already_done) as remaining,
    -- Uppskatta tid: ~0.5 sekunder per vattendrag
    ROUND((total_unique - already_done) * 0.5 / 60.0, 1) as estimated_minutes,
    CASE 
        WHEN (total_unique - already_done) < 100 THEN '🟢 SNABBT (under 1 minut)'
        WHEN (total_unique - already_done) < 500 THEN '🟡 MÅTTLIGT (1-4 minuter)'
        WHEN (total_unique - already_done) < 1000 THEN '🟠 LÅNGSAMT (4-8 minuter)'
        ELSE '🔴 MYCKET LÅNGSAMT (över 8 minuter)'
    END as speed_category
FROM stats;

-- 4. Visa exempel på vad som ska bearbetas
SELECT 
    '📋 EXEMPEL ÅTERSTÅENDE VATTENDRAG' as info,
    name,
    municipality,
    COUNT(*) as segments
FROM water_bodies_with_places_fast_lookup
WHERE water_type IN ('river', 'stream')
  AND name IS NOT NULL 
  AND municipality IS NOT NULL
  -- Skippa redan bearbetade
  AND NOT EXISTS (
      SELECT 1 FROM water_bodies_with_places_merged 
      WHERE name = water_bodies_with_places_fast_lookup.name || ' (' || water_bodies_with_places_fast_lookup.municipality || ')'
  )
GROUP BY name, municipality
ORDER BY COUNT(*) DESC
LIMIT 10;