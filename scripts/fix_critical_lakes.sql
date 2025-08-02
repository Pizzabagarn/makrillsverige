-- FIX CRITICAL LAKES - Lägg till Sveriges viktigaste sjöar manuellt
-- Dessa MÅSTE finnas för att fiskeriapplikationen ska fungera korrekt

-- Lägg till Mälaren (Sveriges 3:e största sjö)
INSERT INTO water_bodies (
    name, 
    water_type, 
    lat, 
    lon, 
    area_km2,
    geometry,
    osm_id,
    created_manually
) VALUES (
    'Mälaren',
    'lake',
    59.4,
    16.8,
    1140,
    ST_SetSRID(ST_MakePoint(16.8, 59.4), 4326),
    -1, -- Negativ för manuell
    true
);

-- Lägg till Hjälmaren (Sveriges 4:e största sjö)
INSERT INTO water_bodies (
    name, 
    water_type, 
    lat, 
    lon, 
    area_km2,
    geometry,
    osm_id,
    created_manually
) VALUES (
    'Hjälmaren',
    'lake',
    59.2,
    15.8,
    484,
    ST_SetSRID(ST_MakePoint(15.8, 59.2), 4326),
    -2,
    true
);

-- Lägg till Vänern (om den verkligen saknas helt)
INSERT INTO water_bodies (
    name, 
    water_type, 
    lat, 
    lon, 
    area_km2,
    geometry,
    osm_id,
    created_manually
) VALUES (
    'Vänern',
    'lake',
    58.9,
    13.5,
    5519,
    ST_SetSRID(ST_MakePoint(13.5, 58.9), 4326),
    -3,
    true
);

-- Lägg till Vättern (om den verkligen saknas helt)
INSERT INTO water_bodies (
    name, 
    water_type, 
    lat, 
    lon, 
    area_km2,
    geometry,
    osm_id,
    created_manually
) VALUES (
    'Vättern',
    'lake',
    58.4,
    14.6,
    1893,
    ST_SetSRID(ST_MakePoint(14.6, 58.4), 4326),
    -4,
    true
);

-- Lägg till övriga viktiga sjöar som saknas
INSERT INTO water_bodies (
    name, 
    water_type, 
    lat, 
    lon, 
    area_km2,
    geometry,
    osm_id,
    created_manually
) VALUES 
    ('Bolmen', 'lake', 57.1, 13.5, 184, ST_SetSRID(ST_MakePoint(13.5, 57.1), 4326), -5, true),
    ('Åsnen', 'lake', 56.4, 14.7, 150, ST_SetSRID(ST_MakePoint(14.7, 56.4), 4326), -6, true),
    ('Immeln', 'lake', 56.3, 14.2, 26, ST_SetSRID(ST_MakePoint(14.2, 56.3), 4326), -7, true),
    ('Ivösjön', 'lake', 56.2, 14.4, 55, ST_SetSRID(ST_MakePoint(14.4, 56.2), 4326), -8, true);

-- Lägg till kolumn för att markera manuellt tillagda sjöar
ALTER TABLE water_bodies ADD COLUMN IF NOT EXISTS created_manually BOOLEAN DEFAULT FALSE;

-- Skapa index för snabbare søkning på viktiga sjöar
CREATE INDEX IF NOT EXISTS idx_water_bodies_critical_lakes ON water_bodies(name) WHERE created_manually = true;

COMMIT; 