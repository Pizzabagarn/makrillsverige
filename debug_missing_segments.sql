-- UNDERSÖK VAD SOM FILTRERATS BORT I UNIFIED PROCESSING
-- Total i original: 142,739
-- Total i unified som original_segment_ids: 140,798
-- Saknas: 1,941 segment

-- 1. Hitta vatten utan namn
SELECT 'Utan namn' as issue, COUNT(*) as count
FROM water_bodies_integrated 
WHERE name IS NULL OR name = '';

-- 2. Hitta vatten med korrupt geometri  
SELECT 'Korrupt geometri' as issue, COUNT(*) as count
FROM water_bodies_integrated 
WHERE NOT ST_IsValid(geometry);

-- 3. Kombinerat filter (samma som i SQL-scriptet)
SELECT 'Filtrerade bort totalt' as issue, COUNT(*) as count
FROM water_bodies_integrated 
WHERE NOT (ST_IsValid(geometry) = true AND name IS NOT NULL AND name != '');

-- 4. Exakt vad som skulle processeras (samma villkor som SQL-scriptet)
SELECT 'Skulle processeras' as issue, COUNT(*) as count
FROM water_bodies_integrated 
WHERE ST_IsValid(geometry) = true 
  AND name IS NOT NULL 
  AND name != '';

-- 5. Se några exempel på vad som filtrerats bort
SELECT 'Exempel filtrerade' as issue, 
       CASE 
         WHEN name IS NULL THEN 'NULL namn'
         WHEN name = '' THEN 'Tomt namn'
         WHEN NOT ST_IsValid(geometry) THEN 'Korrupt geometri'
         ELSE 'Annat'
       END as reason,
       id, name, ST_IsValid(geometry) as valid_geom
FROM water_bodies_integrated 
WHERE NOT (ST_IsValid(geometry) = true AND name IS NOT NULL AND name != '')
LIMIT 10;