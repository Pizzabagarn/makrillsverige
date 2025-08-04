#!/usr/bin/env python3
"""
Find real duplicates in SMHI data after cleanup
"""

import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

def get_db_config():
    load_dotenv('.env.local')
    return {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_DATABASE'), 
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': int(os.getenv('DB_PORT', 5432))
    }

def find_real_duplicates():
    """Find actual duplicated names in SMHI data"""
    
    print("🔍 FINDING REAL DUPLICATES IN SMHI DATA")
    print("=" * 60)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Check total counts
        print("📊 BASIC STATS:")
        cur.execute("SELECT COUNT(*) as total FROM smhi_water_bodies;")
        total = cur.fetchone()['total']
        
        cur.execute("SELECT COUNT(DISTINCT name) as unique_names FROM smhi_water_bodies WHERE name IS NOT NULL;")
        unique_names = cur.fetchone()['unique_names']
        
        cur.execute("SELECT COUNT(*) as with_names FROM smhi_water_bodies WHERE name IS NOT NULL;")
        with_names = cur.fetchone()['with_names']
        
        print(f"   Total records: {total:,}")
        print(f"   Records with names: {with_names:,}")
        print(f"   Unique names: {unique_names:,}")
        print(f"   Duplication factor: {with_names/unique_names:.2f}x")
        
        # 2. Find names with multiple records
        print(f"\n🔄 NAMES WITH MULTIPLE SEGMENTS:")
        cur.execute("""
        SELECT name, COUNT(*) as segment_count
        FROM smhi_water_bodies 
        WHERE name IS NOT NULL
        GROUP BY name 
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 20;
        """)
        
        duplicates = cur.fetchall()
        if duplicates:
            print(f"   Found {len(duplicates)} names with multiple segments:")
            print("   " + "-" * 50)
            for dup in duplicates:
                print(f"   {dup['name']:<30} | {dup['segment_count']:>4} segments")
        else:
            print("   ❌ No duplicates found!")
        
        # 3. Check specific names that should have many segments
        print(f"\n🎯 CHECKING SPECIFIC NAMES:")
        test_names = ['Lilla älv', 'Kvarnbäcken', 'Österdalälven', 'Ljusnan']
        
        for test_name in test_names:
            cur.execute("""
            SELECT COUNT(*) as count 
            FROM smhi_water_bodies 
            WHERE name = %s;
            """, (test_name,))
            
            result = cur.fetchone()
            count = result['count'] if result else 0
            print(f"   {test_name:<20} | {count:>4} segments")
        
        # 4. Check data distribution
        print(f"\n📊 SEGMENT DISTRIBUTION:")
        cur.execute("""
        SELECT segment_count, COUNT(*) as names_with_this_count
        FROM (
            SELECT name, COUNT(*) as segment_count
            FROM smhi_water_bodies 
            WHERE name IS NOT NULL
            GROUP BY name
        ) subq
        GROUP BY segment_count
        ORDER BY segment_count;
        """)
        
        distribution = cur.fetchall()
        print("   Segments | Names")
        print("   ---------|------")
        for dist in distribution[:10]:  # First 10 rows
            print(f"   {dist['segment_count']:>8} | {dist['names_with_this_count']:>5}")
        
        if len(distribution) > 10:
            print(f"   ... and {len(distribution)-10} more categories")
        
        # 5. Sample some duplicates in detail
        if duplicates:
            print(f"\n🔍 DETAILED SAMPLE (first duplicate):")
            sample_name = duplicates[0]['name']
            cur.execute("""
            SELECT id, source, water_type, area_km2, lat, lon,
                   ST_GeometryType(geometry) as geom_type
            FROM smhi_water_bodies 
            WHERE name = %s
            ORDER BY area_km2 DESC NULLS LAST
            LIMIT 5;
            """, (sample_name,))
            
            samples = cur.fetchall()
            print(f"   Sample from '{sample_name}':")
            for i, sample in enumerate(samples, 1):
                print(f"      {i}. ID: {sample['id']}, Type: {sample['water_type']}, Area: {sample['area_km2']}, Geom: {sample['geom_type']}")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    find_real_duplicates()