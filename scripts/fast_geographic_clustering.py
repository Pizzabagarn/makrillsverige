#!/usr/bin/env python3
"""
FAST Geographic clustering with real-time feedback
Uses SQL-based clustering for speed
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

def fast_geographic_clustering():
    """Fast geographic clustering using SQL"""
    
    print("⚡ FAST GEOGRAPHIC CLUSTERING")
    print("=" * 50)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        start_time = time.time()
        
        # 1. Create result table
        print("🏗️ CREATING RESULT TABLE...")
        cur.execute("DROP TABLE IF EXISTS smhi_water_bodies_geo_clustered;")
        cur.execute("""
        CREATE TABLE smhi_water_bodies_geo_clustered (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            cluster_name TEXT NOT NULL,  -- "Name (Region)" format
            water_type TEXT NOT NULL,
            source TEXT NOT NULL,
            geometry GEOMETRY(GEOMETRY, 4326),
            simplified_geometry GEOMETRY(GEOMETRY, 4326),
            lat NUMERIC,
            lon NUMERIC,
            area_km2 NUMERIC,
            length_km NUMERIC,
            depth_mean NUMERIC,
            depth_max NUMERIC,
            volume_m3 NUMERIC,
            ecological_status TEXT,
            segment_count INTEGER DEFAULT 1,
            region_code INTEGER, -- Internal clustering ID
            original_ids INTEGER[],
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)
        print("   ✅ Created geo_clustered table")
        
        # 2. Analyze problem scope
        print(f"\n📊 ANALYZING CLUSTERING SCOPE...")
        
        # Names with geographic spread > 100km (obvious multi-location names)
        cur.execute("""
        SELECT COUNT(*) as wide_spread_names
        FROM (
            SELECT name
            FROM smhi_water_bodies_optimized
            WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
            GROUP BY name 
            HAVING (MAX(lat) - MIN(lat)) > 1.0 OR (MAX(lon) - MIN(lon)) > 1.0
        ) t;
        """)
        wide_names = cur.fetchone()['wide_spread_names']
        
        # Single location names (no clustering needed)
        cur.execute("""
        SELECT COUNT(*) as single_location_names
        FROM (
            SELECT name
            FROM smhi_water_bodies_optimized
            WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
            GROUP BY name 
            HAVING (MAX(lat) - MIN(lat)) <= 1.0 AND (MAX(lon) - MIN(lon)) <= 1.0
        ) t;
        """)
        single_names = cur.fetchone()['single_location_names']
        
        print(f"   🗺️ Wide-spread names (need clustering): {wide_names:,}")
        print(f"   📍 Single-location names (no clustering): {single_names:,}")
        print(f"   🎯 Total processing needed: {wide_names + single_names:,}")
        
        # 3. Process single-location names first (FAST - no clustering)
        print(f"\n🚀 PROCESSING SINGLE-LOCATION NAMES...")
        
        single_start = time.time()
        cur.execute("""
        INSERT INTO smhi_water_bodies_geo_clustered 
        (name, cluster_name, water_type, source, geometry, simplified_geometry, 
         lat, lon, area_km2, length_km, depth_mean, depth_max, volume_m3, 
         ecological_status, segment_count, region_code, original_ids)
        
        SELECT 
            agg.name,
            agg.name as cluster_name,  -- No region suffix needed
            (array_agg(w.water_type ORDER BY w.water_type))[1] as water_type,
            (array_agg(w.source ORDER BY w.source))[1] as source,
            
            -- Combine geometries
            CASE 
                WHEN COUNT(*) = 1 THEN (array_agg(w.geometry))[1]
                ELSE ST_Collect(w.geometry)
            END as geometry,
            
            -- Combine simplified geometries  
            CASE 
                WHEN COUNT(*) = 1 THEN (array_agg(w.simplified_geometry))[1]
                ELSE ST_Collect(w.simplified_geometry)
            END as simplified_geometry,
            
            AVG(w.lat) as lat,
            AVG(w.lon) as lon,
            SUM(COALESCE(w.area_km2, 0)) as area_km2,
            SUM(COALESCE(w.length_km, 0)) as length_km,
            MAX(w.depth_mean) as depth_mean,
            MAX(w.depth_max) as depth_max,
            SUM(COALESCE(w.volume_m3, 0)) as volume_m3,
            (array_agg(w.ecological_status ORDER BY w.ecological_status NULLS LAST))[1] as ecological_status,
            COUNT(*) as segment_count,
            1 as region_code,  -- Single region
            array_agg(w.id ORDER BY w.id) as original_ids
            
        FROM smhi_water_bodies_optimized w
        INNER JOIN (
            SELECT name
            FROM smhi_water_bodies_optimized
            WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
            GROUP BY name 
            HAVING (MAX(lat) - MIN(lat)) <= 1.0 AND (MAX(lon) - MIN(lon)) <= 1.0
        ) agg ON w.name = agg.name
        
        WHERE w.name IS NOT NULL AND w.lat IS NOT NULL AND w.lon IS NOT NULL
        GROUP BY agg.name;
        """)
        
        single_inserted = cur.rowcount
        single_time = time.time() - single_start
        print(f"   ✅ Processed {single_inserted:,} single-location water bodies in {single_time:.1f}s")
        
        # 4. Process wide-spread names with clustering  
        print(f"\n🗺️ PROCESSING WIDE-SPREAD NAMES (CLUSTERING)...")
        
        if wide_names > 0:
            # Get wide-spread names to process
            cur.execute("""
            SELECT name, COUNT(*) as segment_count,
                   (MAX(lat) - MIN(lat)) as lat_spread,
                   (MAX(lon) - MIN(lon)) as lon_spread
            FROM smhi_water_bodies_optimized
            WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
            GROUP BY name 
            HAVING (MAX(lat) - MIN(lat)) > 1.0 OR (MAX(lon) - MIN(lon)) > 1.0
            ORDER BY COUNT(*) DESC;
            """)
            
            wide_spread_names = cur.fetchall()
            cluster_start = time.time()
            processed_wide = 0
            total_clusters_created = 0
            
            # Process in batches with progress
            batch_size = 100
            
            for i in range(0, len(wide_spread_names), batch_size):
                batch = wide_spread_names[i:i + batch_size]
                batch_start = time.time()
                
                for name_info in batch:
                    name = name_info['name']
                    
                    # Determine clustering distance based on name characteristics
                    if 'bäck' in name.lower():
                        cluster_distance_km = 30  # Streams - moderate clustering
                    elif 'å' in name.lower() or 'älv' in name.lower():
                        cluster_distance_km = 50  # Rivers - wider clustering  
                    elif 'sjö' in name.lower() or 'tjärn' in name.lower():
                        cluster_distance_km = 20  # Lakes - tight clustering
                    else:
                        cluster_distance_km = 35  # Default
                    
                    cluster_distance_degrees = cluster_distance_km / 111.32  # Rough conversion
                    
                    # Use SQL clustering with ST_ClusterDBSCAN
                    cur.execute("""
                    WITH clustered_segments AS (
                        SELECT *,
                               ST_ClusterDBSCAN(ST_Point(lon, lat), eps => %s, minpoints => 1) 
                               OVER () as cluster_id
                        FROM smhi_water_bodies_optimized
                        WHERE name = %s AND lat IS NOT NULL AND lon IS NOT NULL
                    ),
                    cluster_aggregates AS (
                        SELECT 
                            %s as name,
                            CASE 
                                WHEN COUNT(DISTINCT cluster_id) = 1 THEN %s
                                ELSE %s || ' (Område ' || (cluster_id + 1) || ')'
                            END as cluster_name,
                            cluster_id,
                            (array_agg(water_type ORDER BY water_type))[1] as water_type,
                            (array_agg(source ORDER BY source))[1] as source,
                            
                            CASE 
                                WHEN COUNT(*) = 1 THEN (array_agg(geometry))[1]
                                ELSE ST_Collect(geometry)
                            END as geometry,
                            
                            CASE 
                                WHEN COUNT(*) = 1 THEN (array_agg(simplified_geometry))[1]
                                ELSE ST_Collect(simplified_geometry)
                            END as simplified_geometry,
                            
                            AVG(lat) as lat,
                            AVG(lon) as lon,
                            SUM(COALESCE(area_km2, 0)) as area_km2,
                            SUM(COALESCE(length_km, 0)) as length_km,
                            MAX(depth_mean) as depth_mean,
                            MAX(depth_max) as depth_max,
                            SUM(COALESCE(volume_m3, 0)) as volume_m3,
                            (array_agg(ecological_status ORDER BY ecological_status NULLS LAST))[1] as ecological_status,
                            COUNT(*) as segment_count,
                            array_agg(id ORDER BY id) as original_ids
                            
                        FROM clustered_segments
                        GROUP BY cluster_id
                    )
                    INSERT INTO smhi_water_bodies_geo_clustered 
                    (name, cluster_name, water_type, source, geometry, simplified_geometry,
                     lat, lon, area_km2, length_km, depth_mean, depth_max, volume_m3,
                     ecological_status, segment_count, region_code, original_ids)
                    SELECT name, cluster_name, water_type, source, geometry, simplified_geometry,
                           lat, lon, area_km2, length_km, depth_mean, depth_max, volume_m3,
                           ecological_status, segment_count, cluster_id, original_ids
                    FROM cluster_aggregates;
                    """, (cluster_distance_degrees, name, name, name, name))
                    
                    clusters_added = cur.rowcount
                    total_clusters_created += clusters_added
                    processed_wide += 1
                
                # Progress update every batch
                batch_time = time.time() - batch_start
                elapsed = time.time() - cluster_start
                progress_pct = (i + len(batch)) / len(wide_spread_names) * 100
                
                print(f"   Progress: {processed_wide:,}/{len(wide_spread_names):,} names ({progress_pct:.1f}%) | {total_clusters_created:,} clusters | {batch_time:.1f}s/batch")
                
                # Commit periodically
                if i % (batch_size * 5) == 0:
                    conn.commit()
            
            cluster_time = time.time() - cluster_start
            print(f"   ✅ Clustered {processed_wide:,} wide-spread names into {total_clusters_created:,} clusters in {cluster_time:.1f}s")
        
        # 5. Create indexes
        print(f"\n📈 CREATING INDEXES...")
        index_start = time.time()
        
        indexes = [
            "CREATE INDEX idx_smhi_geo_clustered_lat_lon ON smhi_water_bodies_geo_clustered(lat, lon);",
            "CREATE INDEX idx_smhi_geo_clustered_name ON smhi_water_bodies_geo_clustered(name);",
            "CREATE INDEX idx_smhi_geo_clustered_cluster_name ON smhi_water_bodies_geo_clustered(cluster_name);",
            "CREATE INDEX idx_smhi_geo_clustered_geometry ON smhi_water_bodies_geo_clustered USING GIST(geometry);",
            "CREATE INDEX idx_smhi_geo_clustered_simplified ON smhi_water_bodies_geo_clustered USING GIST(simplified_geometry);"
        ]
        
        for idx_sql in indexes:
            cur.execute(idx_sql)
        
        index_time = time.time() - index_start
        print(f"   ✅ Created {len(indexes)} indexes in {index_time:.1f}s")
        
        # 6. Final statistics
        print(f"\n📊 FINAL RESULTS:")
        cur.execute("SELECT COUNT(*) as total FROM smhi_water_bodies_geo_clustered;")
        final_count = cur.fetchone()['total']
        
        cur.execute("""
        SELECT 
            COUNT(*) as total_clusters,
            COUNT(DISTINCT name) as unique_names,
            AVG(segment_count) as avg_segments,
            MAX(segment_count) as max_segments
        FROM smhi_water_bodies_geo_clustered;
        """)
        
        stats = cur.fetchone()
        
        total_time = time.time() - start_time
        
        print(f"   📊 Original SMHI records: 114,411")
        print(f"   🎯 Geographic clusters created: {final_count:,}")
        print(f"   📛 Unique water body names: {stats['unique_names']:,}")
        print(f"   📈 Avg segments per cluster: {float(stats['avg_segments']):.1f}")
        print(f"   🏆 Max segments in one cluster: {stats['max_segments']}")
        print(f"   ⏱️ Total processing time: {total_time:.1f}s ({total_time/60:.1f} minutes)")
        
        # 7. Show clustering examples
        print(f"\n🏆 CLUSTERING EXAMPLES:")
        cur.execute("""
        SELECT name, COUNT(*) as cluster_count, SUM(segment_count) as total_segments
        FROM smhi_water_bodies_geo_clustered
        GROUP BY name
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 10;
        """)
        
        examples = cur.fetchall()
        if examples:
            print("   Name               | Clusters | Total Segments")
            print("   -------------------|----------|---------------")
            for ex in examples:
                print(f"   {ex['name']:<18} | {ex['cluster_count']:>8} | {ex['total_segments']:>13}")
        else:
            print("   (No multi-cluster names found)")
        
        # 8. Commit all changes
        conn.commit()
        print(f"\n✅ FAST GEOGRAPHIC CLUSTERING COMPLETE!")
        print(f"   Table: smhi_water_bodies_geo_clustered")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    print("⚡ FAST Geographic Clustering")
    print("🎯 Clustering distances:")
    print("   • Bäckar (streams): 30 km")
    print("   • Åar/älvar (rivers): 50 km") 
    print("   • Sjöar (lakes): 20 km")
    print("   • Övriga: 35 km")
    print()
    
    response = input("🚀 Start fast clustering? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    fast_geographic_clustering()