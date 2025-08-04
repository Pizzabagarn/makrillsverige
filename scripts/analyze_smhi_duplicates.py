#!/usr/bin/env python3
"""
Analyze SMHI water_bodies for duplicates and potential issues
"""

import os
from dotenv import load_dotenv
import psycopg2
import sys

def get_db_config():
    load_dotenv('.env.local')
    return {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_NAME'),
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': int(os.getenv('DB_PORT', 5432))
    }

def analyze_smhi_data():
    """Comprehensive analysis of SMHI data structure and duplicates"""
    
    print("🔍 ANALYZING SMHI WATER_BODIES DATA")
    print("=" * 60)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor()
        
        # 1. Basic structure
        print("📊 TABLE STRUCTURE:")
        cur.execute("""
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'smhi_water_bodies' 
        ORDER BY ordinal_position;
        """)
        
        columns = cur.fetchall()
        for col_name, data_type, nullable in columns:
            print(f"   {col_name:<20} | {data_type:<15} | {nullable}")
        
        # 2. Data by source
        print(f"\n📈 DATA BY SOURCE:")
        cur.execute("""
        SELECT source, 
               COUNT(*) as total_count,
               COUNT(DISTINCT name) as unique_names,
               ROUND(AVG(area_km2)::numeric, 3) as avg_area,
               MIN(area_km2) as min_area,
               MAX(area_km2) as max_area
        FROM smhi_water_bodies 
        WHERE name IS NOT NULL
        GROUP BY source 
        ORDER BY source;
        """)
        
        sources = cur.fetchall()
        for source, total, unique, avg_area, min_area, max_area in sources:
            print(f"   {source:<15} | {total:>8} total | {unique:>8} unique | avg: {avg_area:>8} km²")
            print(f"   {'':<15} | {'':<8}       | {'':<8}        | min: {min_area:>8} | max: {max_area:>8}")
        
        # 3. Check for NAME duplicates (critical issue!)
        print(f"\n🔄 NAME DUPLICATES ANALYSIS:")
        cur.execute("""
        SELECT name, 
               COUNT(*) as count,
               STRING_AGG(DISTINCT source, ', ') as sources,
               STRING_AGG(DISTINCT water_type, ', ') as types,
               STRING_AGG(DISTINCT ROUND(area_km2::numeric, 2)::text, ', ') as areas
        FROM smhi_water_bodies 
        WHERE name IS NOT NULL
        GROUP BY name 
        HAVING COUNT(*) > 1
        ORDER BY count DESC, name
        LIMIT 15;
        """)
        
        duplicates = cur.fetchall()
        if duplicates:
            print(f"   ⚠️ Found {len(duplicates)} names with multiple entries:")
            print("   " + "-" * 80)
            for name, count, sources, types, areas in duplicates:
                print(f"   {name:<25} | {count:>2}x | {sources:<20} | areas: {areas}")
        else:
            print("   ✅ No name duplicates found")
        
        # 4. Geographic distribution
        print(f"\n🌍 GEOGRAPHIC DISTRIBUTION:")
        cur.execute("""
        SELECT source,
               ROUND(MIN(ST_Y(ST_Centroid(geometry)))::numeric, 2) as min_lat,
               ROUND(MAX(ST_Y(ST_Centroid(geometry)))::numeric, 2) as max_lat,
               ROUND(MIN(ST_X(ST_Centroid(geometry)))::numeric, 2) as min_lon,
               ROUND(MAX(ST_X(ST_Centroid(geometry)))::numeric, 2) as max_lon
        FROM smhi_water_bodies 
        WHERE geometry IS NOT NULL
        GROUP BY source;
        """)
        
        geo_data = cur.fetchall()
        for source, min_lat, max_lat, min_lon, max_lon in geo_data:
            print(f"   {source:<15} | lat: {min_lat:>6} to {max_lat:>6} | lon: {min_lon:>6} to {max_lon:>6}")
        
        # 5. Check if we have lat/lon columns for performance
        print(f"\n⚡ PERFORMANCE COLUMNS:")
        cur.execute("""
        SELECT COUNT(*) as total,
               COUNT(lat) as with_lat,
               COUNT(lon) as with_lon
        FROM smhi_water_bodies;
        """)
        
        perf_data = cur.fetchone()
        total, with_lat, with_lon = perf_data
        print(f"   Total records: {total:,}")
        print(f"   With lat: {with_lat:,} ({with_lat/total*100:.1f}%)")
        print(f"   With lon: {with_lon:,} ({with_lon/total*100:.1f}%)")
        
        if with_lat == 0:
            print("   ⚠️ NO LAT/LON COLUMNS - This will be SLOW for coordinate searches!")
        
        # 6. Sample of problematic cases
        print(f"\n🔍 SAMPLE PROBLEMATIC CASES:")
        cur.execute("""
        SELECT name, source, water_type, 
               ROUND(area_km2::numeric, 3) as area,
               ST_AsText(ST_Centroid(geometry)) as center
        FROM smhi_water_bodies 
        WHERE name IN (
            SELECT name FROM smhi_water_bodies 
            WHERE name IS NOT NULL
            GROUP BY name 
            HAVING COUNT(*) > 1
            LIMIT 3
        )
        ORDER BY name, source;
        """)
        
        samples = cur.fetchall()
        current_name = None
        for name, source, water_type, area, center in samples:
            if name != current_name:
                print(f"\n   📍 {name}:")
                current_name = name
            center_short = center.replace('POINT(', '').replace(')', '') if center else 'No geometry'
            print(f"      {source:<12} | {water_type:<6} | {area:>8} km² | {center_short}")
        
        # 7. Quality assessment
        print(f"\n📋 DATA QUALITY ASSESSMENT:")
        
        # Check for essential data completeness
        cur.execute("""
        SELECT source,
               COUNT(*) as total,
               COUNT(name) as with_name,
               COUNT(geometry) as with_geometry,
               COUNT(area_km2) as with_area,
               COUNT(CASE WHEN area_km2 > 0 THEN 1 END) as positive_area
        FROM smhi_water_bodies 
        GROUP BY source;
        """)
        
        quality_data = cur.fetchall()
        for source, total, with_name, with_geo, with_area, pos_area in quality_data:
            print(f"   {source:<15}:")
            print(f"      Names: {with_name:>6}/{total:<6} ({with_name/total*100:5.1f}%)")
            print(f"      Geometry: {with_geo:>6}/{total:<6} ({with_geo/total*100:5.1f}%)")
            print(f"      Area: {with_area:>6}/{total:<6} ({with_area/total*100:5.1f}%)")
            print(f"      Positive area: {pos_area:>6}/{total:<6} ({pos_area/total*100:5.1f}%)")
        
        # 8. Recommendations
        print(f"\n🎯 RECOMMENDATIONS:")
        print("   " + "=" * 50)
        
        if duplicates:
            print("   ⚠️ CRITICAL: Name duplicates found!")
            print("      → Need deduplication strategy")
            print("      → Recommend: Use 2022 for lakes, 2016 for rivers")
            print("      → Or: Create priority system (2022 > 2016)")
        
        if with_lat == 0:
            print("   ⚠️ PERFORMANCE: No lat/lon columns!")
            print("      → Need to add lat/lon for fast coordinate searches")
            print("      → Current OSM system relies on this for speed")
        
        print("   ✅ Suggested integration approach:")
        print("      1. Add lat/lon columns to smhi_water_bodies")
        print("      2. Create unified service that handles both OSM + SMHI")
        print("      3. Use source priority: SMHI > OSM for Swedish waters")
        print("      4. Deduplicate by name + proximity")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error analyzing SMHI data: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print(f"\n✅ ANALYSIS COMPLETE!")

if __name__ == "__main__":
    analyze_smhi_data()