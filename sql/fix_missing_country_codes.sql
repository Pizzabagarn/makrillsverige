-- FIXA SAKNADE COUNTRY-KODER för åar/bäckar/floder

-- 1. Kolla hur många som saknar country-kod eller har fel kod
SELECT 
    'COUNTRY-KOD PROBLEM' as test,
    country,
    water_type,
    COUNT(*) as antal
FROM water_bodies_merged_fast_lookup
WHERE water_type IN ('river', 'stream')
GROUP BY country, water_type
ORDER BY COUNT(*) DESC;

-- 2. Kolla specifikt svenska vattendrag som kanske fått fel kod
SELECT 
    'SVENSKA VATTENDRAG MED FEL KOD' as test,
    name,
    municipality,
    country,
    water_type
FROM water_bodies_merged_fast_lookup
WHERE water_type IN ('river', 'stream')
  AND municipality IN ('Burlöv', 'Malmö', 'Lund', 'Stockholm', 'Göteborg')
  AND (country != 'SE' OR country IS NULL)
LIMIT 10;

-- 3. Fixa country-koder baserat på kommun
UPDATE water_bodies_merged_fast_lookup 
SET country = CASE
    -- Svenska kommuner
    WHEN municipality IN (
        'Burlöv', 'Malmö', 'Lund', 'Stockholm', 'Göteborg', 'Helsingborg', 
        'Kristianstad', 'Halmstad', 'Växjö', 'Kalmar', 'Karlskrona',
        'Blekinge', 'Skåne', 'Halland', 'Västra Götaland', 'Östergötland',
        'Småland', 'Gotland', 'Uppsala', 'Västerås', 'Örebro', 'Linköping',
        'Norrköping', 'Jönköping', 'Borås', 'Sundsvall', 'Gävle', 'Umeå',
        'Luleå', 'Kiruna', 'Mariestad', 'Skövde', 'Trollhättan', 'Uddevalla'
    ) THEN 'SE'
    
    -- Danska kommuner
    WHEN municipality IN (
        'København', 'Aarhus', 'Odense', 'Aalborg', 'Esbjerg', 'Randers',
        'Kolding', 'Horsens', 'Vejle', 'Roskilde', 'Herning', 'Silkeborg',
        'Næstved', 'Fredericia', 'Viborg', 'Køge', 'Holstebro', 'Taastrup',
        'Slagelse', 'Hillerød', 'Sønderborg', 'Hjørring', 'Frederikshavn'
    ) THEN 'DK'
    
    -- Norska kommuner  
    WHEN municipality IN (
        'Oslo', 'Bergen', 'Stavanger', 'Trondheim', 'Fredrikstad', 'Kristiansand',
        'Sandnes', 'Tromsø', 'Sarpsborg', 'Skien', 'Ålesund', 'Sandefjord',
        'Haugesund', 'Tønsberg', 'Moss', 'Drammen', 'Lillehammer', 'Bodø'
    ) THEN 'NO'
    
    ELSE country  -- Behåll befintlig om inte matchad
END
WHERE water_type IN ('river', 'stream', 'lake');

-- 4. Verifiera fix
SELECT 
    'EFTER FIX' as test,
    country,
    water_type,
    COUNT(*) as antal
FROM water_bodies_merged_fast_lookup
WHERE water_type IN ('river', 'stream')
GROUP BY country, water_type
ORDER BY COUNT(*) DESC;

-- 5. Kolla Sege å specifikt
SELECT 
    'SEGE Å EFTER FIX' as test,
    name,
    municipality,
    country,
    water_type
FROM water_bodies_merged_fast_lookup
WHERE name ILIKE '%sege%'
LIMIT 5;

SELECT 'COUNTRY-KODER FIXADE!' as status;