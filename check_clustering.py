import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

def get_db_config():
    return {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_DATABASE'), 
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': os.getenv('DB_PORT', 5432)
    }

try:
    config = get_db_config()
    conn = psycopg2.connect(**config)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    print('🔍 Kollar Vänern i olika tabeller:')
    print()
    
    # Kolla water_bodies_integrated (klustrad?)
    cursor.execute("""
        SELECT COUNT(*) as count, 
               MAX(area_km2) as max_area,
               MAX(cluster_size) as max_cluster_size,
               unification_method
        FROM water_bodies_integrated 
        WHERE name ILIKE '%vänern%'
        GROUP BY unification_method
        ORDER BY max_area DESC;
    """)
    
    print('📊 water_bodies_integrated:')
    for row in cursor.fetchall():
        print(f'   {row["count"]} segment, max: {row["max_area"]:.1f} km², cluster: {row["max_cluster_size"]}, method: {row["unification_method"]}')
    print()
    
    # Kolla water_bodies_with_places
    cursor.execute("""
        SELECT COUNT(*) as count,
               MAX(area_km2) as max_area,
               MAX(cluster_size) as max_cluster_size,
               unification_method
        FROM water_bodies_with_places 
        WHERE name ILIKE '%vänern%'
        GROUP BY unification_method
        ORDER BY max_area DESC;
    """)
    
    print('📊 water_bodies_with_places:')
    for row in cursor.fetchall():
        print(f'   {row["count"]} segment, max: {row["max_area"]:.1f} km², cluster: {row["max_cluster_size"]}, method: {row["unification_method"]}')
    print()
    
    # Kolla om det finns water_bodies_unified (den riktigt klustrade?)
    try:
        cursor.execute("""
            SELECT COUNT(*) as count,
                   MAX(total_area_km2) as max_area,
                   MAX(original_segment_count) as max_segments,
                   unification_method
            FROM water_bodies_unified 
            WHERE name ILIKE '%vänern%'
            GROUP BY unification_method
            ORDER BY max_area DESC;
        """)
        
        print('📊 water_bodies_unified (RIKTIGT KLUSTRAD):')
        for row in cursor.fetchall():
            print(f'   {row["count"]} segment, max: {row["max_area"]:.1f} km², segments: {row["max_segments"]}, method: {row["unification_method"]}')
            
    except Exception as e:
        print('❌ water_bodies_unified finns inte eller är tom')
    
except Exception as e:
    print(f'❌ Fel: {e}')
finally:
    if 'conn' in locals():
        conn.close()