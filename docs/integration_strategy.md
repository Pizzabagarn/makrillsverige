# OSM + SMHI Integration Strategy

## 🎯 Optimal Hybrid Database Design

### **Data Priority Rules:**

1. **LAKES (Sjöar):**
   - **Primary**: SMHI data (när tillgänglig)
   - **Fallback**: OSM data (för sjöar som saknas i SMHI)
   - **Rationale**: SMHI har mycket bättre kvalitet för stora sjöar (Vänern 12,970 km² vs OSM max 114 km²)

2. **RIVERS & STREAMS (Åar & Bäckar):**
   - **Primary**: OSM data (alltid)
   - **Rationale**: Bättre täckning, detaljerad metadata, fishing_regulations

3. **GEOGRAPHIC SCOPE:**
   - **Sverige**: SMHI lakes + OSM rivers/streams
   - **Norge/Danmark**: OSM för allt (SMHI täcker inte)

### **Implementation Plan:**

#### Phase 1: Create Hybrid Table
```sql
CREATE TABLE water_bodies_integrated (
    -- Core fields (common to both)
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    water_type TEXT,
    geometry GEOMETRY,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    area_km2 NUMERIC,
    
    -- Source tracking
    data_source TEXT, -- 'SMHI', 'OSM'
    source_priority INTEGER, -- 1=primary, 2=fallback
    
    -- SMHI specific (lakes)
    depth_mean NUMERIC,
    depth_max NUMERIC,
    volume_m3 NUMERIC,
    ecological_status TEXT,
    segment_count INTEGER,
    unification_method TEXT,
    
    -- OSM specific (rivers/streams)
    fishing_regulations JSONB,
    water_quality_status TEXT,
    region TEXT,
    osm_id BIGINT,
    
    -- Indexes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Phase 2: Smart Data Integration
1. **Insert SMHI lakes** (prioritet 1)
2. **Insert OSM rivers/streams** (alltid)
3. **Insert OSM lakes** som fallback (bara om ej i SMHI)
4. **Handle duplicates** med geografisk logik

#### Phase 3: Service Migration
- Keep same API interface
- Update `smhiWaterService.ts` → `hybridWaterService.ts`
- Maintain all current functionality
- Seamless transition

### **Expected Results:**
- **Best of both worlds**: SMHI quality + OSM coverage
- **189 large lakes** from SMHI (>100 km²) vs 2 from OSM
- **Perfect clicking** on unified large lakes
- **Complete coverage** for rivers/streams
- **Preserved functionality**: Search, click, metadata