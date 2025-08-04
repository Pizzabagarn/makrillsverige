#!/usr/bin/env python3
"""
Smart Lake Unification - Intelligently merge lake segments that belong to the same physical lake
- Uses geographic clustering with conservative distance thresholds
- Prioritizes large lakes (>50 km² total area)
- Carefully avoids merging different lakes with same names
"""

import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import sys
import time
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

def calculate_centroid_distance_km(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in km"""
    if not all([lat1, lon1, lat2, lon2]):
        return float('inf')
    
    lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    lat_diff = lat1 - lat2
    lon_diff = (lon1 - lon2) * math.cos(math.radians((lat1 + lat2) / 2))
    return math.sqrt(lat_diff*lat_diff + lon_diff*lon_diff) * 111.32

def smart_lake_unification():
    """Smart unification of lake segments belonging to the same physical lake"""
    
    print("🏞️ SMART LAKE UNIFICATION")
    print("=" * 60)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        start_time = time.time()
        
        # 1. Find fragmented lakes that are candidates for unification
        print("📊 FINDING LAKE UNIFICATION CANDIDATES...")
        
        cur.execute("""
        SELECT 
            name,
            COUNT(*) as segment_count,
            SUM(ST_Area(ST_Transform(geometry, 3857)) / 1000000.0) as total_area_km2,
            AVG(lat) as avg_lat,
            AVG(lon) as avg_lon,
            MAX(ST_Area(ST_Transform(geometry, 3857)) / 1000000.0) as largest_segment_km2,
            (MAX(lat) - MIN(lat)) * 111.32 as lat_spread_km,
            (MAX(lon) - MIN(lon)) * 111.32 * COS(RADIANS(AVG(lat))) as lon_spread_km,
            GREATEST(
                (MAX(lat) - MIN(lat)) * 111.32,
                (MAX(lon) - MIN(lon)) * 111.32 * COS(RADIANS(AVG(lat)))
            ) as max_spread_km
        FROM smhi_water_bodies_smart_clustered
        WHERE water_type = 'lake'
          AND geometry IS NOT NULL
          AND name IS NOT NULL
        GROUP BY name
        HAVING COUNT(*) > 1  -- Only fragmented lakes
          AND SUM(ST_Area(ST_Transform(geometry, 3857)) / 1000000.0) > 50  -- Only large lakes (>50 km²)
          AND GREATEST(
                (MAX(lat) - MIN(lat)) * 111.32,
                (MAX(lon) - MIN(lon)) * 111.32 * COS(RADIANS(AVG(lat)))
             ) <= 150  -- Conservative: max 150km spread for same lake
        ORDER BY SUM(ST_Area(ST_Transform(geometry, 3857)) / 1000000.0) DESC;
        """)
        
        candidates = cur.fetchall()
        
        print(f"   🎯 Found {len(candidates)} lake unification candidates")
        if candidates:
            print("   Name               | Segments | Area(km²) | Spread(km)")
            print("   -------------------|----------|-----------|----------")
            for candidate in candidates[:15]:
                name = (candidate['name'] or 'None')[:18]  
                segments = candidate['segment_count']
                area = f"{float(candidate['total_area_km2']):.0f}" if candidate['total_area_km2'] else '0'
                spread = f"{float(candidate['max_spread_km']):.0f}" if candidate['max_spread_km'] else '0'
                print(f"   {name:<18} | {segments:>8} | {area:>8} | {spread:>9}")
        
        if not candidates:
            print("   ✅ No lake unification candidates found!")
            return
        
        # 2. Create unified lake table
        print(f"\n🏗️ CREATING UNIFIED LAKE TABLE...")
        cur.execute("DROP TABLE IF EXISTS smhi_water_bodies_lake_unified;")
        
        cur.execute("""
        CREATE TABLE smhi_water_bodies_lake_unified (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            water_type TEXT NOT NULL,
            source TEXT NOT NULL,
            geometry GEOMETRY(GEOMETRY, 4326),
            lat NUMERIC,
            lon NUMERIC,
            area_km2 NUMERIC,
            length_km NUMERIC,
            depth_mean NUMERIC,
            depth_max NUMERIC,
            volume_m3 NUMERIC,
            ecological_status TEXT,
            cluster_size INTEGER DEFAULT 1,
            cluster_method TEXT DEFAULT 'single',
            segment_count INTEGER DEFAULT 1,
            original_ids INTEGER[],
            unification_method TEXT DEFAULT 'none',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)
        print("   ✅ Created unified lake table")
        
        # 3. Copy non-fragmented records first (single segments and non-lakes)
        print(f"\n📍 COPYING NON-FRAGMENTED RECORDS...")
        
        cur.execute("""
        INSERT INTO smhi_water_bodies_lake_unified 
        (name, water_type, source, geometry, lat, lon, area_km2, length_km,
         depth_mean, depth_max, volume_m3, ecological_status, cluster_size, 
         cluster_method, segment_count, original_ids, unification_method)
        
        SELECT name, water_type, source, geometry, lat, lon, area_km2, length_km,
               depth_mean, depth_max, volume_m3, ecological_status, cluster_size,
               cluster_method, 1, ARRAY[id], 'none'
        FROM smhi_water_bodies_smart_clustered
        WHERE (water_type != 'lake' OR name NOT IN (SELECT name FROM (VALUES """ + 
        ', '.join([f"('{c['name']}')" for c in candidates]) + """) AS candidate_names(name)));
        """)
        
        non_fragmented = cur.rowcount
        print(f"   ✅ Copied {non_fragmented:,} non-fragmented records")
        
        # 4. Process each lake candidate with smart geographic clustering
        print(f"\n🧠 PROCESSING LAKE UNIFICATION CANDIDATES...")
        
        unified_lakes = 0
        for i, candidate in enumerate(candidates):
            lake_name = candidate['name']
            print(f"\n   🏞️ Processing {lake_name} ({i+1}/{len(candidates)})...")
            
            # Get all segments for this lake
            cur.execute("""
            SELECT id, geometry, lat, lon, area_km2, length_km, depth_mean, depth_max, 
                   volume_m3, ecological_status, cluster_size, cluster_method,
                   ST_Area(ST_Transform(geometry, 3857)) / 1000000.0 as calc_area_km2,
                   water_type, source
            FROM smhi_water_bodies_smart_clustered
            WHERE name = %s AND water_type = 'lake'
            ORDER BY ST_Area(ST_Transform(geometry, 3857)) DESC;
            """, (lake_name,))
            
            segments = cur.fetchall()
            
            if len(segments) <= 1:
                continue
                
            # Smart clustering: Group segments that are geographically close
            clusters = []
            unprocessed = list(segments)
            
            while unprocessed:
                # Start new cluster with largest remaining segment
                seed = unprocessed.pop(0)
                cluster = [seed]
                
                # Find all segments within reasonable distance of cluster centroid
                max_cluster_distance = min(50, candidate['max_spread_km'] / 2)  # Conservative distance
                
                cluster_changed = True
                while cluster_changed:
                    cluster_changed = False
                    cluster_lat = sum(float(s['lat']) for s in cluster) / len(cluster)
                    cluster_lon = sum(float(s['lon']) for s in cluster) / len(cluster)
                    
                    to_remove = []
                    for segment in unprocessed:
                        distance = calculate_centroid_distance_km(
                            cluster_lat, cluster_lon, 
                            float(segment['lat']), float(segment['lon'])
                        )
                        
                        if distance <= max_cluster_distance:
                            cluster.append(segment)
                            to_remove.append(segment)
                            cluster_changed = True
                    
                    for segment in to_remove:
                        unprocessed.remove(segment)
                
                clusters.append(cluster)
            
            print(f"      📊 Split into {len(clusters)} geographic clusters")
            
            # Insert unified clusters
            for cluster_idx, cluster in enumerate(clusters):
                if len(cluster) == 1:
                    # Single segment - insert as is
                    segment = cluster[0]
                    cur.execute("""
                    INSERT INTO smhi_water_bodies_lake_unified 
                    (name, water_type, source, geometry, lat, lon, area_km2, length_km,
                     depth_mean, depth_max, volume_m3, ecological_status, cluster_size, 
                     cluster_method, segment_count, original_ids, unification_method)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """, (
                        lake_name, segment['water_type'], segment['source'], segment['geometry'],
                        segment['lat'], segment['lon'], segment['area_km2'], segment['length_km'],
                        segment['depth_mean'], segment['depth_max'], segment['volume_m3'], 
                        segment['ecological_status'], segment['cluster_size'], segment['cluster_method'],
                        1, [segment['id']], 'single_segment'
                    ))
                else:
                    # Multiple segments - create unified geometry
                    geometries = [s['geometry'] for s in cluster]
                    
                    # Use PostGIS to create unified geometry
                    cur.execute("""
                    SELECT ST_Collect(geometry_array) as unified_geometry,
                           ST_Y(ST_Centroid(ST_Collect(geometry_array))) as centroid_lat,
                           ST_X(ST_Centroid(ST_Collect(geometry_array))) as centroid_lon
                    FROM (SELECT unnest(%s::geometry[]) as geometry_array) sub;
                    """, (geometries,))
                    
                    unified_result = cur.fetchone()
                    unified_geometry = unified_result['unified_geometry']
                    centroid_lat = unified_result['centroid_lat'] 
                    centroid_lon = unified_result['centroid_lon']
                    
                    # Aggregate other properties
                    total_area = sum(float(s['calc_area_km2'] or 0) for s in cluster)
                    total_length = sum(float(s['length_km'] or 0) for s in cluster)
                    max_depth_mean = max((float(s['depth_mean'] or 0) for s in cluster), default=None)
                    max_depth_max = max((float(s['depth_max'] or 0) for s in cluster), default=None)
                    total_volume = sum(float(s['volume_m3'] or 0) for s in cluster)
                    
                    # Take properties from largest segment
                    largest_segment = max(cluster, key=lambda s: float(s['calc_area_km2'] or 0))
                    
                    cur.execute("""
                    INSERT INTO smhi_water_bodies_lake_unified 
                    (name, water_type, source, geometry, lat, lon, area_km2, length_km,
                     depth_mean, depth_max, volume_m3, ecological_status, cluster_size, 
                     cluster_method, segment_count, original_ids, unification_method)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """, (
                        lake_name, largest_segment['water_type'], largest_segment['source'], 
                        unified_geometry, centroid_lat, centroid_lon, total_area, total_length,
                        max_depth_mean, max_depth_max, total_volume, largest_segment['ecological_status'],
                        sum(s['cluster_size'] or 1 for s in cluster), 'lake_unified',
                        len(cluster), [s['id'] for s in cluster], 'geographic_clustering'
                    ))
                    
                    unified_lakes += 1
                    print(f"      ✅ Unified {len(cluster)} segments into 1 lake (area: {total_area:.0f} km²)")
        
        # 5. Create indexes
        print(f"\n📈 CREATING INDEXES...")
        indexes = [
            "CREATE INDEX idx_lake_unified_lat_lon ON smhi_water_bodies_lake_unified(lat, lon);",
            "CREATE INDEX idx_lake_unified_name ON smhi_water_bodies_lake_unified(name);", 
            "CREATE INDEX idx_lake_unified_water_type ON smhi_water_bodies_lake_unified(water_type);",
            "CREATE INDEX idx_lake_unified_geometry ON smhi_water_bodies_lake_unified USING GIST(geometry);"
        ]
        
        for idx_sql in indexes:
            cur.execute(idx_sql)
        print(f"   ✅ Created {len(indexes)} indexes")
        
        # 6. Final statistics
        print(f"\n📊 LAKE UNIFICATION RESULTS:")
        
        cur.execute("SELECT COUNT(*) as total FROM smhi_water_bodies_lake_unified;")
        final_count = cur.fetchone()['total']
        
        cur.execute("""
        SELECT 
            unification_method,
            COUNT(*) as records,
            SUM(CASE WHEN water_type = 'lake' THEN 1 ELSE 0 END) as lakes
        FROM smhi_water_bodies_lake_unified
        GROUP BY unification_method
        ORDER BY COUNT(*) DESC;
        """)
        
        method_stats = cur.fetchall()
        
        total_time = time.time() - start_time
        
        print(f"   📊 Original smart clustered: 63,350")
        print(f"   🏞️ Lake unified results: {final_count:,}")
        print(f"   📉 Further reduction: {63350/final_count:.1f}x")
        print(f"   🎯 Lakes successfully unified: {unified_lakes}")
        print(f"   ⏱️ Processing time: {total_time:.1f}s")
        print()
        print("   Unification Method | Records | Lakes")
        print("   -------------------|---------|-------")
        
        for stat in method_stats:
            method = stat['unification_method']
            records = stat['records']
            lakes = stat['lakes']
            print(f"   {method:<18} | {records:>7} | {lakes:>5}")
        
        # 7. Show examples of unified lakes
        print(f"\n🏆 UNIFIED LAKE EXAMPLES:")
        cur.execute("""
        SELECT name, segment_count, area_km2, unification_method
        FROM smhi_water_bodies_lake_unified
        WHERE unification_method = 'geographic_clustering'
          AND water_type = 'lake'
        ORDER BY area_km2 DESC
        LIMIT 10;
        """)
        
        examples = cur.fetchall()
        if examples:
            print("   Name               | Segments | Area(km²) | Method")
            print("   -------------------|----------|-----------|--------")
            for ex in examples:
                name = (ex['name'] or 'None')[:18]
                segments = ex['segment_count'] or 1
                area = f"{float(ex['area_km2']):.0f}" if ex['area_km2'] else '0'
                method = (ex['unification_method'] or 'None')[:8]
                print(f"   {name:<18} | {segments:>8} | {area:>8} | {method}")
        
        # 8. Commit changes
        conn.commit()
        print(f"\n✅ SMART LAKE UNIFICATION COMPLETE!")
        print(f"   Table: smhi_water_bodies_lake_unified")
        print(f"   Smart geographic clustering for large lakes (>50 km²)")
        print(f"   Conservative approach - max 150km spread per lake")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    print("🏞️ Smart Lake Unification")
    print("🎯 Strategy:")
    print("   • Target large fragmented lakes (>50 km² total area)")
    print("   • Conservative geographic clustering (max 150km spread)")
    print("   • Avoid merging different lakes with same names")
    print("   • Preserve click precision for unified lakes")
    print()
    
    response = input("🚀 Start smart lake unification? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    smart_lake_unification()