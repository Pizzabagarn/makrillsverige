#!/usr/bin/env python3
"""
Analyze geographic duplicates - same names in different locations
"""

import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import math

def get_db_config():
    load_dotenv('.env.local')
    return {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_DATABASE'), 
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': int(os.getenv('DB_PORT', 5432))
    }

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in km"""
    if not all([lat1, lon1, lat2, lon2]):
        return float('inf')
    
    # Convert to float and calculate simple euclidean distance
    lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    lat_diff = lat1 - lat2
    lon_diff = lon1 - lon2
    return math.sqrt(lat_diff*lat_diff + lon_diff*lon_diff) * 111.32  # rough km conversion

def analyze_geographic_duplicates():
    """Find names that exist in multiple geographic locations"""
    
    print("🗺️ ANALYZING GEOGRAPHIC DUPLICATES")
    print("=" * 60)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Find names with multiple segments spread geographically
        print("🔍 FINDING POTENTIALLY SEPARATED WATER BODIES:")
        cur.execute("""
        SELECT 
            name,
            COUNT(*) as segment_count,
            MIN(lat) as min_lat,
            MAX(lat) as max_lat,
            MIN(lon) as min_lon,
            MAX(lon) as max_lon,
            (MAX(lat) - MIN(lat)) as lat_spread,
            (MAX(lon) - MIN(lon)) as lon_spread,
            AVG(lat) as center_lat,
            AVG(lon) as center_lon
        FROM smhi_water_bodies 
        WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
        GROUP BY name 
        HAVING COUNT(*) > 10  -- Focus on heavily segmented names
           AND (MAX(lat) - MIN(lat)) > 1.0  -- Large latitude spread (>100km)
           AND (MAX(lon) - MIN(lon)) > 1.0  -- Large longitude spread (>100km)
        ORDER BY (MAX(lat) - MIN(lat)) + (MAX(lon) - MIN(lon)) DESC
        LIMIT 15;
        """)
        
        suspects = cur.fetchall()
        print(f"Found {len(suspects)} names with wide geographic spread:\n")
        
        print("   Name               | Segments | Lat Spread | Lon Spread | Geographic Extent")
        print("   -------------------|----------|------------|------------|------------------")
        
        for suspect in suspects:
            lat_spread_km = float(suspect['lat_spread']) * 111.32
            lon_spread_km = float(suspect['lon_spread']) * 111.32 * math.cos(math.radians(float(suspect['center_lat'])))
            total_extent = math.sqrt(lat_spread_km**2 + lon_spread_km**2)
            
            print(f"   {suspect['name']:<18} | {suspect['segment_count']:>8} | {suspect['lat_spread']:>8.2f}° | {suspect['lon_spread']:>8.2f}° | {total_extent:>6.0f} km")
        
        # 2. Detailed analysis of worst offender
        if suspects:
            worst = suspects[0]
            print(f"\n🎯 DETAILED ANALYSIS: '{worst['name']}'")
            print(f"   Segments: {worst['segment_count']}")
            print(f"   Geographic extent: ~{math.sqrt((float(worst['lat_spread'])*111.32)**2 + (float(worst['lon_spread'])*111.32)**2):.0f} km")
            
            # Get sample coordinates for clustering analysis
            cur.execute("""
            SELECT id, lat, lon, area_km2, length_km
            FROM smhi_water_bodies 
            WHERE name = %s 
              AND lat IS NOT NULL 
              AND lon IS NOT NULL
            ORDER BY COALESCE(area_km2, length_km, 0) DESC
            LIMIT 10;
            """, (worst['name'],))
            
            samples = cur.fetchall()
            print(f"\n   Sample coordinates (top 10 by size):")
            print("   ID     | Lat     | Lon     | Distance from center")
            print("   -------|---------|---------|--------------------")
            
            center_lat = float(worst['center_lat'])
            center_lon = float(worst['center_lon'])
            
            for sample in samples:
                dist = calculate_distance(sample['lat'], sample['lon'], center_lat, center_lon)
                print(f"   {sample['id']:<6} | {sample['lat']:>7.3f} | {sample['lon']:>7.3f} | {dist:>6.0f} km")
        
        # 3. Common problematic names
        print(f"\n🚨 COMMON PROBLEMATIC NAMES:")
        common_names = ['Långsjön', 'Storsjön', 'Lilla', 'Stora', 'Kvarnbäcken', 'Svartån', 'Lillån']
        
        for name in common_names:
            cur.execute("""
            SELECT 
                COUNT(*) as segments,
                (MAX(lat) - MIN(lat)) as lat_spread,
                (MAX(lon) - MIN(lon)) as lon_spread
            FROM smhi_water_bodies 
            WHERE name ILIKE %s
              AND lat IS NOT NULL AND lon IS NOT NULL;
            """, (f'%{name}%',))
            
            result = cur.fetchone()
            if result and result['segments'] > 0:
                extent = math.sqrt((float(result['lat_spread'])*111.32)**2 + (float(result['lon_spread'])*111.32)**2) if result['lat_spread'] else 0
                print(f"   {name:<15} | {result['segments']:>4} segments | {extent:>6.0f} km extent")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    analyze_geographic_duplicates()