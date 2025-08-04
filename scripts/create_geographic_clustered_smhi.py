#!/usr/bin/env python3
"""
Create geographically clustered SMHI water bodies
- Group by name FIRST
- Then cluster geographically within each name group
- Each cluster becomes separate water body
"""

import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import math
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

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in km"""
    if not all([lat1, lon1, lat2, lon2]):
        return float('inf')
    
    lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    lat_diff = lat1 - lat2
    lon_diff = lon1 - lon2
    return math.sqrt(lat_diff*lat_diff + lon_diff*lon_diff) * 111.32

def simple_geographic_clustering(segments, max_cluster_distance_km=50):
    """
    Simple geographic clustering using distance threshold
    Returns list of clusters, each cluster is a list of segment IDs
    """
    if not segments:
        return []
    
    clusters = []
    unprocessed = list(segments)
    
    while unprocessed:
        # Start new cluster with first unprocessed segment
        current_cluster = [unprocessed.pop(0)]
        cluster_changed = True
        
        # Keep adding segments that are close to any segment in current cluster
        while cluster_changed:
            cluster_changed = False
            remaining = []
            
            for segment in unprocessed:
                # Check if this segment is close to any segment in current cluster
                is_close = False
                for cluster_segment in current_cluster:
                    dist = calculate_distance(
                        segment['lat'], segment['lon'],
                        cluster_segment['lat'], cluster_segment['lon']
                    )
                    if dist <= max_cluster_distance_km:
                        is_close = True
                        break
                
                if is_close:
                    current_cluster.append(segment)
                    cluster_changed = True
                else:
                    remaining.append(segment)
            
            unprocessed = remaining
        
        clusters.append(current_cluster)
    
    return clusters

def create_geographic_clustered_smhi():
    """Create SMHI table with geographic clustering"""
    
    print("🗺️ CREATING GEOGRAPHICALLY CLUSTERED SMHI TABLE")
    print("=" * 70)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Drop existing table
        cur.execute("DROP TABLE IF EXISTS smhi_water_bodies_clustered;")
        
        # 2. Create new clustered table
        print("🏗️ CREATING CLUSTERED TABLE...")
        cur.execute("""
        CREATE TABLE smhi_water_bodies_clustered (
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
            sjo_id TEXT,
            vdr_id TEXT,
            segment_count INTEGER DEFAULT 1,
            cluster_id INTEGER, -- NEW: Which cluster within this name
            original_ids INTEGER[],
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)
        print("   ✅ Created smhi_water_bodies_clustered table")
        
        # 3. Get all unique names to process
        print("\n📊 ANALYZING NAMES TO CLUSTER...")
        cur.execute("""
        SELECT name, COUNT(*) as segment_count
        FROM smhi_water_bodies 
        WHERE name IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL
        GROUP BY name 
        ORDER BY COUNT(*) DESC;
        """)
        
        all_names = cur.fetchall()
        print(f"   Found {len(all_names)} unique names to process")
        
        # 4. Process each name group
        total_clusters = 0
        processed_names = 0
        
        for name_info in all_names:
            name = name_info['name']
            segment_count = name_info['segment_count']
            
            # Get all segments for this name
            cur.execute("""
            SELECT id, water_type, source, geometry, lat, lon, area_km2, length_km,
                   depth_mean, depth_max, volume_m3, ecological_status, sjo_id, vdr_id
            FROM smhi_water_bodies 
            WHERE name = %s AND lat IS NOT NULL AND lon IS NOT NULL
            ORDER BY COALESCE(area_km2, length_km, 0) DESC;
            """, (name,))
            
            segments = cur.fetchall()
            
            # Decide clustering threshold based on name pattern and segment count
            if segment_count == 1:
                # Single segment - no clustering needed
                max_distance = 0
            elif segment_count < 10:
                # Small groups - tight clustering (nearby segments only)
                max_distance = 20  # km
            elif 'bäck' in name.lower() or 'å' in name.lower():
                # Rivers/streams - medium clustering (connected waterways)
                max_distance = 50  # km
            elif segment_count > 100:
                # Heavily fragmented - very careful clustering
                max_distance = 30  # km
            else:
                # Default - moderate clustering
                max_distance = 40  # km
            
            # Perform clustering
            if segment_count == 1:
                clusters = [segments]  # Single cluster
            else:
                clusters = simple_geographic_clustering(segments, max_distance)
            
            # Insert each cluster as separate water body
            for cluster_idx, cluster in enumerate(clusters):
                if not cluster:
                    continue
                
                # Use largest segment as base
                base_segment = max(cluster, key=lambda s: s['area_km2'] or s['length_km'] or 0)
                
                # Aggregate data
                original_ids = [s['id'] for s in cluster]
                total_area = sum(float(s['area_km2'] or 0) for s in cluster)
                total_length = sum(float(s['length_km'] or 0) for s in cluster)
                total_volume = sum(float(s['volume_m3'] or 0) for s in cluster)
                max_depth_mean = max((float(s['depth_mean'] or 0) for s in cluster), default=0)
                max_depth_max = max((float(s['depth_max'] or 0) for s in cluster), default=0)
                
                # Calculate weighted center
                total_weight = sum(float(s['area_km2'] or s['length_km'] or 1) for s in cluster)
                center_lat = sum(float(s['lat']) * float(s['area_km2'] or s['length_km'] or 1) for s in cluster) / total_weight
                center_lon = sum(float(s['lon']) * float(s['area_km2'] or s['length_km'] or 1) for s in cluster) / total_weight
                
                # Create combined geometry using SQL
                geometry_ids = [s['id'] for s in cluster]
                if len(geometry_ids) == 1:
                    # Single geometry
                    cur.execute("SELECT geometry FROM smhi_water_bodies WHERE id = %s;", (geometry_ids[0],))
                    combined_geometry = cur.fetchone()['geometry']
                else:
                    # Collect geometries
                    cur.execute("""
                    SELECT ST_Collect(geometry) as combined_geometry
                    FROM smhi_water_bodies 
                    WHERE id = ANY(%s);
                    """, (geometry_ids,))
                    combined_geometry = cur.fetchone()['combined_geometry']
                
                # Insert clustered water body
                cur.execute("""
                INSERT INTO smhi_water_bodies_clustered 
                (name, water_type, source, geometry, lat, lon, area_km2, length_km, 
                 depth_mean, depth_max, volume_m3, ecological_status, sjo_id, vdr_id,
                 segment_count, cluster_id, original_ids)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    name,
                    base_segment['water_type'],
                    base_segment['source'],
                    combined_geometry,
                    center_lat,
                    center_lon,
                    total_area if total_area > 0 else None,
                    total_length if total_length > 0 else None,
                    max_depth_mean if max_depth_mean > 0 else None,
                    max_depth_max if max_depth_max > 0 else None,
                    total_volume if total_volume > 0 else None,
                    base_segment['ecological_status'],
                    base_segment['sjo_id'],
                    base_segment['vdr_id'],
                    len(cluster),
                    cluster_idx + 1,
                    original_ids
                ))
            
            total_clusters += len(clusters)
            processed_names += 1
            
            # Progress update
            if processed_names % 1000 == 0:
                print(f"   Progress: {processed_names:,}/{len(all_names):,} names, {total_clusters:,} clusters created")
        
        # 5. Create indexes
        print(f"\n📈 CREATING INDEXES...")
        indexes = [
            "CREATE INDEX idx_smhi_clustered_lat_lon ON smhi_water_bodies_clustered(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;",
            "CREATE INDEX idx_smhi_clustered_name ON smhi_water_bodies_clustered(name);",
            "CREATE INDEX idx_smhi_clustered_water_type ON smhi_water_bodies_clustered(water_type);",
            "CREATE INDEX idx_smhi_clustered_geometry ON smhi_water_bodies_clustered USING GIST(geometry);"
        ]
        
        for idx_sql in indexes:
            cur.execute(idx_sql)
        print(f"   ✅ Created {len(indexes)} indexes")
        
        # 6. Final statistics
        print(f"\n📊 FINAL STATISTICS:")
        cur.execute("SELECT COUNT(*) as total FROM smhi_water_bodies_clustered;")
        final_count = cur.fetchone()['total']
        
        cur.execute("""
        SELECT 
            COUNT(*) as total,
            AVG(segment_count) as avg_segments,
            MAX(segment_count) as max_segments,
            COUNT(CASE WHEN segment_count > 1 THEN 1 END) as multi_segment
        FROM smhi_water_bodies_clustered;
        """)
        
        stats = cur.fetchone()
        
        print(f"   📊 Original records: 114,411")
        print(f"   🎯 Clustered records: {final_count:,}")
        print(f"   📈 Avg segments per cluster: {float(stats['avg_segments']):.1f}")
        print(f"   🏆 Max segments in one cluster: {stats['max_segments']}")
        print(f"   🔗 Multi-segment clusters: {stats['multi_segment']:,}")
        print(f"   🗺️ Geographic clusters from {len(all_names):,} names: {total_clusters:,}")
        
        # 7. Show examples of clustering results
        print(f"\n🏆 CLUSTERING EXAMPLES:")
        cur.execute("""
        SELECT name, COUNT(*) as cluster_count, SUM(segment_count) as total_segments
        FROM smhi_water_bodies_clustered
        GROUP BY name
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 10;
        """)
        
        examples = cur.fetchall()
        print("   Name               | Clusters | Total Segments")
        print("   -------------------|----------|---------------")
        for ex in examples:
            print(f"   {ex['name']:<18} | {ex['cluster_count']:>8} | {ex['total_segments']:>13}")
        
        # 8. Commit
        conn.commit()
        print(f"\n✅ GEOGRAPHIC CLUSTERING COMPLETE!")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print(f"\n🎉 READY FOR TESTING!")

if __name__ == "__main__":
    response = input("🗺️ This will create geographically clustered SMHI table. Continue? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    create_geographic_clustered_smhi()