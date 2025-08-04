#!/usr/bin/env python3
"""
Step 2: Combine SMHI segments into GeometryCollections
- Group segments by name
- Combine geometries into GeometryCollection
- Keep main attributes from largest segment
- Create optimized table
"""

import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import sys
import json

def get_db_config():
    load_dotenv('.env.local')
    return {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_DATABASE'), 
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': int(os.getenv('DB_PORT', 5432))
    }

def combine_smhi_segments():
    """Combine multiple segments into single GeometryCollection per water body"""
    
    print("🔗 COMBINING SMHI SEGMENTS INTO GEOMETRYCOLLECTIONS")
    print("=" * 70)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Create backup table first
        print("💾 CREATING BACKUP TABLE...")
        cur.execute("DROP TABLE IF EXISTS smhi_water_bodies_backup;")
        cur.execute("""
        CREATE TABLE smhi_water_bodies_backup AS 
        SELECT * FROM smhi_water_bodies;
        """)
        backup_count = cur.rowcount
        print(f"   ✅ Backed up {backup_count:,} records to smhi_water_bodies_backup")
        
        # 2. Create new optimized table structure
        print(f"\n🏗️ CREATING OPTIMIZED TABLE...")
        cur.execute("DROP TABLE IF EXISTS smhi_water_bodies_combined;")
        cur.execute("""
        CREATE TABLE smhi_water_bodies_combined (
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
            original_ids INTEGER[],
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """)
        print("   ✅ Created smhi_water_bodies_combined table")
        
        # 3. Get list of names with multiple segments (process in batches)
        print(f"\n📊 ANALYZING SEGMENTS TO COMBINE...")
        cur.execute("""
        SELECT name, COUNT(*) as segment_count
        FROM smhi_water_bodies 
        WHERE name IS NOT NULL
        GROUP BY name 
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC;
        """)
        
        multi_segment_names = cur.fetchall()
        single_segment_count = 0
        
        cur.execute("""
        SELECT COUNT(*) as count
        FROM smhi_water_bodies 
        WHERE name IS NOT NULL
        GROUP BY name 
        HAVING COUNT(*) = 1;
        """)
        single_segment_result = cur.fetchone()
        if single_segment_result:
            single_segment_count = single_segment_result['count']
        
        print(f"   🔄 Multi-segment names: {len(multi_segment_names):,}")
        print(f"   📍 Single-segment names: {single_segment_count:,}")
        print(f"   📈 Total segments to process: {sum(row['segment_count'] for row in multi_segment_names):,}")
        
        # 4. Process multi-segment water bodies
        print(f"\n🔗 COMBINING SEGMENTS...")
        processed = 0
        
        for i, name_info in enumerate(multi_segment_names):
            name = name_info['name']
            segment_count = name_info['segment_count']
            
            # Get all segments for this name
            cur.execute("""
            SELECT id, water_type, source, geometry, lat, lon, area_km2, length_km,
                   depth_mean, depth_max, volume_m3, ecological_status, sjo_id, vdr_id
            FROM smhi_water_bodies 
            WHERE name = %s
            ORDER BY COALESCE(area_km2, 0) DESC, id ASC;
            """, (name,))
            
            segments = cur.fetchall()
            if not segments:
                continue
            
            # Use first (largest) segment as base
            base_segment = segments[0]
            
            # Collect all geometries and aggregate data
            geometries = []
            original_ids = []
            total_area = 0
            total_length = 0
            total_volume = 0
            max_depth_mean = 0
            max_depth_max = 0
            
            for segment in segments:
                if segment['geometry']:
                    geometries.append(segment['geometry'])
                original_ids.append(segment['id'])
                if segment['area_km2']:
                    total_area += segment['area_km2']
                if segment['length_km']:
                    total_length += segment['length_km']
                if segment['volume_m3']:
                    total_volume += segment['volume_m3']
                if segment['depth_mean'] and segment['depth_mean'] > max_depth_mean:
                    max_depth_mean = segment['depth_mean']
                if segment['depth_max'] and segment['depth_max'] > max_depth_max:
                    max_depth_max = segment['depth_max']
            
            if not geometries:
                continue
            
            # Create GeometryCollection or use single geometry
            if len(geometries) == 1:
                combined_geometry = geometries[0]
            else:
                # Create GeometryCollection - convert geometries to GeoJSON format for PostgreSQL
                geom_collection = {
                    "type": "GeometryCollection",
                    "geometries": []
                }
                
                # Extract each geometry as GeoJSON
                for geom in geometries:
                    cur.execute("SELECT ST_AsGeoJSON(%s) as geojson;", (geom,))
                    geojson_result = cur.fetchone()
                    if geojson_result and geojson_result['geojson']:
                        geom_dict = json.loads(geojson_result['geojson'])
                        geom_collection["geometries"].append(geom_dict)
                
                # Convert back to PostGIS geometry
                combined_geometry = json.dumps(geom_collection)
            
            # Calculate combined centroid
            if len(segments) > 1:
                # Average of centroids weighted by area
                total_weight = sum(s['area_km2'] or 1 for s in segments)
                avg_lat = sum((s['lat'] or 0) * (s['area_km2'] or 1) for s in segments) / total_weight
                avg_lon = sum((s['lon'] or 0) * (s['area_km2'] or 1) for s in segments) / total_weight
            else:
                avg_lat = base_segment['lat']
                avg_lon = base_segment['lon']
            
            # Insert combined record
            if isinstance(combined_geometry, str):
                # GeometryCollection as JSON
                cur.execute("""
                INSERT INTO smhi_water_bodies_combined 
                (name, water_type, source, geometry, lat, lon, area_km2, length_km, 
                 depth_mean, depth_max, volume_m3, ecological_status, sjo_id, vdr_id,
                 segment_count, original_ids)
                VALUES (%s, %s, %s, ST_GeomFromGeoJSON(%s), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    name,
                    base_segment['water_type'],
                    base_segment['source'],
                    combined_geometry,
                    avg_lat,
                    avg_lon,
                    total_area if total_area > 0 else None,
                    total_length if total_length > 0 else None,
                    max_depth_mean if max_depth_mean > 0 else None,
                    max_depth_max if max_depth_max > 0 else None,
                    total_volume if total_volume > 0 else None,
                    base_segment['ecological_status'],
                    base_segment['sjo_id'],
                    base_segment['vdr_id'],
                    segment_count,
                    original_ids
                ))
            else:
                # Single geometry
                cur.execute("""
                INSERT INTO smhi_water_bodies_combined 
                (name, water_type, source, geometry, lat, lon, area_km2, length_km, 
                 depth_mean, depth_max, volume_m3, ecological_status, sjo_id, vdr_id,
                 segment_count, original_ids)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    name,
                    base_segment['water_type'],
                    base_segment['source'],
                    combined_geometry,
                    avg_lat,
                    avg_lon,
                    total_area if total_area > 0 else None,
                    total_length if total_length > 0 else None,
                    max_depth_mean if max_depth_mean > 0 else None,
                    max_depth_max if max_depth_max > 0 else None,
                    total_volume if total_volume > 0 else None,
                    base_segment['ecological_status'],
                    base_segment['sjo_id'],
                    base_segment['vdr_id'],
                    segment_count,
                    original_ids
                ))
            
            processed += 1
            
            if processed % 100 == 0:
                print(f"   Progress: {processed:,}/{len(multi_segment_names):,} ({processed/len(multi_segment_names)*100:.1f}%)")
        
        # 5. Add single-segment water bodies
        print(f"\n📍 ADDING SINGLE-SEGMENT WATER BODIES...")
        cur.execute("""
        INSERT INTO smhi_water_bodies_combined 
        (name, water_type, source, geometry, lat, lon, area_km2, length_km, 
         depth_mean, depth_max, volume_m3, ecological_status, sjo_id, vdr_id,
         segment_count, original_ids)
        SELECT name, water_type, source, geometry, lat, lon, area_km2, length_km,
               depth_mean, depth_max, volume_m3, ecological_status, sjo_id, vdr_id,
               1, ARRAY[id]
        FROM smhi_water_bodies
        WHERE name IN (
            SELECT name
            FROM smhi_water_bodies 
            WHERE name IS NOT NULL
            GROUP BY name 
            HAVING COUNT(*) = 1
        );
        """)
        single_added = cur.rowcount
        print(f"   ✅ Added {single_added:,} single-segment water bodies")
        
        # 6. Create indexes on new table
        print(f"\n📈 CREATING INDEXES...")
        indexes = [
            "CREATE INDEX idx_smhi_combined_lat_lon ON smhi_water_bodies_combined(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL;",
            "CREATE INDEX idx_smhi_combined_name ON smhi_water_bodies_combined(name);",
            "CREATE INDEX idx_smhi_combined_water_type ON smhi_water_bodies_combined(water_type);",
            "CREATE INDEX idx_smhi_combined_geometry ON smhi_water_bodies_combined USING GIST(geometry);"
        ]
        
        for idx_sql in indexes:
            cur.execute(idx_sql)
        print(f"   ✅ Created {len(indexes)} indexes")
        
        # 7. Final statistics
        print(f"\n📊 FINAL STATISTICS:")
        cur.execute("SELECT COUNT(*) as count FROM smhi_water_bodies_combined;")
        final_count = cur.fetchone()['count']
        
        cur.execute("""
        SELECT AVG(segment_count) as avg_segments,
               MAX(segment_count) as max_segments,
               COUNT(CASE WHEN segment_count > 1 THEN 1 END) as multi_segment_count
        FROM smhi_water_bodies_combined;
        """)
        stats = cur.fetchone()
        
        print(f"   📊 Original records: {backup_count:,}")
        print(f"   🎯 Combined records: {final_count:,}")
        print(f"   📉 Reduction factor: {backup_count/final_count:.1f}x")
        print(f"   📈 Avg segments per water body: {stats['avg_segments']:.1f}")
        print(f"   🏆 Max segments in one water body: {stats['max_segments']}")
        print(f"   🔗 Multi-segment water bodies: {stats['multi_segment_count']:,}")
        
        # 8. Commit all changes
        conn.commit()
        print(f"\n✅ SEGMENT COMBINATION COMPLETE!")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error during segment combination: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print(f"\n🎉 SMHI OPTIMIZATION COMPLETE!")
    print(f"   Ready to create unified service!")

if __name__ == "__main__":
    response = input("⚠️ This will create a new combined table. Continue? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        print("Operation cancelled")
        sys.exit(0)
    
    combine_smhi_segments()