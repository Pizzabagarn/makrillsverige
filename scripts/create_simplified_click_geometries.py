#!/usr/bin/env python3
"""
Create simplified geometries for click detection
Add simplified_geometry column for better click precision
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

def create_simplified_click_geometries():
    """Add simplified geometries for better click detection"""
    
    print("🖱️ CREATING SIMPLIFIED CLICK GEOMETRIES")
    print("=" * 50)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Add simplified_geometry column if not exists
        print("🔧 ADDING SIMPLIFIED_GEOMETRY COLUMN...")
        cur.execute("""
        ALTER TABLE smhi_water_bodies_optimized 
        ADD COLUMN IF NOT EXISTS simplified_geometry GEOMETRY(GEOMETRY, 4326);
        """)
        print("   ✅ Added simplified_geometry column")
        
        # 2. Create simplified geometries with different strategies based on complexity
        print("\n🎯 CREATING SIMPLIFIED GEOMETRIES...")
        
        # Strategy 1: Simple geometries - use as-is
        cur.execute("""
        UPDATE smhi_water_bodies_optimized 
        SET simplified_geometry = geometry
        WHERE ST_NPoints(geometry) <= 100;
        """)
        simple_updated = cur.rowcount
        print(f"   ✅ Simple geometries (≤100 points): {simple_updated:,}")
        
        # Strategy 2: Medium complexity - simplify
        cur.execute("""
        UPDATE smhi_water_bodies_optimized 
        SET simplified_geometry = ST_Simplify(geometry, 0.001)
        WHERE ST_NPoints(geometry) > 100 AND ST_NPoints(geometry) <= 1000
          AND simplified_geometry IS NULL;
        """)
        medium_updated = cur.rowcount
        print(f"   ✅ Medium complexity (100-1000 points): {medium_updated:,} simplified")
        
        # Strategy 3: High complexity - aggressive simplify  
        cur.execute("""
        UPDATE smhi_water_bodies_optimized 
        SET simplified_geometry = ST_Simplify(geometry, 0.005)
        WHERE ST_NPoints(geometry) > 1000 AND ST_NPoints(geometry) <= 5000
          AND simplified_geometry IS NULL;
        """)
        high_updated = cur.rowcount
        print(f"   ✅ High complexity (1000-5000 points): {high_updated:,} simplified")
        
        # Strategy 4: Extreme complexity - use convex hull or envelope
        cur.execute("""
        UPDATE smhi_water_bodies_optimized 
        SET simplified_geometry = ST_ConvexHull(geometry)
        WHERE ST_NPoints(geometry) > 5000
          AND simplified_geometry IS NULL;
        """)
        extreme_updated = cur.rowcount
        print(f"   ✅ Extreme complexity (>5000 points): {extreme_updated:,} as convex hull")
        
        # 3. Create spatial index on simplified geometries
        print(f"\n📈 CREATING SPATIAL INDEX...")
        cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_smhi_opt_simplified_geometry 
        ON smhi_water_bodies_optimized USING GIST(simplified_geometry);
        """)
        print("   ✅ Created spatial index on simplified_geometry")
        
        # 4. Verify results
        print(f"\n📊 SIMPLIFICATION RESULTS:")
        cur.execute("""
        SELECT 
            CASE 
                WHEN ST_NPoints(geometry) <= 100 THEN '≤100 points'
                WHEN ST_NPoints(geometry) <= 1000 THEN '100-1000 points'
                WHEN ST_NPoints(geometry) <= 5000 THEN '1000-5000 points'
                ELSE '>5000 points'
            END as complexity_category,
            COUNT(*) as count,
            AVG(ST_NPoints(geometry)) as avg_original_points,
            AVG(ST_NPoints(simplified_geometry)) as avg_simplified_points,
            AVG(ST_NPoints(simplified_geometry)) * 100.0 / AVG(ST_NPoints(geometry)) as reduction_percentage
        FROM smhi_water_bodies_optimized
        WHERE geometry IS NOT NULL AND simplified_geometry IS NOT NULL
        GROUP BY 
            CASE 
                WHEN ST_NPoints(geometry) <= 100 THEN '≤100 points'
                WHEN ST_NPoints(geometry) <= 1000 THEN '100-1000 points'
                WHEN ST_NPoints(geometry) <= 5000 THEN '1000-5000 points'
                ELSE '>5000 points'
            END
        ORDER BY AVG(ST_NPoints(geometry));
        """)
        
        results = cur.fetchall()
        print("   Category        | Count | Orig Points | Simp Points | Reduction")
        print("   ----------------|-------|-------------|-------------|----------")
        
        for result in results:
            reduction = float(result['reduction_percentage']) if result['reduction_percentage'] else 100
            print(f"   {result['complexity_category']:<15} | {result['count']:>5} | {float(result['avg_original_points']):>9.0f} | {float(result['avg_simplified_points']):>9.0f} | {reduction:>6.1f}%")
        
        # 5. Test specific problematic cases
        print(f"\n🎯 TESTING PROBLEMATIC CASES:")
        cur.execute("""
        SELECT name, segment_count,
               ST_NPoints(geometry) as orig_points,
               ST_NPoints(simplified_geometry) as simp_points,
               ST_NPoints(simplified_geometry) * 100.0 / ST_NPoints(geometry) as reduction_pct
        FROM smhi_water_bodies_optimized
        WHERE segment_count > 200
        ORDER BY ST_NPoints(geometry) DESC
        LIMIT 5;
        """)
        
        problematic = cur.fetchall()
        print("   Name               | Segments | Orig Points | Simp Points | Reduction")
        print("   -------------------|----------|-------------|-------------|----------")
        
        for prob in problematic:
            reduction = float(prob['reduction_pct']) if prob['reduction_pct'] else 100
            print(f"   {prob['name']:<18} | {prob['segment_count']:>8} | {prob['orig_points']:>9} | {prob['simp_points']:>9} | {reduction:>6.1f}%")
        
        # 6. Commit changes
        conn.commit()
        print(f"\n✅ SIMPLIFIED CLICK GEOMETRIES CREATED!")
        print(f"   Now update service to use simplified_geometry for click detection")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    create_simplified_click_geometries()