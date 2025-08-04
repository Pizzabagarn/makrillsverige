#!/usr/bin/env python3
"""
Deep investigation of SMHI water_bodies for multiple geometries/segments
of the same water body in 2016 data
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

def investigate_smhi_segments():
    """Deep dive into SMHI segment/geometry issues"""
    
    print("🔍 DEEP SMHI SEGMENTS INVESTIGATION")
    print("=" * 60)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Overview of current SMHI data
        print("📊 CURRENT SMHI DATA OVERVIEW:")
        cur.execute("""
        SELECT source, 
               COUNT(*) as total_count,
               COUNT(DISTINCT name) as unique_names,
               ROUND(AVG(area_km2)::numeric, 3) as avg_area,
               water_type,
               COUNT(CASE WHEN geometry IS NOT NULL THEN 1 END) as with_geometry
        FROM smhi_water_bodies 
        GROUP BY source, water_type 
        ORDER BY source, water_type;
        """)
        
        overview = cur.fetchall()
        for row in overview:
            avg_area = row['avg_area'] if row['avg_area'] is not None else 0
            print(f"   {row['source']:<15} {row['water_type']:<6} | {row['total_count']:>6} total | {row['unique_names']:>6} unique | {row['with_geometry']:>6} geom | avg: {avg_area:>6.2f}")
        
        # 2. CRITICAL: Find 2016 duplicates (multiple segments)
        print(f"\n🔄 2016 DATA: MULTIPLE SEGMENTS ANALYSIS")
        cur.execute("""
        SELECT name, 
               COUNT(*) as segment_count,
               water_type,
               ROUND(SUM(area_km2)::numeric, 3) as total_area,
               ROUND(AVG(area_km2)::numeric, 3) as avg_segment_area,
               ROUND(MIN(area_km2)::numeric, 3) as min_area,
               ROUND(MAX(area_km2)::numeric, 3) as max_area
        FROM smhi_water_bodies 
        WHERE source LIKE 'SMHI_2016%' 
          AND name IS NOT NULL
        GROUP BY name, water_type
        HAVING COUNT(*) > 1
        ORDER BY segment_count DESC, total_area DESC
        LIMIT 20;
        """)
        
        segments_2016 = cur.fetchall()
        if segments_2016:
            print(f"   ⚠️ Found {len(segments_2016)} water bodies with multiple segments in 2016:")
            print("   " + "-" * 85)
            print("   Name                      | Type  | Segments | Total Area | Avg/Min/Max Segment")
            print("   " + "-" * 85)
            for row in segments_2016:
                # Handle None values safely
                total_area = row['total_area'] if row['total_area'] is not None else 0
                avg_area = row['avg_segment_area'] if row['avg_segment_area'] is not None else 0
                min_area = row['min_area'] if row['min_area'] is not None else 0
                max_area = row['max_area'] if row['max_area'] is not None else 0
                print(f"   {row['name']:<25} | {row['water_type']:<5} | {row['segment_count']:>8} | {total_area:>10} | {avg_area:>6}/{min_area:>6}/{max_area:>6}")
        else:
            print("   ✅ No multiple segments found in 2016 data")
        
        # 3. Detailed analysis of worst cases
        if segments_2016:
            print(f"\n🔍 DETAILED ANALYSIS - TOP 3 SEGMENTED WATER BODIES:")
            top_3_names = [row['name'] for row in segments_2016[:3]]
            
            for name in top_3_names:
                print(f"\n   📍 {name}:")
                cur.execute("""
                SELECT id, source, water_type, 
                       ROUND(area_km2::numeric, 3) as area,
                       ST_AsText(ST_Centroid(geometry)) as center,
                       ST_GeometryType(geometry) as geom_type
                FROM smhi_water_bodies 
                WHERE name = %s AND source LIKE 'SMHI_2016%%'
                ORDER BY area_km2 DESC;
                """, (name,))
                
                segments = cur.fetchall()
                for i, seg in enumerate(segments, 1):
                    center_short = seg['center'].replace('POINT(', '').replace(')', '') if seg['center'] else 'No center'
                    area = seg['area'] if seg['area'] is not None else 0
                    print(f"      Segment {i:>2}: {area:>8} km² | {seg['geom_type']:<15} | {center_short}")
        
        # 4. Check 2022 vs 2016 conflicts
        print(f"\n🎯 2016 vs 2022 NAME CONFLICTS:")
        cur.execute("""
        SELECT name,
               COUNT(CASE WHEN source LIKE 'SMHI_2016%' THEN 1 END) as count_2016,
               COUNT(CASE WHEN source = 'SMHI_SVAR_2022' THEN 1 END) as count_2022,
               ROUND(AVG(CASE WHEN source LIKE 'SMHI_2016%' THEN area_km2 END)::numeric, 3) as avg_2016_area,
               ROUND(AVG(CASE WHEN source = 'SMHI_SVAR_2022' THEN area_km2 END)::numeric, 3) as avg_2022_area
        FROM smhi_water_bodies 
        WHERE name IS NOT NULL
        GROUP BY name
        HAVING COUNT(CASE WHEN source LIKE 'SMHI_2016%' THEN 1 END) > 0 
           AND COUNT(CASE WHEN source = 'SMHI_SVAR_2022' THEN 1 END) > 0
        ORDER BY (count_2016 + count_2022) DESC
        LIMIT 10;
        """)
        
        conflicts = cur.fetchall()
        if conflicts:
            print(f"   ⚠️ Found {len(conflicts)} names appearing in both 2016 and 2022:")
            print("   Name                      | 2016 count | 2022 count | 2016 avg area | 2022 avg area")
            print("   " + "-" * 80)
            for row in conflicts:
                avg_2016 = row['avg_2016_area'] if row['avg_2016_area'] is not None else 0
                avg_2022 = row['avg_2022_area'] if row['avg_2022_area'] is not None else 0
                print(f"   {row['name']:<25} | {row['count_2016']:>10} | {row['count_2022']:>10} | {avg_2016:>14} | {avg_2022:>14}")
        else:
            print("   ✅ No conflicts between 2016 and 2022 data")
        
        # 5. Data quality check
        print(f"\n📋 DATA QUALITY ASSESSMENT:")
        cur.execute("""
        SELECT source,
               COUNT(*) as total,
               COUNT(name) as with_name,
               COUNT(geometry) as with_geometry,
               COUNT(area_km2) as with_area,
               COUNT(CASE WHEN area_km2 > 0 THEN 1 END) as positive_area,
               COUNT(lat) as with_lat,
               COUNT(lon) as with_lon
        FROM smhi_water_bodies 
        GROUP BY source
        ORDER BY source;
        """)
        
        quality = cur.fetchall()
        for row in quality:
            print(f"   {row['source']:<15}:")
            print(f"      Total: {row['total']:>6} | Name: {row['with_name']:>6} | Geom: {row['with_geometry']:>6} | Area: {row['with_area']:>6}")
            print(f"      Pos.Area: {row['positive_area']:>6} | Lat: {row['with_lat']:>6} | Lon: {row['with_lon']:>6}")
        
        # 6. Recommendations based on findings
        print(f"\n🎯 RECOMMENDATIONS:")
        print("   " + "=" * 50)
        
        if segments_2016:
            print("   ⚠️ MULTIPLE SEGMENTS DETECTED!")
            total_segmented = sum(row['segment_count'] for row in segments_2016)
            unique_segmented = len(segments_2016)
            print(f"      → {unique_segmented} water bodies have multiple segments")
            print(f"      → Total segments: {total_segmented}")
            print(f"      → Strategy needed for segment handling!")
            
            print("\n   💡 SEGMENT HANDLING OPTIONS:")
            print("      A) COMBINE: Merge all segments into GeometryCollection")
            print("      B) LARGEST: Keep only the largest segment per name")
            print("      C) SEPARATE: Keep all segments but mark as related")
            print("      D) SMART: Combine close segments, separate distant ones")
        
        if conflicts:
            print("\n   ⚠️ 2016/2022 CONFLICTS DETECTED!")
            print("      → Remove 2022 data first (as requested)")
            print("      → Then handle 2016 segments")
        
        if quality and quality[0]['with_lat'] == 0:
            print("\n   ⚠️ NO LAT/LON COLUMNS!")
            print("      → Must add lat/lon for OSM-level performance")
            print("      → Extract from geometry centroids")
        
        print("\n   ✅ PROPOSED IMPLEMENTATION ORDER:")
        print("      1. Remove ALL 2022 data")
        print("      2. Add lat/lon columns + indexes")
        print("      3. Handle 2016 segments (recommend option A: COMBINE)")
        print("      4. Update scandinavianWaterService to use SMHI")
        print("      5. Test performance vs current OSM system")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error investigating SMHI segments: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print(f"\n✅ INVESTIGATION COMPLETE!")
    print("\nWaiting for your decision on segment handling strategy...")

if __name__ == "__main__":
    investigate_smhi_segments()