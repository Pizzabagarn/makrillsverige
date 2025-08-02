-- Aktivera PostGIS extension i Supabase
-- Kör detta FÖRST innan du skapar water_bodies tabellen

-- Aktivera PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Aktivera PostGIS topology (valfritt men användbart)
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verifiera att PostGIS är aktiverat
SELECT PostGIS_Version();

-- Visa alla tillgängliga extensions (för debugging)
SELECT * FROM pg_available_extensions WHERE name LIKE '%postgis%'; 