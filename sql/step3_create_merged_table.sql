-- STEG 3: Skapa tabell för sammanslagda vattendrag
-- Kör efter steg 2

DROP TABLE IF EXISTS water_bodies_with_places_merged CASCADE;

CREATE TABLE water_bodies_with_places_merged AS
SELECT * FROM water_bodies_with_places_fast_lookup WHERE 1=0;

-- Lägg till extra kolumner
ALTER TABLE water_bodies_with_places_merged 
ADD COLUMN original_segment_ids BIGINT[],
ADD COLUMN merge_group_id INTEGER,
ADD COLUMN has_natural_gaps BOOLEAN DEFAULT FALSE,
ADD COLUMN merge_method TEXT DEFAULT 'proximity_5km',
ADD COLUMN segments_merged INTEGER DEFAULT 1;

-- Skapa sequence för ID
CREATE SEQUENCE IF NOT EXISTS water_bodies_with_places_merged_id_seq;
ALTER TABLE water_bodies_with_places_merged 
ALTER COLUMN id SET DEFAULT nextval('water_bodies_with_places_merged_id_seq');

SELECT 'STEG 3 KLAR ✅ - Tabell skapad' as status;