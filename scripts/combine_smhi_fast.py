#!/usr/bin/env python3
"""
FAST version: Combine SMHI segments using pure PostgreSQL
Much faster than Python loops!
"""

import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import sys

def get_db_config():
    load_dotenv('.env.local')
    return {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_DATABASE'), 
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': int(os.getenv('DB_PORT', 5432))
    }

def combine_smhi_fast():
    """Combine SMHI segments using pure SQL - MUCH faster!"""
    
    print("⚡ FAST SMHI SEGMENT COMBINATION")
    print("=" * 50)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Status check
        print("📊 CURRENT STATUS:")
        cur.execute("SELECT COUNT(*) as total FROM smhi_water_bodies;")
        total = cur.fetchone()['total']
        cur.execute("SELECT COUNT(DISTINCT name) as unique FROM smhi_water_bodies WHERE name IS NOT NULL;")
        unique = cur.fetchone()['unique']
        print(f"   Records: {total:,} → {unique:,} unique names ({total/unique:.1f}x duplicates)")
        
        # 2. Drop existing combined table if exists
        cur.execute("DROP TABLE IF EXISTS smhi_water_bodies_optimized;")
        
        # 3. Create optimized table with SQL aggregation - SUPER FAST!
        print(f"\n🚀 CREATING COMBINED TABLE WITH SQL AGGREGATION...")
        cur.execute("""
        CREATE TABLE smhi_water_bodies_optimized AS
        SELECT 
            ROW_NUMBER() OVER (ORDER BY name) as id,
            name,
            -- Use most common water_type for this name
            (array_agg(water_type ORDER BY water_type))[1] as water_type,
            -- Use first source
            (array_agg(source ORDER BY source))[1] as source,
            -- Combine all geometries into collection (ST_Collect is MUCH faster than Python)
            CASE 
                WHEN COUNT(*) = 1 THEN (array_agg(geometry))[1]
                ELSE ST_Collect(geometry)
            END as geometry,
            -- Weighted average coordinates
            AVG(lat) as lat,
            AVG(lon) as lon,
            -- Sum areas and lengths
            SUM(COALESCE(area_km2, 0)) as area_km2,
            SUM(COALESCE(length_km, 0)) as length_km,
            -- Max depths
            MAX(depth_mean) as depth_mean,
            MAX(depth_max) as depth_max,
            -- Sum volume
            SUM(COALESCE(volume_m3, 0)) as volume_m3,
            -- Use best ecological status (prefer first non-null)
            (array_agg(ecological_status ORDER BY ecological_status NULLS LAST))[1] as ecological_status,
            -- Use first IDs
            (array_agg(sjo_id ORDER BY sjo_id NULLS LAST))[1] as sjo_id,
            (array_agg(vdr_id ORDER BY vdr_id NULLS LAST))[1] as vdr_id,
            -- Segment count
            COUNT(*) as segment_count,
            -- Array of original IDs
            array_agg(id ORDER BY id) as original_ids,
            NOW() as created_at
        FROM smhi_water_bodies
        WHERE name IS NOT NULL
        GROUP BY name;
        """)
        
        # Get count of new table
        cur.execute("SELECT COUNT(*) as count FROM smhi_water_bodies_optimized;")
        optimized_count = cur.fetchone()['count']
        print(f"   ✅ Created {optimized_count:,} optimized records")
        
        # 4. Add primary key and constraints
        print(f"\n🔧 ADDING CONSTRAINTS...")
        cur.execute("ALTER TABLE smhi_water_bodies_optimized ADD PRIMARY KEY (id);")
        cur.execute("ALTER TABLE smhi_water_bodies_optimized ALTER COLUMN name SET NOT NULL;")
        cur.execute("ALTER TABLE smhi_water_bodies_optimized ALTER COLUMN water_type SET NOT NULL;")
        print("   ✅ Added constraints")
        
        # 5. Create indexes for performance
        print(f"\n📈 CREATING PERFORMANCE INDEXES...")
        indexes = [
            "CREATE INDEX idx_smhi_opt_lat_lon ON smhi_water_bodies_optimized(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;",
            "CREATE INDEX idx_smhi_opt_name ON smhi_water_bodies_optimized(name);",
            "CREATE INDEX idx_smhi_opt_water_type ON smhi_water_bodies_optimized(water_type);",
            "CREATE INDEX idx_smhi_opt_geometry ON smhi_water_bodies_optimized USING GIST(geometry);"
        ]
        
        for idx_sql in indexes:
            cur.execute(idx_sql)
        print(f"   ✅ Created {len(indexes)} indexes")
        
        # 6. Statistics
        print(f"\n📊 FINAL STATISTICS:")
        cur.execute("""
        SELECT 
            COUNT(*) as total,
            AVG(segment_count) as avg_segments,
            MAX(segment_count) as max_segments,
            COUNT(CASE WHEN segment_count > 1 THEN 1 END) as multi_segment,
            COUNT(CASE WHEN area_km2 > 0 THEN 1 END) as with_area,
            COUNT(CASE WHEN depth_mean > 0 THEN 1 END) as with_depth,
            COUNT(CASE WHEN volume_m3 > 0 THEN 1 END) as with_volume
        FROM smhi_water_bodies_optimized;
        """)
        
        stats = cur.fetchone()
        print(f"   📊 Total water bodies: {stats['total']:,}")
        print(f"   📈 Avg segments per water body: {stats['avg_segments']:.1f}")
        print(f"   🏆 Max segments in one water body: {stats['max_segments']}")
        print(f"   🔗 Multi-segment water bodies: {stats['multi_segment']:,}")
        print(f"   📏 With area data: {stats['with_area']:,} ({stats['with_area']/stats['total']*100:.1f}%)")
        print(f"   🏊 With depth data: {stats['with_depth']:,} ({stats['with_depth']/stats['total']*100:.1f}%)")
        print(f"   🌊 With volume data: {stats['with_volume']:,} ({stats['with_volume']/stats['total']*100:.1f}%)")
        
        # 7. Show top segmented water bodies
        print(f"\n🏆 TOP 10 MOST SEGMENTED WATER BODIES:")
        cur.execute("""
        SELECT name, segment_count, area_km2, depth_max
        FROM smhi_water_bodies_optimized
        ORDER BY segment_count DESC
        LIMIT 10;
        """)
        
        top_segmented = cur.fetchall()
        for i, row in enumerate(top_segmented, 1):
            area = f"{row['area_km2']:.1f} km²" if row['area_km2'] else "No area"
            depth = f"{row['depth_max']:.1f}m" if row['depth_max'] else "No depth"
            print(f"   {i:2d}. {row['name']:<20} | {row['segment_count']:>4} segments | {area:<10} | {depth}")
        
        # 8. Commit everything
        conn.commit()
        print(f"\n✅ FAST COMBINATION COMPLETE!")
        print(f"   Reduced {total:,} → {optimized_count:,} records ({total/optimized_count:.1f}x compression)")
        print(f"   Table: smhi_water_bodies_optimized")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print(f"\n🎉 READY TO CREATE UNIFIED SERVICE!")

if __name__ == "__main__":
    response = input("⚡ This will create optimized SMHI table. Continue? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    combine_smhi_fast()