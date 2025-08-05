
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'water_bodies_unified') THEN
                CREATE TABLE water_bodies_unified (
                    id BIGSERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    search_terms TEXT NOT NULL,
                    municipality TEXT,
                    geometry GEOMETRY,
                    lat DOUBLE PRECISION,
                    lon DOUBLE PRECISION,
                    total_area_km2 NUMERIC,
                    total_length_km NUMERIC,
                    original_segment_count INTEGER DEFAULT 1,
                    original_segment_ids BIGINT[],
                    unification_method TEXT DEFAULT 'single',
                    gap_handling TEXT DEFAULT 'none',
                    is_split_section BOOLEAN DEFAULT FALSE,
                    split_parent_name TEXT,
                    split_section_order INTEGER,
                    water_type TEXT,
                    data_source TEXT,
                    source_priority INTEGER,
                    depth_mean NUMERIC,
                    depth_max NUMERIC,
                    volume_m3 NUMERIC,
                    ecological_status TEXT,
                    fishing_regulations JSONB,
                    water_quality_status TEXT,
                    region TEXT,
                    tags JSONB,
                    processing_notes TEXT,
                    disambiguation_source TEXT DEFAULT 'none',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
                
                -- Basic indexes
                CREATE INDEX idx_water_unified_name ON water_bodies_unified (name);
                CREATE INDEX idx_water_unified_coords ON water_bodies_unified (lat, lon);
                CREATE INDEX idx_water_unified_geometry ON water_bodies_unified USING GIST (geometry);
                
                -- RLS
                ALTER TABLE water_bodies_unified ENABLE ROW LEVEL SECURITY;
                CREATE POLICY "Allow public read" ON water_bodies_unified FOR SELECT USING (true);
            END IF;
        END
        $$;
        