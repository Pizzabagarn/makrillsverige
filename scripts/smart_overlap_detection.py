#!/usr/bin/env python3
"""
Smart Overlap Detection for SMHI vs OSM Lake Integration
Identifies which OSM lakes should be replaced by SMHI vs kept as unique lakes
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

def analyze_overlap_strategy():
    """Analyze and recommend smart overlap detection strategy"""
    
    print("🎯 SMART ÖVERLAPP-STRATEGI ANALYS")
    print("=" * 50)
    
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Test different overlap strategies
        strategies = {
            "namn_exakt": {
                "description": "Exakt namn-matchning (farlig - många false positives)",
                "sql": """
                SELECT COUNT(*) as duplicates
                FROM water_bodies o
                WHERE o.water_type = 'lake' 
                  AND o.name IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM smhi_water_bodies_lake_unified s
                      WHERE s.water_type = 'lake' 
                        AND LOWER(TRIM(s.name)) = LOWER(TRIM(o.name))
                  )
                """
            },
            
            "namn_och_narhet_5km": {
                "description": "Samma namn + <5km avstånd (rekommenderad)",
                "sql": """
                WITH osm_lakes AS (
                    SELECT id, name, lat, lon, area_km2,
                           LOWER(TRIM(name)) as clean_name
                    FROM water_bodies
                    WHERE water_type = 'lake' AND name IS NOT NULL
                      AND lat IS NOT NULL AND lon IS NOT NULL
                ),
                smhi_lakes AS (
                    SELECT id, name, lat, lon, area_km2,
                           LOWER(TRIM(name)) as clean_name  
                    FROM smhi_water_bodies_lake_unified
                    WHERE water_type = 'lake' AND name IS NOT NULL
                      AND lat IS NOT NULL AND lon IS NOT NULL
                )
                SELECT COUNT(*) as duplicates
                FROM osm_lakes o
                INNER JOIN smhi_lakes s ON o.clean_name = s.clean_name
                WHERE SQRT(POWER(o.lat - s.lat, 2) + POWER(o.lon - s.lon, 2)) * 111.32 < 5
                """
            },
            
            "namn_och_narhet_10km": {
                "description": "Samma namn + <10km avstånd (mer tolerant)",
                "sql": """
                WITH osm_lakes AS (
                    SELECT id, name, lat, lon, area_km2,
                           LOWER(TRIM(name)) as clean_name
                    FROM water_bodies
                    WHERE water_type = 'lake' AND name IS NOT NULL
                      AND lat IS NOT NULL AND lon IS NOT NULL
                ),
                smhi_lakes AS (
                    SELECT id, name, lat, lon, area_km2,
                           LOWER(TRIM(name)) as clean_name  
                    FROM smhi_water_bodies_lake_unified
                    WHERE water_type = 'lake' AND name IS NOT NULL
                      AND lat IS NOT NULL AND lon IS NOT NULL
                )
                SELECT COUNT(*) as duplicates
                FROM osm_lakes o
                INNER JOIN smhi_lakes s ON o.clean_name = s.clean_name
                WHERE SQRT(POWER(o.lat - s.lat, 2) + POWER(o.lon - s.lon, 2)) * 111.32 < 10
                """
            }
        }
        
        print("\n📊 ÖVERLAPP-STRATEGIER JÄMFÖRELSE:")
        print("   Strategi                    | OSM sjöar som ersätts")
        print("   ----------------------------|----------------------")
        
        strategy_results = {}
        for strategy_name, strategy in strategies.items():
            cur.execute(strategy["sql"])
            result = cur.fetchone()
            duplicates = result['duplicates']
            strategy_results[strategy_name] = duplicates
            
            print(f"   {strategy['description'][:27]:<27} | {duplicates:>20,}")
        
        # Calculate remaining OSM lakes for each strategy
        cur.execute("SELECT COUNT(*) as total FROM water_bodies WHERE water_type = 'lake' AND name IS NOT NULL")
        total_osm_lakes = cur.fetchone()['total']
        
        print(f"\n📈 RESULTERANDE HYBRID STORLEK:")
        print(f"   Total OSM sjöar: {total_osm_lakes:,}")
        
        cur.execute("SELECT COUNT(*) as total FROM smhi_water_bodies_lake_unified WHERE water_type = 'lake'")
        smhi_lakes = cur.fetchone()['total']
        print(f"   SMHI sjöar: {smhi_lakes:,}")
        
        for strategy_name, duplicates in strategy_results.items():
            unique_osm = total_osm_lakes - duplicates
            total_hybrid_lakes = smhi_lakes + unique_osm
            print(f"   {strategy_name}: {total_hybrid_lakes:,} totala sjöar ({unique_osm:,} unika OSM)")
        
        # Show examples of potential problems
        print(f"\n⚠️  EXEMPEL PÅ PROBLEMATISKA FALL:")
        cur.execute("""
        WITH potential_issues AS (
            SELECT 
                o.name as osm_name,
                s.name as smhi_name,
                o.area_km2 as osm_area,
                s.area_km2 as smhi_area,
                o.lat as osm_lat,
                o.lon as osm_lon,
                s.lat as smhi_lat,
                s.lon as smhi_lon,
                SQRT(POWER(o.lat - s.lat, 2) + POWER(o.lon - s.lon, 2)) * 111.32 as distance_km
            FROM water_bodies o
            INNER JOIN smhi_water_bodies_lake_unified s 
                ON LOWER(TRIM(s.name)) = LOWER(TRIM(o.name))
            WHERE o.water_type = 'lake' AND s.water_type = 'lake'
              AND o.name IS NOT NULL AND s.name IS NOT NULL
              AND o.lat IS NOT NULL AND s.lat IS NOT NULL
        )
        SELECT *
        FROM potential_issues
        WHERE distance_km > 20  -- Långt avstånd = troligen olika sjöar
        ORDER BY distance_km DESC
        LIMIT 5;
        """)
        
        issues = cur.fetchall()
        if issues:
            print("   Namn           | OSM Area | SMHI Area | Avstånd | Problem")
            print("   ---------------|----------|-----------|---------|----------------")
            for issue in issues:
                name = issue['osm_name'][:13]
                osm_area = f"{issue['osm_area']:.0f}" if issue['osm_area'] else '0'
                smhi_area = f"{issue['smhi_area']:.0f}" if issue['smhi_area'] else '0'
                distance = f"{issue['distance_km']:.0f}"
                problem = "Olika sjöar!"
                print(f"   {name:<13} | {osm_area:>8} | {smhi_area:>9} | {distance:>7} | {problem}")
        
        # Recommended strategy
        print(f"\n✅ REKOMMENDERAD STRATEGI:")
        print(f"   'namn_och_narhet_5km' - Samma namn + <5km avstånd")
        print(f"   Orsak: Balanserar precision med säkerhet")
        print(f"   Resultat: {strategy_results['namn_och_narhet_5km']:,} OSM sjöar ersätts av SMHI")
        print(f"   Återstående: {total_osm_lakes - strategy_results['namn_och_narhet_5km']:,} unika OSM sjöar behålls")
        
        conn.close()
        return strategy_results
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    analyze_overlap_strategy()