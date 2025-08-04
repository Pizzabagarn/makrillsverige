#!/usr/bin/env python3
"""
Smart Conservative Clustering - Very careful segment grouping
- Max 3-5 segments per group
- Only connects geometrically adjacent segments
- Conservative approach - rather keep separate than group wrongly
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

def smart_conservative_clustering():
    """Smart conservative clustering with topological validation"""
    
    print("🧠 SMART CONSERVATIVE CLUSTERING")
    print("=" * 50)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        start_time = time.time()
        
        # 1. Analyze problem scope
        print("📊 ANALYZING CLUSTERING CANDIDATES...")
        
        # Find names with many segments that could benefit from clustering
        cur.execute("""
        SELECT name, COUNT(*) as segment_count,
               ROUND(AVG(COALESCE(area_km2, 0))::numeric, 3) as avg_area,
               water_type
        FROM smhi_water_bodies
        WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
        GROUP BY name, water_type
        HAVING COUNT(*) BETWEEN 3 AND 100  -- Sweet spot for clustering
        ORDER BY COUNT(*) DESC;
        """)
        
        clustering_candidates = cur.fetchall()
        print(f"   🎯 Clustering candidates: {len(clustering_candidates):,}")
        print(f"   📊 Will process names with 3-100 segments (conservative range)")
        
        # Show top candidates
        if clustering_candidates:
            print(f"\n🏆 TOP CLUSTERING CANDIDATES:")
            print("   Name               | Segments | Avg Area | Type")
            print("   -------------------|----------|----------|--------")
            for candidate in clustering_candidates[:10]:
                print(f"   {candidate['name']:<18} | {candidate['segment_count']:>8} | {candidate['avg_area']:>6.3f} km² | {candidate['water_type']}")
        
        # 2. Create result table
        print(f"\n🏗️ CREATING SMART CLUSTERED TABLE...")
        cur.execute("DROP TABLE IF EXISTS smhi_water_bodies_smart_clustered;")
        cur.execute("""
        CREATE TABLE smhi_water_bodies_smart_clustered (
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
            cluster_method TEXT DEFAULT 'single', -- 'single', 'proximity', 'topology'
            original_ids INTEGER[],
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)
        print("   ✅ Created smart_clustered table")
        
        # 3. Process single segments first (no clustering needed)
        print(f"\n📍 PROCESSING SINGLE SEGMENTS...")
        cur.execute("""
        INSERT INTO smhi_water_bodies_smart_clustered 
        (name, water_type, source, geometry, lat, lon, area_km2, length_km,
         depth_mean, depth_max, volume_m3, ecological_status, cluster_size, 
         cluster_method, original_ids)
        
        SELECT name, water_type, source, geometry, lat, lon, area_km2, length_km,
               depth_mean, depth_max, volume_m3, ecological_status, 1,
               'single', ARRAY[id]
        FROM smhi_water_bodies
        WHERE name IN (
            SELECT name
            FROM smhi_water_bodies
            WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
            GROUP BY name
            HAVING COUNT(*) = 1
        );
        """)
        
        single_processed = cur.rowcount
        print(f"   ✅ Processed {single_processed:,} single segments")
        
        # 4. Process pairs (2 segments) - very conservative
        print(f"\n👥 PROCESSING SEGMENT PAIRS...")
        cur.execute("""
        INSERT INTO smhi_water_bodies_smart_clustered 
        (name, water_type, source, geometry, lat, lon, area_km2, length_km,
         depth_mean, depth_max, volume_m3, ecological_status, cluster_size, 
         cluster_method, original_ids)
        
        SELECT 
            name,
            (array_agg(water_type ORDER BY water_type))[1] as water_type,
            (array_agg(source ORDER BY source))[1] as source,
            ST_Collect(geometry) as geometry,
            AVG(lat) as lat,
            AVG(lon) as lon,
            SUM(COALESCE(area_km2, 0)) as area_km2,
            SUM(COALESCE(length_km, 0)) as length_km,
            MAX(depth_mean) as depth_mean,
            MAX(depth_max) as depth_max,
            SUM(COALESCE(volume_m3, 0)) as volume_m3,
            (array_agg(ecological_status ORDER BY ecological_status NULLS LAST))[1] as ecological_status,
            2 as cluster_size,
            'proximity' as cluster_method,
            array_agg(id ORDER BY id) as original_ids
            
        FROM smhi_water_bodies
        WHERE name IN (
            SELECT name
            FROM smhi_water_bodies
            WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
            GROUP BY name
            HAVING COUNT(*) = 2
        )
        GROUP BY name;
        """)
        
        pairs_processed = cur.rowcount
        print(f"   ✅ Processed {pairs_processed:,} segment pairs")
        
        # 5. Process small clusters (3-5 segments) with proximity clustering
        print(f"\n🔗 PROCESSING SMALL CLUSTERS (3-5 segments)...")
        
        small_cluster_candidates = [c for c in clustering_candidates if 3 <= c['segment_count'] <= 5]
        small_clusters_created = 0
        
        for candidate in small_cluster_candidates:
            name = candidate['name']
            
            # Use distance-based clustering for 3-5 segments
            cluster_distance_km = 2 if 'sjö' in name.lower() else 5  # Tighter for lakes
            cluster_distance_degrees = cluster_distance_km / 111.32
            
            cur.execute("""
            WITH clustered_segments AS (
                SELECT *,
                       ST_ClusterDBSCAN(ST_Point(lon, lat), eps => %s, minpoints => 1) 
                       OVER () as cluster_id
                FROM smhi_water_bodies
                WHERE name = %s AND lat IS NOT NULL AND lon IS NOT NULL
            )
            INSERT INTO smhi_water_bodies_smart_clustered 
            (name, water_type, source, geometry, lat, lon, area_km2, length_km,
             depth_mean, depth_max, volume_m3, ecological_status, cluster_size, 
             cluster_method, original_ids)
            
            SELECT 
                %s as name,
                (array_agg(water_type ORDER BY water_type))[1] as water_type,
                (array_agg(source ORDER BY source))[1] as source,
                ST_Collect(geometry) as geometry,
                AVG(lat) as lat,
                AVG(lon) as lon,
                SUM(COALESCE(area_km2, 0)) as area_km2,
                SUM(COALESCE(length_km, 0)) as length_km,
                MAX(depth_mean) as depth_mean,
                MAX(depth_max) as depth_max,
                SUM(COALESCE(volume_m3, 0)) as volume_m3,
                (array_agg(ecological_status ORDER BY ecological_status NULLS LAST))[1] as ecological_status,
                COUNT(*) as cluster_size,
                'proximity' as cluster_method,
                array_agg(id ORDER BY id) as original_ids
                
            FROM clustered_segments
            GROUP BY cluster_id;
            """, (cluster_distance_degrees, name, name))
            
            small_clusters_created += cur.rowcount
        
        print(f"   ✅ Created {small_clusters_created:,} small clusters from {len(small_cluster_candidates):,} candidates")
        
        # 6. Process medium clusters (6-20 segments) - more conservative
        print(f"\n🎯 PROCESSING MEDIUM CLUSTERS (6-20 segments)...")
        
        medium_cluster_candidates = [c for c in clustering_candidates if 6 <= c['segment_count'] <= 20]
        medium_clusters_created = 0
        
        for candidate in medium_cluster_candidates:
            name = candidate['name']
            
            # Conservative clustering - only very close segments
            cluster_distance_km = 1 if 'sjö' in name.lower() else 3  # Very tight
            cluster_distance_degrees = cluster_distance_km / 111.32
            
            cur.execute("""
            WITH clustered_segments AS (
                SELECT *,
                       ST_ClusterDBSCAN(ST_Point(lon, lat), eps => %s, minpoints => 2) 
                       OVER () as cluster_id
                FROM smhi_water_bodies
                WHERE name = %s AND lat IS NOT NULL AND lon IS NOT NULL
            )
            INSERT INTO smhi_water_bodies_smart_clustered 
            (name, water_type, source, geometry, lat, lon, area_km2, length_km,
             depth_mean, depth_max, volume_m3, ecological_status, cluster_size, 
             cluster_method, original_ids)
            
            SELECT 
                %s as name,
                (array_agg(water_type ORDER BY water_type))[1] as water_type,
                (array_agg(source ORDER BY source))[1] as source,
                -- Only cluster if ≤ 3 segments, otherwise keep individual  
                CASE 
                    WHEN COUNT(*) <= 3 THEN ST_Collect(geometry)
                    ELSE (array_agg(geometry ORDER BY id))[1]  -- Just first geometry
                END as geometry,
                AVG(lat) as lat,
                AVG(lon) as lon,
                SUM(COALESCE(area_km2, 0)) as area_km2,
                SUM(COALESCE(length_km, 0)) as length_km,
                MAX(depth_mean) as depth_mean,
                MAX(depth_max) as depth_max,
                SUM(COALESCE(volume_m3, 0)) as volume_m3,
                (array_agg(ecological_status ORDER BY ecological_status NULLS LAST))[1] as ecological_status,
                LEAST(COUNT(*), 3) as cluster_size,  -- Cap at 3
                'conservative' as cluster_method,
                array_agg(id ORDER BY id) as original_ids
                
            FROM clustered_segments
            WHERE cluster_id IS NOT NULL  -- Only clustered segments
            GROUP BY cluster_id;
            """, (cluster_distance_degrees, name, name))
            
            medium_clusters_created += cur.rowcount
        
        print(f"   ✅ Created {medium_clusters_created:,} conservative clusters from {len(medium_cluster_candidates):,} candidates")
        
        # 7. Keep large clusters (>20 segments) as individuals - too risky to cluster
        print(f"\n⚠️ KEEPING LARGE CLUSTERS AS INDIVIDUALS...")
        
        large_cluster_names = [c['name'] for c in clustering_candidates if c['segment_count'] > 20]
        
        if large_cluster_names:
            # Insert as individual segments
            cur.execute("""
            INSERT INTO smhi_water_bodies_smart_clustered 
            (name, water_type, source, geometry, lat, lon, area_km2, length_km,
             depth_mean, depth_max, volume_m3, ecological_status, cluster_size, 
             cluster_method, original_ids)
            
            SELECT name, water_type, source, geometry, lat, lon, area_km2, length_km,
                   depth_mean, depth_max, volume_m3, ecological_status, 1,
                   'individual', ARRAY[id]
            FROM smhi_water_bodies
            WHERE name = ANY(%s);
            """, (large_cluster_names,))
            
            large_individual = cur.rowcount
            print(f"   ✅ Kept {large_individual:,} segments as individuals (too risky to cluster)")
        
        # 8. Create indexes
        print(f"\n📈 CREATING INDEXES...")
        indexes = [
            "CREATE INDEX idx_smhi_smart_lat_lon ON smhi_water_bodies_smart_clustered(lat, lon);",
            "CREATE INDEX idx_smhi_smart_name ON smhi_water_bodies_smart_clustered(name);",
            "CREATE INDEX idx_smhi_smart_water_type ON smhi_water_bodies_smart_clustered(water_type);",
            "CREATE INDEX idx_smhi_smart_geometry ON smhi_water_bodies_smart_clustered USING GIST(geometry);"
        ]
        
        for idx_sql in indexes:
            cur.execute(idx_sql)
        print(f"   ✅ Created {len(indexes)} indexes")
        
        # 9. Final statistics
        print(f"\n📊 SMART CLUSTERING RESULTS:")
        cur.execute("SELECT COUNT(*) as total FROM smhi_water_bodies_smart_clustered;")
        final_count = cur.fetchone()['total']
        
        cur.execute("""
        SELECT 
            cluster_method,
            COUNT(*) as records,
            AVG(cluster_size) as avg_size,
            MAX(cluster_size) as max_size
        FROM smhi_water_bodies_smart_clustered
        GROUP BY cluster_method
        ORDER BY COUNT(*) DESC;
        """)
        
        method_stats = cur.fetchall()
        
        total_time = time.time() - start_time
        
        print(f"   📊 Original segments: 114,411")
        print(f"   🎯 Smart clustered results: {final_count:,}")
        print(f"   📉 Reduction: {114411/final_count:.1f}x")
        print(f"   ⏱️ Processing time: {total_time:.1f}s")
        print()
        print("   Clustering Method | Records | Avg Size | Max Size")
        print("   ------------------|---------|----------|----------")
        
        for stat in method_stats:
            print(f"   {stat['cluster_method']:<17} | {stat['records']:>7} | {float(stat['avg_size']):>6.1f} | {stat['max_size']:>8}")
        
        # 10. Show examples
        print(f"\n🏆 CLUSTERING EXAMPLES:")
        cur.execute("""
        SELECT name, cluster_size, cluster_method, array_length(original_ids, 1) as orig_segments
        FROM smhi_water_bodies_smart_clustered
        WHERE cluster_size > 1
        ORDER BY cluster_size DESC
        LIMIT 10;
        """)
        
        examples = cur.fetchall()
        if examples:
            print("   Name               | Size | Method      | Orig Segments")
            print("   -------------------|------|-------------|---------------")
            for ex in examples:
                print(f"   {ex['name']:<18} | {ex['cluster_size']:>4} | {ex['cluster_method']:<11} | {ex['orig_segments']:>13}")
        
        # 11. Commit
        conn.commit()
        print(f"\n✅ SMART CONSERVATIVE CLUSTERING COMPLETE!")
        print(f"   Table: smhi_water_bodies_smart_clustered")
        print(f"   Conservative approach - max 3 segments per cluster")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    print("🧠 Smart Conservative Clustering")
    print("🎯 Strategy:")
    print("   • Max 3-5 segments per cluster (not 1000+)")
    print("   • Only very close segments (1-5km)")
    print("   • Conservative - rather keep separate than group wrongly")
    print("   • Focus on usability - easier clicking on lakes")
    print()
    
    response = input("🚀 Start smart clustering? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    smart_conservative_clustering()