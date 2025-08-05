-- Water Bodies Unified - Sammansatta vattendrag med smart disambiguation
-- LÄSER från water_bodies_integrated (ändrar ALDRIG den!)
-- Klickbart på vilken del som helst av sammansatta vattendrag

CREATE TABLE IF NOT EXISTS water_bodies_unified (
    -- Grundläggande identifikation
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL, -- "Höje å" (VISS-kompatibelt originalnamn)
    display_name TEXT NOT NULL, -- "Höje å (Lund)" (UI-visning)
    search_terms TEXT NOT NULL, -- "Höje å Lund kommun Höje å (Lund)" (sökning)
    municipality TEXT, -- "Lund kommun" (från geocoding)
    
    -- Sammansatt geometri (ST_Collect med bevarade gap - klickbart överallt)
    geometry GEOMETRY,
    lat DOUBLE PRECISION, -- Centroid för snabb sökning
    lon DOUBLE PRECISION,
    total_area_km2 NUMERIC,
    total_length_km NUMERIC,
    
    -- Sammanslagning metadata
    original_segment_count INTEGER DEFAULT 1,
    original_segment_ids BIGINT[], -- Referenser till water_bodies_integrated
    unification_method TEXT, -- 'single', 'gap_preserving_merge', 'municipal_disambiguation', 'length_split'
    gap_handling TEXT, -- 'none', 'preserved', 'corrupt_segments_removed'
    
    -- Split-hantering för långa vattendrag
    is_split_section BOOLEAN DEFAULT FALSE,
    split_parent_name TEXT,
    split_section_order INTEGER,
    
    -- Kopierat från water_bodies_integrated (behåller källa-info)
    water_type TEXT, -- 'lake', 'river', 'stream', etc.
    data_source TEXT, -- 'SMHI', 'OSM', 'HYBRID'
    source_priority INTEGER, -- 1=primary, 2=fallback
    
    -- Enhanced fields från original
    depth_mean NUMERIC,
    depth_max NUMERIC,
    volume_m3 NUMERIC,
    ecological_status TEXT,
    fishing_regulations JSONB,
    water_quality_status TEXT,
    region TEXT,
    tags JSONB,
    
    -- Processing metadata
    processing_notes TEXT,
    disambiguation_source TEXT, -- 'none', 'geocoding_api', 'geographic_clustering'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Triggers för updated_at
CREATE OR REPLACE FUNCTION update_water_bodies_unified_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_water_bodies_unified_updated_at 
BEFORE UPDATE ON water_bodies_unified 
FOR EACH ROW EXECUTE FUNCTION update_water_bodies_unified_updated_at();

-- Grundläggande index för prestanda
CREATE INDEX IF NOT EXISTS idx_water_unified_name ON water_bodies_unified (name);
CREATE INDEX IF NOT EXISTS idx_water_unified_display_name ON water_bodies_unified (display_name);
CREATE INDEX IF NOT EXISTS idx_water_unified_coords ON water_bodies_unified (lat, lon);
CREATE INDEX IF NOT EXISTS idx_water_unified_water_type ON water_bodies_unified (water_type);
CREATE INDEX IF NOT EXISTS idx_water_unified_data_source ON water_bodies_unified (data_source);

-- Geometri-index för snabb spatial queries
CREATE INDEX IF NOT EXISTS idx_water_unified_geometry ON water_bodies_unified USING GIST (geometry);

-- RLS (Row Level Security) - samma som nuvarande system
ALTER TABLE water_bodies_unified ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on water_bodies_unified" ON water_bodies_unified
    FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert on water_bodies_unified" ON water_bodies_unified
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Allow authenticated update on water_bodies_unified" ON water_bodies_unified
    FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Kommentarer för dokumentation
COMMENT ON TABLE water_bodies_unified IS 'Sammansatta vattendrag med smart disambiguation - klickbart på vilken del som helst';
COMMENT ON COLUMN water_bodies_unified.name IS 'Originalnamn för VISS-kompatibilitet';
COMMENT ON COLUMN water_bodies_unified.display_name IS 'Disambiguerat namn för UI-visning';
COMMENT ON COLUMN water_bodies_unified.search_terms IS 'Söktermer för smart fuzzy matching';
COMMENT ON COLUMN water_bodies_unified.geometry IS 'ST_Collect sammansatt geometri - bevarar gap, klickbart överallt';
COMMENT ON COLUMN water_bodies_unified.original_segment_ids IS 'Array av water_bodies_integrated.id som ingår';