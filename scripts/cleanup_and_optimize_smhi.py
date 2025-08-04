#!/usr/bin/env python3
"""
Step 1: Clean up SMHI data and optimize for performance
- Remove all 2022 data 
- Add lat/lon columns with indexes
- Combine segments for same water body into GeometryCollection
"""

import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import sys
import json

def get_db_config():
    load_dotenv('.env.local')
    return {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_DATABASE'), 
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': int(os.getenv('DB_PORT', 5432))
    }

def cleanup_and_optimize_smhi():
    """Complete cleanup and optimization of SMHI data"""
    
    print("🧹 SMHI DATA CLEANUP & OPTIMIZATION")
    print("=" * 60)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Current status
        print("📊 CURRENT STATUS:")
        cur.execute("""
        SELECT source, COUNT(*) as count 
        FROM smhi_water_bodies 
        GROUP BY source 
        ORDER BY source;
        """)
        current = cur.fetchall()
        for row in current:
            print(f"   {row['source']:<20} | {row['count']:>8} records")
        
        # 2. Remove ALL 2022 data
        print(f"\n🗑️ REMOVING 2022 DATA...")
        cur.execute("DELETE FROM smhi_water_bodies WHERE source = 'SMHI_SVAR_2022';")
        deleted_2022 = cur.rowcount
        print(f"   ✅ Deleted {deleted_2022:,} records from 2022")
        
        # 3. Check if lat/lon columns exist, add if missing
        print(f"\n⚡ ADDING PERFORMANCE COLUMNS...")
        cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'smhi_water_bodies' 
          AND column_name IN ('lat', 'lon');
        """)
        existing_cols = [row['column_name'] for row in cur.fetchall()]
        
        if 'lat' not in existing_cols:
            cur.execute("ALTER TABLE smhi_water_bodies ADD COLUMN lat NUMERIC;")
            print("   ✅ Added lat column")
        else:
            print("   📍 lat column already exists")
            
        if 'lon' not in existing_cols:
            cur.execute("ALTER TABLE smhi_water_bodies ADD COLUMN lon NUMERIC;")
            print("   ✅ Added lon column")
        else:
            print("   📍 lon column already exists")
        
        # 4. Populate lat/lon from geometry centroids
        print(f"\n📍 CALCULATING CENTROIDS...")
        cur.execute("""
        UPDATE smhi_water_bodies 
        SET lat = ST_Y(ST_Centroid(geometry)),
            lon = ST_X(ST_Centroid(geometry))
        WHERE geometry IS NOT NULL 
          AND (lat IS NULL OR lon IS NULL);
        """)
        updated_coords = cur.rowcount
        print(f"   ✅ Updated coordinates for {updated_coords:,} records")
        
        # 5. Create indexes for performance
        print(f"\n📈 CREATING PERFORMANCE INDEXES...")
        
        # Check existing indexes
        cur.execute("""
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'smhi_water_bodies' 
          AND indexname LIKE '%lat%';
        """)
        existing_indexes = [row['indexname'] for row in cur.fetchall()]
        
        if not any('lat_lon' in idx for idx in existing_indexes):
            cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_lat_lon 
            ON smhi_water_bodies(lat, lon) 
            WHERE lat IS NOT NULL AND lon IS NOT NULL;
            """)
            print("   ✅ Created lat/lon index")
        else:
            print("   📈 lat/lon index already exists")
        
        cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_name 
        ON smhi_water_bodies(name) 
        WHERE name IS NOT NULL;
        """)
        print("   ✅ Created name index")
        
        cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_water_type 
        ON smhi_water_bodies(water_type);
        """)
        print("   ✅ Created water_type index")
        
        # 6. Analyze segment duplication
        print(f"\n🔍 ANALYZING SEGMENTS...")
        cur.execute("""
        SELECT COUNT(*) as total_segments,
               COUNT(DISTINCT name) as unique_names,
               ROUND(AVG(segments_per_name)::numeric, 1) as avg_segments_per_name
        FROM (
            SELECT name, COUNT(*) as segments_per_name
            FROM smhi_water_bodies 
            WHERE name IS NOT NULL
            GROUP BY name
        ) subq;
        """)
        
        segment_stats = cur.fetchone()
        total_segs = segment_stats['total_segments']
        unique_names = segment_stats['unique_names']
        avg_segs = segment_stats['avg_segments_per_name']
        
        print(f"   📊 Total segments: {total_segs:,}")
        print(f"   📛 Unique names: {unique_names:,}")
        print(f"   🔢 Avg segments per name: {avg_segs}")
        print(f"   ⚠️ Duplication factor: {total_segs/unique_names:.1f}x")
        
        # 7. Commit all changes
        conn.commit()
        print(f"\n✅ PHASE 1 COMPLETE!")
        print(f"   - Removed {deleted_2022:,} 2022 records")
        print(f"   - Added lat/lon coordinates")
        print(f"   - Created performance indexes")
        print(f"   - Ready for segment combination")
        
        # 8. Final status
        print(f"\n📊 FINAL STATUS:")
        cur.execute("""
        SELECT source, COUNT(*) as count,
               COUNT(DISTINCT name) as unique_names,
               COUNT(CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN 1 END) as with_coords
        FROM smhi_water_bodies 
        GROUP BY source 
        ORDER BY source;
        """)
        final = cur.fetchall()
        for row in final:
            print(f"   {row['source']:<20} | {row['count']:>8} records | {row['unique_names']:>8} unique | {row['with_coords']:>8} coords")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print(f"\n🎉 CLEANUP COMPLETED!")
    print(f"Next step: Combine segments into GeometryCollections")

if __name__ == "__main__":
    response = input("⚠️ This will DELETE all 2022 data. Continue? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    cleanup_and_optimize_smhi()