#!/usr/bin/env python3
"""
Import Administrative Boundaries to PostGIS
===========================================
Importerar nedladdade kommun/län-gränser till databasen för disambiguation

Usage:
    python import_administrative_boundaries.py --all
    python import_administrative_boundaries.py --sweden-only
    python import_administrative_boundaries.py --test-mode
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import geopandas as gpd
from pathlib import Path
import argparse
from sqlalchemy import create_engine
import time

# Database config från environment - SUPABASE EDITION
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
    
    print(f"   🔗 Ansluter till: {host}")
    print(f"   📊 Databas: {database}")
    print(f"   👤 Användare: {user}")
        
    return {
        'host': host,
        'database': database,
        'user': user,  
        'password': password,
        'port': port
    }

DOWNLOADS_DIR = Path("administrative_data_downloads")

def create_sqlalchemy_engine():
    """Skapa SQLAlchemy engine för GeoPandas to_postgis()"""
    config = get_db_config()
    return create_engine(f"postgresql://{config['user']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}")

def standardize_sweden_data(gdf, admin_type):
    """Standardisera svenska data till enhetligt format"""
    print(f"   🔧 Standardiserar svenska {admin_type}-data...")
    
    # OPENDATASOFT kolumner (Lantmäteriet-data via spegling)
    name_cols = [
        'kom_name', 'lan_name',      # Opendatasoft kommun/län-namn
        'name', 'namn',              # Lantmäteriet standard namn-kolumner
        'nationalCode', 'natCode',   # INSPIRE nationalkoder
        'tatort', 'smaort',          # Fallback för SCB-data
        'kommunnamn'                 # Fallback för SCB-data
    ]
    
    code_cols = [
        'kom_area_code', 'lan_area_code', 'lan_code',  # Opendatasoft koder
        'nationalCode', 'natCode',   # INSPIRE nationalkoder
        'inspireId_localId',         # INSPIRE lokala ID:n
        'kod', 'code', 'id',         # Generiska koder  
        'KOMMUNKOD', 'LANSKOD'       # Fallback kommun/län-koder
    ]
    
    name_col = None
    code_col = None
    
    for col in name_cols:
        if col in gdf.columns:
            name_col = col
            break
    
    for col in code_cols:
        if col in gdf.columns:
            code_col = col
            break
    
    if not name_col:
        print(f"   ⚠️ VARNING: Kunde inte hitta namn-kolumn i {list(gdf.columns[:10])}")
        name_col = gdf.columns[0]  # Fallback till första kolumnen
    
    # Skapa standardiserad struktur
    standardized = gdf.copy()
    standardized['admin_type'] = admin_type
    standardized['admin_name'] = gdf[name_col].astype(str)
    standardized['admin_code'] = gdf[code_col].astype(str) if code_col else None
    standardized['country'] = 'SE'  # SVERIGE - automatiskt från källa
    standardized['data_source'] = 'scb'
    
    # Behåll bara standardkolumner + geometri
    keep_cols = ['admin_type', 'admin_code', 'admin_name', 'country', 'data_source', 'geometry']
    standardized = standardized[keep_cols]
    
    print(f"   ✅ {len(standardized)} svenska {admin_type} standardiserade")
    return standardized

def standardize_norway_data(gdf, admin_type):
    """Standardisera norska data till enhetligt format"""
    print(f"   🔧 Standardiserar norska {admin_type}-data...")
    
    # Kartverket-format
    name_cols = ['kommunenavn', 'fylkesnavn', 'navn', 'name']
    code_cols = ['kommunenummer', 'fylkesnummer', 'kode', 'nummer']
    
    name_col = None
    code_col = None
    
    for col in name_cols:
        if col in gdf.columns:
            name_col = col
            break
    
    for col in code_cols:
        if col in gdf.columns:
            code_col = col
            break
    
    if not name_col:
        print(f"   ⚠️ VARNING: Kunde inte hitta namn-kolumn i {list(gdf.columns)}")
        name_col = gdf.columns[0]
    
    standardized = gdf.copy()
    standardized['admin_type'] = admin_type
    standardized['admin_name'] = gdf[name_col].astype(str)
    standardized['admin_code'] = gdf[code_col].astype(str) if code_col else None
    standardized['country'] = 'NO'
    standardized['data_source'] = 'kartverket'
    
    keep_cols = ['admin_type', 'admin_code', 'admin_name', 'country', 'data_source', 'geometry']
    standardized = standardized[keep_cols]
    
    print(f"   ✅ {len(standardized)} norska {admin_type} standardiserade")
    return standardized

def standardize_denmark_data(gdf, admin_type):
    """Standardisera danska data till enhetligt format"""
    print(f"   🔧 Standardiserar danska {admin_type}-data...")
    
    # Dataforsyningen-format  
    name_cols = ['navn', 'name', 'kommunenavn', 'regionnavn']
    code_cols = ['kode', 'kommunekode', 'regionskode', 'code']
    
    name_col = None
    code_col = None
    
    for col in name_cols:
        if col in gdf.columns:
            name_col = col
            break
    
    for col in code_cols:
        if col in gdf.columns:
            code_col = col
            break
    
    if not name_col:
        print(f"   ⚠️ VARNING: Kunde inte hitta namn-kolumn i {list(gdf.columns)}")
        name_col = gdf.columns[0]
    
    standardized = gdf.copy()
    standardized['admin_type'] = admin_type
    standardized['admin_name'] = gdf[name_col].astype(str)
    standardized['admin_code'] = gdf[code_col].astype(str) if code_col else None
    standardized['country'] = 'DK'
    standardized['data_source'] = 'dataforsyningen'
    
    keep_cols = ['admin_type', 'admin_code', 'admin_name', 'country', 'data_source', 'geometry']
    standardized = standardized[keep_cols]
    
    print(f"   ✅ {len(standardized)} danska {admin_type} standardiserade")
    return standardized

def import_country_boundaries(country, engine, test_mode=False):
    """Importera administrativa gränser för ett land"""
    print(f"\n🇺🇳 IMPORTERAR {country.upper()}-data...")
    
    # Hitta filer för landet
    if country == 'sweden':
        file_patterns = ['sweden_municipalities', 'sweden_counties']
        admin_types = ['kommun', 'län']
        standardize_func = standardize_sweden_data
    elif country == 'norway':
        file_patterns = ['norway_municipalities', 'norway_counties']
        admin_types = ['kommune', 'fylke']
        standardize_func = standardize_norway_data
    elif country == 'denmark':
        file_patterns = ['denmark_municipalities', 'denmark_regions']
        admin_types = ['kommune', 'region']
        standardize_func = standardize_denmark_data
    else:
        print(f"❌ Okänt land: {country}")
        return False
    
    all_boundaries = []
    
    for pattern, admin_type in zip(file_patterns, admin_types):
        # Leta efter filer (både .geojson och _wfs.geojson)
        possible_files = [
            DOWNLOADS_DIR / f"{pattern}.geojson",
            DOWNLOADS_DIR / f"{pattern}_wfs.geojson"
        ]
        
        filepath = None
        for possible_file in possible_files:
            if possible_file.exists():
                filepath = possible_file
                break
        
        if not filepath:
            print(f"   ⚠️ Kunde inte hitta fil för {pattern}")
            continue
        
        try:
            print(f"   📂 Läser {filepath.name}...")
            gdf = gpd.read_file(filepath)
            
            # Transformera till WGS84 om nödvändigt
            if gdf.crs != 'EPSG:4326':
                print(f"   🔄 Transformerar från {gdf.crs} till EPSG:4326...")
                gdf = gdf.to_crs('EPSG:4326')
            
            # Standardisera data
            standardized = standardize_func(gdf, admin_type)
            all_boundaries.append(standardized)
            
        except Exception as e:
            print(f"   ❌ Fel vid läsning av {filepath}: {e}")
            continue
    
    if not all_boundaries:
        print(f"   ❌ Inga gränser hittades för {country}")
        return False
    
    # Kombinera alla gränser för landet
    combined = gpd.pd.concat(all_boundaries, ignore_index=True)
    print(f"   📊 Totalt {len(combined)} administrativa enheter för {country}")
    
    if test_mode:
        print("   🧪 TEST MODE - Visar bara de första raderna:")
        print(combined.head())
        return True
    
    # Importera till PostGIS
    table_name = f'administrative_boundaries_{country}'
    print(f"   💾 Importerar till tabell '{table_name}'...")
    
    try:
        # Importera med to_postgis
        combined.to_postgis(
            table_name,
            engine,
            if_exists='replace',  # Ersätt om tabellen finns
            index=False,
            chunksize=1000
        )
        
        print(f"   ✅ {len(combined)} rader importerade till {table_name}")
        
        # Skapa spatial index
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_geom ON {table_name} USING GIST (geometry);"))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_type ON {table_name} (admin_type);"))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_name ON {table_name} (admin_name);"))
            conn.commit()
        
        print(f"   📊 Spatial index skapade för {table_name}")
        return True
        
    except Exception as e:
        print(f"   ❌ Fel vid import till PostgreSQL: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Importera administrativa gränser till PostGIS')
    parser.add_argument('--all', action='store_true', help='Importera alla länder')
    parser.add_argument('--sweden-only', action='store_true', help='Bara Sverige')
    parser.add_argument('--norway-only', action='store_true', help='Bara Norge')
    parser.add_argument('--denmark-only', action='store_true', help='Bara Danmark')
    parser.add_argument('--test-mode', action='store_true', help='Test-läge - ingen databas-import')
    
    args = parser.parse_args()
    
    if not any([args.all, args.sweden_only, args.norway_only, args.denmark_only]):
        print("❌ Ange vilket land du vill importera!")
        parser.print_help()
        return
    
    print("🗄️ ADMINISTRATIVE BOUNDARIES IMPORT")
    print("=" * 50)
    
    if not DOWNLOADS_DIR.exists():
        print(f"❌ Downloads-mapp hittades inte: {DOWNLOADS_DIR}")
        print("   ▶️ Kör först: python download_administrative_boundaries.py --all")
        return
    
    # Kolla databas-anslutning
    if not args.test_mode:
        try:
            engine = create_sqlalchemy_engine()
            with engine.connect() as conn:
                from sqlalchemy import text
                result = conn.execute(text("SELECT version()"))
                version = result.fetchone()[0]
                print(f"✅ Databasanslutning OK: {version[:80]}...")
        except Exception as e:
            print(f"❌ Databasanslutning misslyckades: {e}")
            print("   💡 Kontrollera environment-variabler för databas")
            return
    else:
        engine = None
        print("🧪 TEST MODE - Ingen databasanslutning")
    
    # Importera valda länder
    success_count = 0
    
    countries_to_import = []
    if args.all:
        countries_to_import = ['sweden', 'norway', 'denmark']
    elif args.sweden_only:
        countries_to_import = ['sweden']
    elif args.norway_only:
        countries_to_import = ['norway']
    elif args.denmark_only:
        countries_to_import = ['denmark']
    
    for country in countries_to_import:
        success = import_country_boundaries(country, engine, args.test_mode)
        if success:
            success_count += 1
    
    print(f"\n🎉 IMPORT SLUTFÖRD!")
    print(f"   ✅ {success_count}/{len(countries_to_import)} länder importerade framgångsrikt")
    
    if not args.test_mode and success_count > 0:
        print(f"\n▶️ Nästa steg: Kör 'python run_disambiguation_process.py' för att lägg till platsnamn")

if __name__ == "__main__":
    main()