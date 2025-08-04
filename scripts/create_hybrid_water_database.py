#!/usr/bin/env python3
"""
Create Hybrid Water Database - OSM + SMHI Integration
Combines the best of both datasets: SMHI quality for lakes, OSM coverage for rivers/streams
"""

import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import sys
import time

def get_db_config():
    load_dotenv('.env.local')
    return {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_DATABASE'), 
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': int(os.getenv('DB_PORT', 5432))
    }

def create_hybrid_table():
    """Create the hybrid water_bodies_integrated table"""
    
    print("🏗️ CREATING HYBRID WATER DATABASE")
    print("=" * 50)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        start_time = time.time()
        
        # 1. Create the hybrid table structure
        print("📊 CREATING HYBRID TABLE STRUCTURE...")
        
        cur.execute("""
        -- Drop existing table if it exists
        DROP TABLE IF EXISTS water_bodies_integrated CASCADE;
        
        -- Create hybrid table with best of both worlds
        CREATE TABLE water_bodies_integrated (
            -- Core identification
            id BIGSERIAL PRIMARY KEY,
            name TEXT,
            water_type TEXT, -- 'lake', 'river', 'stream', etc.
            geometry GEOMETRY,
            lat DOUBLE PRECISION,
            lon DOUBLE PRECISION,
            area_km2 NUMERIC,
            
            -- Source metadata
            data_source TEXT, -- 'SMHI', 'OSM'  
            source_priority INTEGER, -- 1=primary choice, 2=fallback
            original_id BIGINT, -- Original table ID for reference
            
            -- SMHI-specific fields (primarily for lakes)
            depth_mean NUMERIC,
            depth_max NUMERIC,
            volume_m3 NUMERIC,
            ecological_status TEXT,
            segment_count INTEGER,
            unification_method TEXT,
            cluster_size INTEGER,
            cluster_method TEXT,
            
            -- OSM-specific fields (primarily for rivers/streams)
            osm_id BIGINT,
            osm_type TEXT,
            region TEXT,
            fishing_regulations JSONB,
            water_quality_status TEXT,
            water_district TEXT,
            main_catchment TEXT,
            sub_catchment TEXT,
            
            -- Common enhanced fields
            tags JSONB, -- For OSM tags or SMHI metadata
            metadata_source TEXT,
            
            -- Timestamps
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)
        
        print("   ✅ Hybrid table structure created")
        
        # 2. Insert SMHI lakes (PRIORITY 1 - highest quality)
        print("\n🇸🇪 INSERTING SMHI LAKES (Priority 1)...")
        
        cur.execute("""
        INSERT INTO water_bodies_integrated (
            name, water_type, geometry, lat, lon, area_km2,
            data_source, source_priority, original_id,
            depth_mean, depth_max, volume_m3, ecological_status,
            segment_count, unification_method, cluster_size, cluster_method,
            metadata_source
        )
        SELECT 
            name, 
            water_type,
            geometry,
            lat,
            lon,
            area_km2,
            'SMHI' as data_source,
            1 as source_priority, -- Highest priority
            id as original_id,
            depth_mean,
            depth_max, 
            volume_m3,
            ecological_status,
            segment_count,
            unification_method,
            cluster_size,
            cluster_method,
            'SMHI SVAR Lake Unified' as metadata_source
        FROM smhi_water_bodies_lake_unified
        WHERE water_type = 'lake'
          AND name IS NOT NULL
          AND geometry IS NOT NULL;
        """)
        
        smhi_lakes_count = cur.rowcount
        print(f"   ✅ Inserted {smhi_lakes_count:,} SMHI lakes")
        
        # 3. Insert OSM rivers and streams (ALWAYS preferred for these types)
        print("\n🌊 INSERTING OSM RIVERS & STREAMS (Always preferred)...")
        
        cur.execute("""
        INSERT INTO water_bodies_integrated (
            name, water_type, geometry, lat, lon, area_km2,
            data_source, source_priority, original_id,
            osm_id, osm_type, region, fishing_regulations, water_quality_status,
            water_district, main_catchment, sub_catchment, tags,
            metadata_source
        )
        SELECT 
            name,
            water_type,
            geometry,
            lat,
            lon,
            area_km2,
            'OSM' as data_source,
            1 as source_priority, -- Always priority 1 for rivers/streams
            id as original_id,
            osm_id,
            osm_type,
            region,
            fishing_regulations,
            water_quality_status,
            water_district,
            main_catchment,
            sub_catchment,
            tags,
            'OSM Overpass API' as metadata_source
        FROM water_bodies
        WHERE water_type IN ('river', 'stream')
          AND name IS NOT NULL
          AND geometry IS NOT NULL;
        """)
        
        osm_rivers_count = cur.rowcount
        print(f"   ✅ Inserted {osm_rivers_count:,} OSM rivers & streams")
        
        # 4. SKIP SMHI rivers/streams - they have no metadata value
        print("\n⏭️ SKIPPING SMHI RIVERS/STREAMS (no metadata value)...")
        print("   🎯 Strategy: OSM rivers/streams have better metadata (fishing_regulations, etc.)")
        
        smhi_rivers_count = 0
        
        # 5. Insert OSM lakes as FALLBACK (using SMART geographic matching)
        print("\n🌍 INSERTING OSM LAKES (Smart geographic fallback)...")
        print("   🎯 Strategy: Only exclude OSM lakes that are <5km from SMHI lake with same name")
        
        cur.execute("""
        INSERT INTO water_bodies_integrated (
            name, water_type, geometry, lat, lon, area_km2,
            data_source, source_priority, original_id,
            osm_id, osm_type, region, fishing_regulations, water_quality_status,
            water_district, main_catchment, sub_catchment, tags,
            metadata_source
        )
        SELECT DISTINCT
            o.name,
            o.water_type,  
            o.geometry,
            o.lat,
            o.lon,
            o.area_km2,
            'OSM' as data_source,
            2 as source_priority, -- Fallback priority for lakes
            o.id as original_id,
            o.osm_id,
            o.osm_type,
            o.region,
            o.fishing_regulations,
            o.water_quality_status,
            o.water_district,
            o.main_catchment,
            o.sub_catchment,
            o.tags,
            'OSM Unique Lake' as metadata_source
        FROM water_bodies o
        WHERE o.water_type = 'lake'
          AND o.name IS NOT NULL
          AND o.geometry IS NOT NULL
          AND o.lat IS NOT NULL
          AND o.lon IS NOT NULL
          -- SMART GEOGRAPHIC EXCLUSION: Only exclude if same name + <5km distance from SMHI
          AND NOT EXISTS (
              SELECT 1 FROM smhi_water_bodies_lake_unified s
              WHERE s.water_type = 'lake' 
                AND s.name IS NOT NULL
                AND s.lat IS NOT NULL 
                AND s.lon IS NOT NULL
                AND LOWER(TRIM(s.name)) = LOWER(TRIM(o.name))
                AND SQRT(POWER(o.lat - s.lat, 2) + POWER(o.lon - s.lon, 2)) * 111.32 < 5
          );
        """)
        
        osm_lakes_fallback_count = cur.rowcount
        print(f"   ✅ Inserted {osm_lakes_fallback_count:,} OSM lakes (fallback)")
        
        # 6. Create indexes for performance
        print("\n🚀 CREATING PERFORMANCE INDEXES...")
        
        indexes = [
            "CREATE INDEX idx_integrated_geometry ON water_bodies_integrated USING GIST (geometry);",
            "CREATE INDEX idx_integrated_lat_lon ON water_bodies_integrated (lat, lon);",
            "CREATE INDEX idx_integrated_name ON water_bodies_integrated (name);",
            "CREATE INDEX idx_integrated_water_type ON water_bodies_integrated (water_type);",
            "CREATE INDEX idx_integrated_data_source ON water_bodies_integrated (data_source);",
            "CREATE INDEX idx_integrated_priority ON water_bodies_integrated (source_priority);",
            "CREATE INDEX idx_integrated_area ON water_bodies_integrated (area_km2);"
        ]
        
        for idx_sql in indexes:
            cur.execute(idx_sql)
            
        print("   ✅ Performance indexes created")
        
        # 7. Generate statistics  
        print("\n📊 SMART INTEGRATION STATISTICS:")
        
        cur.execute("""
        SELECT 
            data_source,
            water_type,
            source_priority,
            COUNT(*) as count,
            COUNT(CASE WHEN area_km2 > 100 THEN 1 END) as large_waters,
            MAX(area_km2) as max_area,
            AVG(area_km2) as avg_area
        FROM water_bodies_integrated
        GROUP BY data_source, water_type, source_priority
        ORDER BY data_source, water_type, source_priority;
        """)
        
        stats = cur.fetchall()
        
        print("   Source | Type   | Pri | Count     | Large | Max Area | Avg Area")
        print("   -------|--------|-----|-----------|-------|----------|----------")
        
        total_records = 0
        for stat in stats:
            source = stat['data_source'][:6]
            wtype = stat['water_type'][:6]
            priority = stat['source_priority']
            count = stat['count']
            large = stat['large_waters']
            max_area = f"{float(stat['max_area']):.0f}" if stat['max_area'] else '0'
            avg_area = f"{float(stat['avg_area']):.1f}" if stat['avg_area'] else '0.0'
            
            total_records += count
            
            print(f"   {source:<6} | {wtype:<6} | {priority:>3} | {count:>9,} | {large:>5} | {max_area:>8} | {avg_area:>8}")
        
        print(f"\n   📈 TOTAL INTEGRATED RECORDS: {total_records:,}")
        
        # 8. Smart integration verification
        print("\n✅ SMART INTEGRATION VERIFICATION:")
        
        # Check large lakes are from SMHI
        cur.execute("""
        SELECT data_source, COUNT(*) as count
        FROM water_bodies_integrated
        WHERE water_type = 'lake' AND area_km2 > 1000
        GROUP BY data_source;
        """)
        
        large_lake_sources = cur.fetchall()
        for source in large_lake_sources:
            print(f"   Large lakes (>1000 km²) from {source['data_source']}: {source['count']}")
        
        # Check geographic coverage
        cur.execute("""
        SELECT 
            CASE 
                WHEN lat >= 55 AND lat <= 69 AND lon >= 10.5 AND lon <= 19.5 THEN 'Sverige'
                WHEN lat >= 55 AND lat <= 69 AND lon >= 10 AND lon <= 12 AND lat >= 58 THEN 'Norge'
                WHEN lat >= 55 AND lat <= 69 AND lon >= 20 THEN 'Finland'
                WHEN lat >= 54 AND lat <= 58 AND lon >= 8 AND lon <= 15 THEN 'Danmark'
                ELSE 'Övrigt'
            END as country,
            data_source,
            COUNT(*) as count
        FROM water_bodies_integrated
        WHERE water_type = 'lake' AND lat IS NOT NULL AND lon IS NOT NULL
        GROUP BY 
            CASE 
                WHEN lat >= 55 AND lat <= 69 AND lon >= 10.5 AND lon <= 19.5 THEN 'Sverige'
                WHEN lat >= 55 AND lat <= 69 AND lon >= 10 AND lon <= 12 AND lat >= 58 THEN 'Norge'
                WHEN lat >= 55 AND lat <= 69 AND lon >= 20 THEN 'Finland'
                WHEN lat >= 54 AND lat <= 58 AND lon >= 8 AND lon <= 15 THEN 'Danmark'
                ELSE 'Övrigt'
            END, data_source
        ORDER BY country, data_source;
        """)
        
        coverage = cur.fetchall()
        print(f"\\n   Geographic Lake Coverage:")
        print(f"   Country | Source | Count")
        print(f"   --------|--------|-------")
        for row in coverage:
            country = row['country'][:7]
            source = row['data_source'][:6]
            count = f"{row['count']:,}"
            print(f"   {country:<7} | {source:<6} | {count:>5}")
        
        # Check river/stream coverage
        cur.execute("""
        SELECT COUNT(*) as osm_rivers
        FROM water_bodies_integrated
        WHERE water_type IN ('river', 'stream') AND data_source = 'OSM';
        """)
        
        osm_river_coverage = cur.fetchone()['osm_rivers']
        print(f"\\n   Rivers/streams from OSM: {osm_river_coverage:,}")
        
        # Show example of smart geographic exclusion working
        print(f"\\n🎯 SMART GEOGRAPHIC EXCLUSION EXAMPLES:")
        cur.execute("""
        WITH excluded_osm AS (
            SELECT 
                o.name as osm_name,
                o.area_km2 as osm_area,
                o.lat as osm_lat,
                o.lon as osm_lon,
                s.name as smhi_name,
                s.area_km2 as smhi_area,
                s.lat as smhi_lat,
                s.lon as smhi_lon,
                SQRT(POWER(o.lat - s.lat, 2) + POWER(o.lon - s.lon, 2)) * 111.32 as distance_km
            FROM water_bodies o
            INNER JOIN smhi_water_bodies_lake_unified s 
                ON LOWER(TRIM(s.name)) = LOWER(TRIM(o.name))
            WHERE o.water_type = 'lake' AND s.water_type = 'lake'
              AND o.name IS NOT NULL AND s.name IS NOT NULL
              AND o.lat IS NOT NULL AND s.lat IS NOT NULL
              AND SQRT(POWER(o.lat - s.lat, 2) + POWER(o.lon - s.lon, 2)) * 111.32 < 5
              AND o.area_km2 > 20  -- Focus on larger lakes
        )
        SELECT osm_name, osm_area, smhi_area, distance_km
        FROM excluded_osm
        ORDER BY distance_km ASC
        LIMIT 5;
        """)
        
        excluded_examples = cur.fetchall()
        if excluded_examples:
            print(f"   OSM lakes correctly excluded (same as SMHI):")
            print(f"   Name           | OSM Area | SMHI Area | Distance")
            print(f"   ---------------|----------|-----------|----------")
            for ex in excluded_examples:
                name = ex['osm_name'][:13]
                osm_area = f"{float(ex['osm_area']):.0f}" if ex['osm_area'] else '0'
                smhi_area = f"{float(ex['smhi_area']):.0f}" if ex['smhi_area'] else '0'
                distance = f"{float(ex['distance_km']):.1f}"
                print(f"   {name:<13} | {osm_area:>8} | {smhi_area:>9} | {distance:>8}km")
        
        # 9. Commit changes
        conn.commit()
        
        total_time = time.time() - start_time
        
        print(f"\n🎉 SMART HYBRID DATABASE INTEGRATION COMPLETE!")
        print(f"   Total time: {total_time:.1f}s")
        print(f"   Strategy: SMHI lakes + Smart geographic OSM fallback + OSM rivers/streams")
        print(f"   Geographic exclusion: Same name + <5km distance = same lake (excluded)")
        print(f"   Result: Best quality + Complete coverage + No false duplicates")
        
        conn.close()
        
        return {
            'total_records': total_records,
            'smhi_lakes': smhi_lakes_count,
            'osm_rivers': osm_rivers_count,
            'osm_lakes_fallback': osm_lakes_fallback_count,
            'processing_time': total_time
        }
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    print("🌊 Hybrid Water Database Creator")
    print("🎯 Integrates SMHI (quality) + OSM (coverage)")
    print("📋 Strategy: SMHI lakes, OSM rivers/streams, OSM lake fallback")
    print()
    
    response = input("🚀 Create hybrid database? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    results = create_hybrid_table()
    
    print(f"\n🎯 Next steps:")
    print(f"1. Create hybrid PostGIS click function (find_hybrid_water_body_containing_point)")
    print(f"2. Update frontend service to use 'water_bodies_integrated'")
    print(f"3. Test smart geographic prioritization (SMHI lakes > OSM fallback)")
    print(f"4. Verify complete coverage: Sverige/Norge/Danmark/Finland")
    print(f"5. Compare performance: ~{results['total_records']//1000}k vs current 63k records")
    print(f"6. Deploy when satisfied with smart integration results")