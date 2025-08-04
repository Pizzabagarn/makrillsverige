#!/usr/bin/env python3
"""
Test click precision issues with current SMHI data
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

def test_click_precision():
    """Test click precision issues"""
    
    print("🖱️ TESTING CLICK PRECISION ISSUES")
    print("=" * 50)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Check geometry types in optimized table
        print("🔍 GEOMETRY TYPES IN OPTIMIZED TABLE:")
        cur.execute("""
        SELECT 
            ST_GeometryType(geometry) as geom_type,
            COUNT(*) as count,
            COUNT(*) * 100.0 / (SELECT COUNT(*) FROM smhi_water_bodies_optimized) as percentage
        FROM smhi_water_bodies_optimized
        WHERE geometry IS NOT NULL
        GROUP BY ST_GeometryType(geometry)
        ORDER BY COUNT(*) DESC;
        """)
        
        geom_types = cur.fetchall()
        for gt in geom_types:
            print(f"   {gt['geom_type']:<25} | {gt['count']:>6} | {float(gt['percentage']):>5.1f}%")
        
        # 2. Test specific problematic geometries
        print(f"\n🎯 TESTING LARGE MULTI-SEGMENT WATER BODIES:")
        cur.execute("""
        SELECT name, segment_count, ST_GeometryType(geometry) as geom_type,
               ST_IsValid(geometry) as is_valid,
               ST_Area(geometry) as area_degrees,
               lat, lon
        FROM smhi_water_bodies_optimized
        WHERE segment_count > 100
        ORDER BY segment_count DESC
        LIMIT 5;
        """)
        
        big_waters = cur.fetchall()
        print("   Name               | Segments | Geom Type          | Valid | Area     | Center")
        print("   -------------------|----------|-------------------|-------|----------|----------")
        
        for water in big_waters:
            print(f"   {water['name']:<18} | {water['segment_count']:>8} | {water['geom_type']:<17} | {water['is_valid']:<5} | {float(water['area_degrees']):.6f} | {float(water['lat']):.2f},{float(water['lon']):.2f}")
        
        # 3. Check if ST_Collect creates complex geometries
        print(f"\n📐 GEOMETRY COMPLEXITY ANALYSIS:")
        cur.execute("""
        SELECT name, segment_count,
               ST_NumGeometries(geometry) as num_geoms,
               ST_NPoints(geometry) as num_points
        FROM smhi_water_bodies_optimized
        WHERE segment_count > 50
        ORDER BY ST_NPoints(geometry) DESC
        LIMIT 5;
        """)
        
        complex_geoms = cur.fetchall()
        print("   Name               | Segments | Sub-Geoms | Points")
        print("   -------------------|----------|-----------|--------")
        
        for cg in complex_geoms:
            print(f"   {cg['name']:<18} | {cg['segment_count']:>8} | {cg['num_geoms']:>9} | {cg['num_points']:>6}")
        
        # 4. Test spatial index effectiveness
        print(f"\n📍 SPATIAL INDEX TEST (around Stockholm):")
        stockholm_lat, stockholm_lon = 59.3293, 18.0686
        
        cur.execute("""
        SELECT name, segment_count,
               lat, lon,
               ST_Distance(ST_Point(%s, %s), ST_Point(lon, lat)) as distance_degrees
        FROM smhi_water_bodies_optimized
        WHERE lat BETWEEN %s AND %s
          AND lon BETWEEN %s AND %s
        ORDER BY ST_Distance(ST_Point(%s, %s), ST_Point(lon, lat))
        LIMIT 5;
        """, (stockholm_lon, stockholm_lat,
              stockholm_lat - 0.5, stockholm_lat + 0.5,
              stockholm_lon - 0.5, stockholm_lon + 0.5,
              stockholm_lon, stockholm_lat))
        
        stockholm_waters = cur.fetchall()
        print("   Name               | Segments | Distance | Center")
        print("   -------------------|----------|----------|----------")
        
        for sw in stockholm_waters:
            dist_km = float(sw['distance_degrees']) * 111.32
            print(f"   {sw['name']:<18} | {sw['segment_count']:>8} | {dist_km:>6.1f} km | {float(sw['lat']):.2f},{float(sw['lon']):.2f}")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_click_precision()