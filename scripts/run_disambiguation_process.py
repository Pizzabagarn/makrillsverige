#!/usr/bin/env python3
"""
Water Body Disambiguation Process
=================================
Lägger till platsnamn till vattendrag för att disambiguera namn som "Vombsjön"
→ "Vombsjön (Skåne)" eller "Vombsjön (Sjöbo kommun)"

Använder spatial joins mot administrativa gränser från SCB, Kartverket och Dataforsyningen.

Usage:
    python run_disambiguation_process.py --all
    python run_disambiguation_process.py --sweden-only --batch-size 5000
    python run_disambiguation_process.py --test-mode --limit 100
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import time
import argparse
from collections import Counter
import json

def get_db_config():
    # Läs från .env.local för Supabase-anslutning
    from dotenv import load_dotenv
    load_dotenv('.env.local')
    
    # Använd KORREKTA Supabase pooler-uppgifter från .env.local
    host = os.getenv('DB_HOST', 'localhost')
    database = os.getenv('DB_DATABASE', 'postgres')
    user = os.getenv('DB_USER', 'postgres')
    password = os.getenv('DB_PASSWORD', '')
    port = int(os.getenv('DB_PORT', 5432))
        
    return {
        'host': host,
        'database': database,
        'user': user,  
        'password': password,
        'port': port
    }

def run_spatial_join_country(cursor, country, batch_size=1000, test_mode=False, limit=None):
    """
    Kör spatial join för ett land
    
    Strategy:
    1. Hitta representativ punkt för varje vattendrag (ST_Centroid eller ST_PointOnSurface)  
    2. Spatial join mot kommun-gränser
    3. Spatial join mot län/fylke/region-gränser
    4. Uppdatera water_bodies_with_places med resultatet
    """
    print(f"\n🇺🇳 SPATIAL JOIN för {country.upper()}...")
    
    # Bestäm country-kod
    country_codes = {'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK'}
    country_code = country_codes.get(country, 'SE')
    
    # Hämta ALLA vattendrag för spatial join med administrativa gränser
    cursor.execute(f"""
        SELECT COUNT(*) as total_count
        FROM water_bodies_with_places w
        WHERE w.lat IS NOT NULL 
        AND w.lon IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM administrative_boundaries_{country} a
            WHERE ST_Contains(a.geometry, ST_SetSRID(ST_Point(w.lon, w.lat), 4326))
        )
    """)
    
    total_count = cursor.fetchone()['total_count']
    
    if limit:
        total_count = min(total_count, limit)
        limit_clause = f"LIMIT {limit}"
    else:
        limit_clause = ""
    
    print(f"   📊 {total_count} vattendrag att processa för {country}")
    
    if total_count == 0:
        print(f"   ⚠️ Inga vattendrag hittades för {country_code}")
        return 0
    
    # Kör spatial join i batcher för prestanda
    processed = 0
    
    for offset in range(0, total_count, batch_size):
        batch_end = min(offset + batch_size, total_count)
        print(f"   🔄 Batch {offset}-{batch_end} av {total_count}...")
        
        if test_mode:
            print("   🧪 TEST MODE - Visar bara SQL-queries, kör ej uppdateringar")
        
        # SQL för spatial join med administrativa gränser
        # Anpassa admin-typer per land för bättre disambiguation
        if country == 'sweden':
            # SVERIGE: Använd tätorter och småorter för mer specifik platsangivelse
            municipality_types = "'tätort', 'småort'"
            county_types = "'län', 'region'"  # Fallback om vi får län senare
        elif country == 'norway':
            # NORGE: Kommuner och fylker
            municipality_types = "'kommune'"
            county_types = "'fylke'"
        elif country == 'denmark':
            # DANMARK: Kommuner och regioner
            municipality_types = "'kommune'"
            county_types = "'region'"
        else:
            # DEFAULT: Standard kommun/län
            municipality_types = "'kommun', 'kommune'"
            county_types = "'lan', 'fylke', 'region'"

        spatial_join_sql = f"""
        WITH water_batch AS (
            SELECT 
                id,
                name,
                lat,
                lon,
                ST_SetSRID(ST_Point(lon, lat), 4326) as point_geom
            FROM water_bodies_with_places 
            WHERE lat IS NOT NULL 
            AND lon IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM administrative_boundaries_{country} a
                WHERE ST_Contains(a.geometry, ST_SetSRID(ST_Point(lon, lat), 4326))
            )
            ORDER BY id
            OFFSET %s
            {limit_clause if offset == 0 else f"LIMIT {batch_size}"}
        ),
        water_with_municipality AS (
            SELECT 
                w.id,
                w.name,
                w.lat,
                w.lon,
                a.admin_name as municipality_name,
                a.admin_code as municipality_code,
                a.admin_type as municipality_type
            FROM water_batch w
            LEFT JOIN administrative_boundaries_{country} a ON (
                ST_Contains(a.geometry, w.point_geom) 
                AND a.admin_type IN ({municipality_types})
            )
        ),
        water_with_county AS (
            SELECT 
                w.id,
                w.name,
                w.lat,
                w.lon,
                w.municipality_name,
                w.municipality_code,
                w.municipality_type,
                a.admin_name as county_name,
                a.admin_code as county_code
            FROM water_with_municipality w
            LEFT JOIN administrative_boundaries_{country} a ON (
                ST_Contains(a.geometry, ST_SetSRID(ST_Point(w.lon, w.lat), 4326))
                AND a.admin_type IN ({county_types})
            )
        )
        UPDATE water_bodies_with_places 
        SET 
            municipality = w.municipality_name,
            municipality_type = w.municipality_type,
            county = w.county_name,
            country = UPPER('{country}'),
            administrative_source = '{country}',
            updated_at = NOW()
        FROM water_with_county w
        WHERE water_bodies_with_places.id = w.id;
        """
        
        if test_mode:
            print("   📝 SQL Query:")
            print(spatial_join_sql % (offset,))
            processed += batch_size
            continue
        
        try:
            start_time = time.time()
            cursor.execute(spatial_join_sql, (offset,))
            batch_processed = cursor.rowcount
            elapsed = time.time() - start_time
            
            print(f"   ✅ {batch_processed} rader uppdaterade i {elapsed:.1f}s")
            processed += batch_processed
            
        except Exception as e:
            print(f"   ❌ Fel i batch {offset}-{batch_end}: {e}")
            continue
    
    print(f"   🎉 {processed} vattendrag uppdaterade för {country}")
    return processed

def identify_name_conflicts(cursor, test_mode=False):
    """
    Identifiera namn-konflikter och räkna dubbletter
    """
    print(f"\n🔍 IDENTIFIERAR NAMN-KONFLIKTER...")
    
    # Räkna dubbletter
    cursor.execute("""
        WITH name_counts AS (
            SELECT 
                name,
                COUNT(*) as occurrence_count,
                COUNT(DISTINCT municipality) as municipality_count,
                COUNT(DISTINCT county) as county_count,
                COUNT(DISTINCT country) as country_count,
                STRING_AGG(DISTINCT water_type, ', ') as water_types,
                STRING_AGG(DISTINCT data_source, ', ') as data_sources
            FROM water_bodies_with_places 
            WHERE name IS NOT NULL AND name != ''
            GROUP BY name
        )
        UPDATE water_bodies_with_places 
        SET name_conflicts = nc.occurrence_count
        FROM name_counts nc
        WHERE water_bodies_with_places.name = nc.name;
    """)
    
    conflicts_updated = cursor.rowcount
    print(f"   ✅ {conflicts_updated} rader uppdaterade med konflikt-information")
    
    # Visa top konflikter
    cursor.execute("""
        SELECT 
            name,
            name_conflicts as conflicts,
            COUNT(DISTINCT municipality) as municipalities,
            COUNT(DISTINCT county) as counties,
            STRING_AGG(DISTINCT water_type, ', ') as types
        FROM water_bodies_with_places 
        WHERE name_conflicts > 1
        AND name IS NOT NULL
        GROUP BY name, name_conflicts
        ORDER BY name_conflicts DESC, name
        LIMIT 20;
    """)
    
    conflicts = cursor.fetchall()
    
    print(f"\n   📊 TOP NAMN-KONFLIKTER:")
    for conflict in conflicts[:10]:
        print(f"   🔥 '{conflict['name']}': {conflict['conflicts']} förekomster, {conflict['municipalities']} kommuner")
    
    return len(conflicts)

def generate_display_names(cursor, test_mode=False):
    """
    Generera disambiguerade visningsnamn baserat på administrativa gränser
    
    Logik:
    - Om namn_konflikter = 1: Behåll originalnamn (eller lägg till län för konsistens)
    - Om namn_konflikter > 1: Använd kommun i parentes
    - Om samma namn inom samma kommun: Använd län
    - Om samma namn inom samma län: Använd kommun + län
    """
    print(f"\n🏷️ GENERERAR DISAMBIGUERADE VISNINGSNAMN...")
    
    # STEG 1: Unika namn - behåll original eller lägg till län för konsistens
    unique_names_sql = """
    UPDATE water_bodies_with_places 
    SET 
        display_name = CASE 
            WHEN county IS NOT NULL THEN name || ' (' || county || ')'
            ELSE name 
        END,
        disambiguation_method = 'none_with_county'
    WHERE name_conflicts = 1 
    AND name IS NOT NULL;
    """
    
    # STEG 2: Dubbletter - använd kommun för disambiguation
    municipality_disambiguation_sql = """
    UPDATE water_bodies_with_places 
    SET 
        display_name = CASE 
            WHEN municipality IS NOT NULL THEN name || ' (' || municipality || ')'
            WHEN county IS NOT NULL THEN name || ' (' || county || ')'
            ELSE name
        END,
        disambiguation_method = CASE 
            WHEN municipality IS NOT NULL THEN 'municipality'
            WHEN county IS NOT NULL THEN 'county_fallback'
            ELSE 'no_admin_data'
        END
    WHERE name_conflicts > 1 
    AND name IS NOT NULL;
    """
    
    # STEG 3: Extrem-fall - samma namn i samma kommun (sällsynt)
    extreme_cases_sql = """
    WITH extreme_conflicts AS (
        SELECT 
            name,
            municipality,
            COUNT(*) as same_municipality_count
        FROM water_bodies_with_places 
        WHERE name_conflicts > 1 
        AND municipality IS NOT NULL
        GROUP BY name, municipality
        HAVING COUNT(*) > 1
    )
    UPDATE water_bodies_with_places 
    SET 
        display_name = CASE 
            WHEN county IS NOT NULL THEN name || ' (' || municipality || ', ' || county || ')'
            ELSE name || ' (' || municipality || ')'
        END,
        disambiguation_method = 'municipality_county'
    FROM extreme_conflicts ec
    WHERE water_bodies_with_places.name = ec.name 
    AND water_bodies_with_places.municipality = ec.municipality;
    """
    
    if test_mode:
        print("   🧪 TEST MODE - Visar SQL-queries:")
        print("   📝 Unique names SQL:", unique_names_sql[:200] + "...")
        print("   📝 Municipality disambiguation SQL:", municipality_disambiguation_sql[:200] + "...")
        print("   📝 Extreme cases SQL:", extreme_cases_sql[:200] + "...")
        return 0
    
    total_updated = 0
    
    try:
        # Kör unika namn
        cursor.execute(unique_names_sql)
        unique_updated = cursor.rowcount
        print(f"   ✅ {unique_updated} unika namn uppdaterade")
        total_updated += unique_updated
        
        # Kör kommun-disambiguation
        cursor.execute(municipality_disambiguation_sql)
        municipality_updated = cursor.rowcount
        print(f"   ✅ {municipality_updated} duplikat disambiguerade med kommun/län")
        total_updated += municipality_updated
        
        # Kör extrem-fall
        cursor.execute(extreme_cases_sql)
        extreme_updated = cursor.rowcount
        if extreme_updated > 0:
            print(f"   ⚠️ {extreme_updated} extrem-fall hanterade (kommun + län)")
        total_updated += extreme_updated
        
    except Exception as e:
        print(f"   ❌ Fel vid generering av visningsnamn: {e}")
        return 0
    
    print(f"   🎉 Totalt {total_updated} visningsnamn genererade")
    return total_updated

def generate_final_report(cursor):
    """Generera slutrapport om disambiguation-processen"""
    print(f"\n📊 DISAMBIGUATION SLUTRAPPORT")
    print("=" * 50)
    
    # Grundläggande statistik
    cursor.execute("""
        SELECT 
            country,
            COUNT(*) as total_waters,
            COUNT(CASE WHEN municipality IS NOT NULL THEN 1 END) as with_municipality,
            COUNT(CASE WHEN county IS NOT NULL THEN 1 END) as with_county,
            COUNT(CASE WHEN display_name IS NOT NULL THEN 1 END) as with_display_name,
            COUNT(CASE WHEN name_conflicts > 1 THEN 1 END) as with_conflicts
        FROM water_bodies_with_places 
        WHERE name IS NOT NULL
        GROUP BY country
        ORDER BY country;
    """)
    
    stats = cursor.fetchall()
    
    for stat in stats:
        country_name = {'SE': 'Sverige', 'NO': 'Norge', 'DK': 'Danmark'}.get(stat['country'], stat['country'])
        print(f"\n🇺🇳 {country_name}:")
        print(f"   📊 Totalt: {stat['total_waters']:,} vattendrag")
        print(f"   🏛️ Med kommun: {stat['with_municipality']:,} ({stat['with_municipality']/stat['total_waters']*100:.1f}%)")
        print(f"   🗺️ Med län/fylke: {stat['with_county']:,} ({stat['with_county']/stat['total_waters']*100:.1f}%)")
        print(f"   🏷️ Med visningsnamn: {stat['with_display_name']:,} ({stat['with_display_name']/stat['total_waters']*100:.1f}%)")
        print(f"   🔥 Med namn-konflikter: {stat['with_conflicts']:,}")
    
    # Disambiguation-metoder
    cursor.execute("""
        SELECT 
            disambiguation_method,
            COUNT(*) as count,
            ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
        FROM water_bodies_with_places 
        WHERE disambiguation_method IS NOT NULL
        GROUP BY disambiguation_method
        ORDER BY count DESC;
    """)
    
    methods = cursor.fetchall()
    
    print(f"\n🔧 DISAMBIGUATION-METODER:")
    for method in methods:
        print(f"   📈 {method['disambiguation_method']}: {method['count']:,} ({method['percentage']}%)")
    
    # Exempel på disambiguerade namn
    cursor.execute("""
        SELECT name, display_name, municipality, county, country
        FROM water_bodies_with_places 
        WHERE display_name != name 
        AND display_name IS NOT NULL
        ORDER BY name_conflicts DESC, name
        LIMIT 10;
    """)
    
    examples = cursor.fetchall()
    
    print(f"\n🎯 EXEMPEL PÅ DISAMBIGUERADE NAMN:")
    for example in examples:
        country_flag = {'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰'}.get(example['country'], '🌍')
        print(f"   {country_flag} '{example['name']}' → '{example['display_name']}'")

def main():
    parser = argparse.ArgumentParser(description='Kör disambiguation-process för vattendrag')
    parser.add_argument('--all', action='store_true', help='Processa alla länder')
    parser.add_argument('--sweden-only', action='store_true', help='Bara Sverige')
    parser.add_argument('--norway-only', action='store_true', help='Bara Norge')
    parser.add_argument('--denmark-only', action='store_true', help='Bara Danmark')
    parser.add_argument('--batch-size', type=int, default=1000, help='Batch-storlek för spatial joins')
    parser.add_argument('--test-mode', action='store_true', help='Test-läge - visa bara SQL utan att köra')
    parser.add_argument('--limit', type=int, help='Begränsa antal rader (för testing)')
    
    args = parser.parse_args()
    
    if not any([args.all, args.sweden_only, args.norway_only, args.denmark_only]):
        print("❌ Ange vilket land du vill processa!")
        parser.print_help()
        return
    
    print("🎯 WATER BODY DISAMBIGUATION PROCESS")
    print("=" * 50)
    
    # Kolla databas-anslutning
    try:
        db_config = get_db_config()
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Testa anslutning
        cursor.execute("SELECT COUNT(*) as count FROM water_bodies_with_places;")
        result = cursor.fetchone()
        total_waters = result['count']
        print(f"✅ Databasanslutning OK - {total_waters:,} vattendrag i arbetskopia")
        
    except Exception as e:
        print(f"❌ Databasanslutning misslyckades: {e}")
        return
    
    start_time = time.time()
    
    # Bestäm vilka länder som ska processas
    countries_to_process = []
    if args.all:
        countries_to_process = ['sweden', 'norway', 'denmark']
    elif args.sweden_only:
        countries_to_process = ['sweden']
    elif args.norway_only:
        countries_to_process = ['norway']
    elif args.denmark_only:
        countries_to_process = ['denmark']
    
    total_processed = 0
    
    # STEG 1: Spatial joins per land
    for country in countries_to_process:
        processed = run_spatial_join_country(
            cursor, 
            country, 
            batch_size=args.batch_size,
            test_mode=args.test_mode,
            limit=args.limit
        )
        total_processed += processed
        
        if not args.test_mode:
            conn.commit()
    
    # STEG 2: Identifiera namn-konflikter
    conflicts_count = identify_name_conflicts(cursor, args.test_mode)
    if not args.test_mode:
        conn.commit()
    
    # STEG 3: Generera disambiguerade visningsnamn
    display_names_generated = generate_display_names(cursor, args.test_mode)
    if not args.test_mode:
        conn.commit()
    
    # STEG 4: Slutrapport
    if not args.test_mode:
        generate_final_report(cursor)
    
    elapsed_time = time.time() - start_time
    
    print(f"\n🎉 DISAMBIGUATION SLUTFÖRD!")
    print(f"   ⏱️ Total tid: {elapsed_time:.1f} sekunder")
    print(f"   📊 {total_processed:,} vattendrag processade")
    print(f"   🔥 {conflicts_count:,} namn-konflikter identifierade")
    print(f"   🏷️ {display_names_generated:,} visningsnamn genererade")
    
    if not args.test_mode:
        print(f"\n▶️ Nästa steg: Uppdatera din applikation att använda 'display_name' kolumnen för UI!")
        print(f"   💡 Exempel: SELECT name, display_name FROM water_bodies_with_places WHERE name_conflicts > 1;")

if __name__ == "__main__":
    main()