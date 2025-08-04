#!/usr/bin/env python3
"""
Fix Lake Areas - Update area_km2 column with correct calculated areas from geometries
This is critical for the large lake click prioritization system to work properly
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

def fix_lake_areas():
    """Update area_km2 column with correct calculated areas from geometries"""
    
    print("🔧 FIXING LAKE AREA DATA")
    print("=" * 50)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        start_time = time.time()
        
        # 1. Check current area data problems
        print("📊 ANALYZING CURRENT AREA DATA PROBLEMS...")
        
        cur.execute("""
        SELECT 
            COUNT(*) as total_records,
            COUNT(CASE WHEN area_km2 IS NULL THEN 1 END) as null_areas,
            COUNT(CASE WHEN area_km2 = 0 THEN 1 END) as zero_areas,
            COUNT(CASE WHEN area_km2 > 0 THEN 1 END) as valid_areas,
            COUNT(CASE WHEN water_type = 'lake' AND (area_km2 IS NULL OR area_km2 = 0) THEN 1 END) as problematic_lakes
        FROM smhi_water_bodies_lake_unified;
        """)
        
        stats = cur.fetchone()
        print(f"   Total records: {stats['total_records']:,}")
        print(f"   NULL areas: {stats['null_areas']:,}")
        print(f"   Zero areas: {stats['zero_areas']:,}")  
        print(f"   Valid areas: {stats['valid_areas']:,}")
        print(f"   Problematic lakes: {stats['problematic_lakes']:,}")
        
        # 2. Show specific large lakes with area problems
        print(f"\n🏞️ LARGE LAKES WITH AREA PROBLEMS:")
        
        cur.execute("""
        SELECT 
            name,
            area_km2 as stored_area,
            ST_Area(ST_Transform(geometry, 3857)) / 1000000.0 as calculated_area,
            segment_count,
            unification_method
        FROM smhi_water_bodies_lake_unified
        WHERE water_type = 'lake'
          AND ST_Area(ST_Transform(geometry, 3857)) > 1000000000  -- >1000 km² calculated
          AND (area_km2 IS NULL OR area_km2 = 0 OR ABS(area_km2 - ST_Area(ST_Transform(geometry, 3857)) / 1000000.0) > 100)
        ORDER BY ST_Area(ST_Transform(geometry, 3857)) DESC
        LIMIT 10;
        """)
        
        problem_lakes = cur.fetchall()
        
        if problem_lakes:
            print("   Name               | Stored | Calculated | Segments | Method")
            print("   -------------------|--------|------------|----------|--------")
            for lake in problem_lakes:
                name = (lake['name'] or 'None')[:18]
                stored = f"{float(lake['stored_area']):.0f}" if lake['stored_area'] else 'NULL'
                calc = f"{float(lake['calculated_area']):.0f}" if lake['calculated_area'] else '0'
                segments = lake['segment_count'] or 1
                method = (lake['unification_method'] or 'None')[:8]
                print(f"   {name:<18} | {stored:>6} | {calc:>10} | {segments:>8} | {method}")
        
        # 3. Update all area_km2 values with correct calculated areas
        print(f"\n🔧 UPDATING ALL AREA VALUES...")
        
        cur.execute("""
        UPDATE smhi_water_bodies_lake_unified 
        SET area_km2 = ST_Area(ST_Transform(geometry, 3857)) / 1000000.0
        WHERE geometry IS NOT NULL;
        """)
        
        updated_count = cur.rowcount
        print(f"   ✅ Updated {updated_count:,} records with calculated areas")
        
        # 4. Verify the fix worked
        print(f"\n✅ VERIFYING AREA FIX:")
        
        cur.execute("""
        SELECT 
            name,
            area_km2,
            segment_count,
            unification_method
        FROM smhi_water_bodies_lake_unified
        WHERE water_type = 'lake'
          AND area_km2 > 1000  -- Large lakes > 1000 km²
        ORDER BY area_km2 DESC
        LIMIT 10;
        """)
        
        fixed_lakes = cur.fetchall()
        
        if fixed_lakes:
            print("   Name               | Area(km²) | Segments | Method")
            print("   -------------------|-----------|----------|--------")
            for lake in fixed_lakes:
                name = (lake['name'] or 'None')[:18]
                area = f"{float(lake['area_km2']):.0f}" if lake['area_km2'] else '0'
                segments = lake['segment_count'] or 1
                method = (lake['unification_method'] or 'None')[:8]
                print(f"   {name:<18} | {area:>8} | {segments:>8} | {method}")
        
        # 5. Test the smart click scoring now that areas are fixed
        print(f"\n🎯 TESTING SMART CLICK SCORING WITH FIXED AREAS:")
        
        # Test point near Vänern
        test_lat, test_lon = 58.96, 13.43
        search_radius = 0.05
        
        cur.execute("""
        WITH scored_lakes AS (
            SELECT 
                name,
                water_type,
                area_km2,
                SQRT(POWER((%s - lat), 2) + POWER((%s - lon), 2)) * 111.32 as distance_km,
                -- Smart scoring system (same as in service)
                CASE 
                    WHEN water_type = 'lake' AND area_km2 > 1000 THEN 3000
                    WHEN water_type = 'lake' AND area_km2 > 500 THEN 2000
                    WHEN water_type = 'lake' THEN 1000
                    WHEN water_type = 'river' THEN 500
                    ELSE 100
                END +
                (COALESCE(cluster_size, 1) * 50) +
                (1 / (SQRT(POWER((%s - lat), 2) + POWER((%s - lon), 2)) + 0.001)) * 100 as score
            FROM smhi_water_bodies_lake_unified
            WHERE lat BETWEEN %s - %s AND %s + %s
              AND lon BETWEEN %s - %s AND %s + %s
              AND geometry IS NOT NULL
        )
        SELECT name, water_type, area_km2, distance_km, score
        FROM scored_lakes
        WHERE distance_km <= 10  -- Within 10km
        ORDER BY score DESC
        LIMIT 5;
        """, (
            test_lat, test_lon, test_lat, test_lon,
            test_lat, search_radius, test_lat, search_radius,
            test_lon, search_radius, test_lon, search_radius
        ))
        
        scored_results = cur.fetchall()
        
        if scored_results:
            print("   Name               | Type | Area      | Dist(km) | Score")
            print("   -------------------|------|-----------|----------|-------")
            for result in scored_results:
                name = (result['name'] or 'None')[:18]
                water_type = result['water_type'][:4]
                area = f"{float(result['area_km2']):.0f}" if result['area_km2'] else '0'
                distance = f"{float(result['distance_km']):.1f}" if result['distance_km'] else '0.0'
                score = f"{float(result['score']):.0f}" if result['score'] else '0'
                
                marker = '🎯' if result == scored_results[0] else '  '
                if water_type == 'lake' and float(result['area_km2'] or 0) > 1000:
                    marker += '🏞️'
                
                print(f"{marker} {name:<18} | {water_type:<4} | {area:>8} | {distance:>7} | {score:>5}")
        
        # 6. Commit changes
        conn.commit()
        
        total_time = time.time() - start_time
        
        print(f"\n✅ LAKE AREA FIX COMPLETE!")
        print(f"   Updated {updated_count:,} records")
        print(f"   Processing time: {total_time:.1f}s")
        print(f"   Large lake clicking should now work much better!")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    print("🔧 Lake Area Fix")
    print("🎯 This will update area_km2 with correct calculated values")
    print("   Critical for large lake click prioritization!")
    print()
    
    response = input("🚀 Fix lake areas? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    fix_lake_areas()