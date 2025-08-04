#!/usr/bin/env python3
"""
Complete SMHI water bodies import script
Supports both 2016 (Shapefile) and 2022 (GeoPackage) data
Creates separate smhi_water_bodies table without touching OSM data
"""

import os
import sys
import requests
import zipfile
import tempfile
import psycopg2
import geopandas as gpd
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine
from dotenv import load_dotenv
import argparse

# Load environment variables from .env.local
load_dotenv('.env.local')

# SMHI data sources - both 2016 and 2022
SMHI_DATA_SOURCES = {
    '2016': {
        'surfaces': {
            'url': 'Vattenytor_2016.zip',
            'description': 'SMHI Vattenytor 2016 (Lakes/Surfaces)',
            'water_type': 'lake',
            'name_column': 'NAME',
            'expected_count': 42178
        },
        'lines': {
            'url': 'Vattendragslinjer_natverk_2016.zip', 
            'description': 'SMHI Vattendragslinjernätverk 2016 (Rivers/Lines)',
            'water_type': 'river',
            'name_columns': ['VNAME', 'RNAME'],  # Try VNAME first, fallback to RNAME
            'expected_count': 135018
        }
    },
    '2022': {
        'combined': {
            'url': 'SVAR2022_vattenforekomstavrinningsomraden.zip',
            'description': 'SMHI SVAR 2022 Vattenförekomster (Combined)',
            'water_type': 'mixed',  # Will be determined from geometry
            'file_type': 'gpkg',
            'expected_count': None  # Unknown
        }
    }
}

SMHI_BASE_URL = "https://opendata-download.smhi.se/svar/"

def get_db_config():
    """Get database configuration from environment variables"""
    
    required_vars = ['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD']
    
    for var in required_vars:
        if not os.getenv(var):
            raise ValueError(f"Missing required environment variable: {var}")
    
    return {
        'host': os.getenv('DB_HOST'),
        'port': os.getenv('DB_PORT', '5432'),
        'database': os.getenv('DB_DATABASE'),
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD')
    }

def download_smhi_file(filename: str, temp_dir: Path) -> Path:
    """Download SMHI file"""
    url = f"{SMHI_BASE_URL}{filename}"
    zip_path = temp_dir / filename
    
    print(f"📥 Downloading {filename}...")
    
    try:
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        
        with open(zip_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        file_size = zip_path.stat().st_size / (1024*1024)  # MB
        print(f"   Downloaded: {file_size:.1f} MB")
        
        # Extract ZIP
        extract_dir = temp_dir / filename.replace('.zip', '')
        extract_dir.mkdir(exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        print(f"   Extracted to: {extract_dir}")
        return extract_dir
        
    except Exception as e:
        print(f"❌ Error downloading {filename}: {e}")
        raise

def process_2016_shapefile(extract_dir: Path, layer_info: dict) -> gpd.GeoDataFrame:
    """Process 2016 shapefile data"""
    
    print(f"📊 Processing {layer_info['description']}...")
    
    # Find shapefile
    shp_files = list(extract_dir.glob("*.shp"))
    if not shp_files:
        raise FileNotFoundError(f"No shapefile found in {extract_dir}")
    
    shp_path = shp_files[0]
    print(f"   Reading: {shp_path.name}")
    
    # Read shapefile
    gdf = gpd.read_file(shp_path)
    print(f"   Raw features: {len(gdf):,}")
    
    # Convert CRS to EPSG:4326 (same as OSM data)
    if gdf.crs and gdf.crs.to_string() != 'EPSG:4326':
        print(f"   Converting from {gdf.crs} to EPSG:4326...")
        gdf = gdf.to_crs('EPSG:4326')
    
    # Standardize columns
    standardized_gdf = standardize_2016_columns(gdf, layer_info)
    
    return standardized_gdf

def standardize_2016_columns(gdf: gpd.GeoDataFrame, layer_info: dict) -> gpd.GeoDataFrame:
    """Standardize 2016 data columns to common format"""
    
    # Create standardized dataframe
    result = gpd.GeoDataFrame()
    
    # Handle names - try multiple name columns for rivers
    if 'name_columns' in layer_info:
        # Rivers have VNAME and RNAME
        name_col = None
        for col in layer_info['name_columns']:
            if col in gdf.columns:
                name_col = col
                break
        
        if name_col:
            result['name'] = gdf[name_col]
        else:
            result['name'] = None
            
    elif 'name_column' in layer_info and layer_info['name_column'] in gdf.columns:
        # Lakes have NAME
        result['name'] = gdf[layer_info['name_column']]
    else:
        result['name'] = None
    
    # Water type
    result['water_type'] = layer_info['water_type']
    
    # Original IDs and codes (keep for reference)
    result['original_id'] = gdf['VYID'] if 'VYID' in gdf.columns else (gdf['RSTID'] if 'RSTID' in gdf.columns else (gdf['OBJECTID'] if 'OBJECTID' in gdf.columns else None))
    result['sjo_id'] = gdf['SJOID'] if 'SJOID' in gdf.columns else None
    result['vdr_id'] = gdf['VDRID'] if 'VDRID' in gdf.columns else None
    result['water_body_id'] = gdf['WB'] if 'WB' in gdf.columns else None
    
    # Geographic info
    result['country'] = gdf['COUNTRY'] if 'COUNTRY' in gdf.columns else 'SE'
    result['district'] = gdf['DISTRICT'] if 'DISTRICT' in gdf.columns else None
    result['competent_authority'] = gdf['COMP_AUTH'] if 'COMP_AUTH' in gdf.columns else None
    
    # Technical info
    result['version'] = gdf['VERSION'] if 'VERSION' in gdf.columns else None
    result['height'] = gdf['VYHOJD'] if 'VYHOJD' in gdf.columns else None
    result['line_code'] = gdf['LINJEKOD'] if 'LINJEKOD' in gdf.columns else None
    
    # Metadata
    result['source'] = 'SMHI_2016'
    result['imported_at'] = pd.Timestamp.now()
    
    # Geometry
    result['geometry'] = gdf['geometry']
    
    # Filter out records without names
    if 'name' in result.columns and not result['name'].isna().all():
        before_filter = len(result)
        result = result[result['name'].notna() & (result['name'].astype(str).str.strip() != '')]
        after_filter = len(result)
        print(f"   Filtered: {before_filter:,} → {after_filter:,} (removed {before_filter-after_filter:,} without names)")
    
    return result

def process_2022_geopackage(extract_dir: Path, layer_info: dict) -> gpd.GeoDataFrame:
    """Process 2022 GeoPackage data"""
    
    print(f"📊 Processing {layer_info['description']}...")
    
    # Find GeoPackage file
    gpkg_files = list(extract_dir.glob("*.gpkg"))
    if not gpkg_files:
        raise FileNotFoundError(f"No GeoPackage found in {extract_dir}")
    
    gpkg_path = gpkg_files[0]
    print(f"   Reading: {gpkg_path.name}")
    
    # Read GeoPackage - might have multiple layers
    try:
        # List layers first
        import fiona
        layers = fiona.listlayers(gpkg_path)
        print(f"   Found layers: {layers}")
        
        # Read all layers and combine
        all_gdfs = []
        for layer in layers:
            print(f"   Reading layer: {layer}")
            layer_gdf = gpd.read_file(gpkg_path, layer=layer)
            layer_gdf['source_layer'] = layer
            all_gdfs.append(layer_gdf)
        
        if len(all_gdfs) == 1:
            gdf = all_gdfs[0]
        else:
            gdf = pd.concat(all_gdfs, ignore_index=True)
        
        print(f"   Total features: {len(gdf):,}")
        
    except ImportError:
        # Fallback if fiona not available
        print("   Using default layer...")
        gdf = gpd.read_file(gpkg_path)
    
    # Convert CRS if needed
    if gdf.crs and gdf.crs.to_string() != 'EPSG:4326':
        print(f"   Converting from {gdf.crs} to EPSG:4326...")
        gdf = gdf.to_crs('EPSG:4326')
    
    # Standardize columns for 2022 data
    standardized_gdf = standardize_2022_columns(gdf, layer_info)
    
    return standardized_gdf

def standardize_2022_columns(gdf: gpd.GeoDataFrame, layer_info: dict) -> gpd.GeoDataFrame:
    """Standardize 2022 GeoPackage columns to common format"""
    
    print("   Analyzing 2022 data structure...")
    print(f"   Columns: {list(gdf.columns)}")
    
    # Create standardized dataframe
    result = gpd.GeoDataFrame()
    
    # Try to find name columns (SVAR might use different naming)
    name_candidates = [col for col in gdf.columns if any(word in col.upper() for word in ['NAME', 'NAMN', 'BETECK'])]
    if name_candidates:
        result['name'] = gdf[name_candidates[0]]
        print(f"   Using name column: {name_candidates[0]}")
    else:
        result['name'] = None
        print("   No name column found")
    
    # Determine water type from geometry
    geom_types = gdf.geometry.geom_type.value_counts()
    print(f"   Geometry types: {dict(geom_types)}")
    
    # Map geometry types to water types
    def get_water_type(geom_type):
        if geom_type in ['Polygon', 'MultiPolygon']:
            return 'lake'
        elif geom_type in ['LineString', 'MultiLineString']:
            return 'river'
        else:
            return 'other'
    
    result['water_type'] = gdf.geometry.geom_type.apply(get_water_type)
    
    # Try to find common SVAR columns
    svar_columns = {
        'svar_id': ['SVAR_ID', 'SVARID', 'ID'],
        'eu_cd': ['EU_CD', 'EUCD'],
        'ms_cd': ['MS_CD', 'MSCD'],
        'water_body_id': ['WB', 'WATERBODY', 'WB_ID'],
        'area_m2': ['AREA', 'AREA_M2', 'AREAM2'],
        'length_m': ['LENGTH', 'LENGTH_M', 'Lengthm'],
        'depth_mean': ['DEPTH_MEAN', 'MEANDEPTH', 'AvgDepth'],
        'depth_max': ['DEPTH_MAX', 'MAXDepth', 'MaxDepth'],
        'volume_m3': ['VOLUME', 'VOLUME_M3', 'Volumem3'],
        'ecological_status': ['ECO_STATUS', 'EcoStatus', 'ECOLOGICAL'],
        'chemical_status': ['CHEM_STATUS', 'ChemStatus', 'CHEMICAL']
    }
    
    for target_col, possible_cols in svar_columns.items():
        found_col = None
        for col in possible_cols:
            if col in gdf.columns:
                found_col = col
                break
        
        if found_col:
            result[target_col] = gdf[found_col]
            print(f"   Mapped {found_col} → {target_col}")
        else:
            result[target_col] = None
    
    # Metadata
    result['source'] = 'SMHI_SVAR_2022'
    result['imported_at'] = pd.Timestamp.now()
    
    # Geometry
    result['geometry'] = gdf['geometry']
    
    # Filter out records without names
    if 'name' in result.columns and not result['name'].isna().all():
        before_filter = len(result)
        result = result[result['name'].notna() & (result['name'].astype(str).str.strip() != '')]
        after_filter = len(result)
        print(f"   Filtered: {before_filter:,} → {after_filter:,} (removed {before_filter-after_filter:,} without names)")
    
    return result

def create_smhi_table(db_config: dict, drop_existing: bool = False):
    """Create the smhi_water_bodies table"""
    
    print("🗂️ Setting up smhi_water_bodies table...")
    
    with psycopg2.connect(**db_config) as conn:
        with conn.cursor() as cur:
            # Drop existing table if requested
            if drop_existing:
                print("   Dropping existing table...")
                cur.execute("DROP TABLE IF EXISTS smhi_water_bodies CASCADE;")
            
            # Create new table with comprehensive schema
            cur.execute("""
                CREATE TABLE IF NOT EXISTS smhi_water_bodies (
                    id BIGSERIAL PRIMARY KEY,
                    
                    -- Basic info
                    name TEXT NOT NULL,
                    water_type TEXT NOT NULL, -- 'lake', 'river', 'other'
                    
                    -- Original IDs (for 2016 data)
                    original_id TEXT,
                    sjo_id TEXT,
                    vdr_id TEXT,
                    water_body_id TEXT,
                    
                    -- SVAR IDs (for 2022 data)
                    svar_id TEXT,
                    eu_cd TEXT,
                    ms_cd TEXT,
                    
                    -- Geographic info
                    country TEXT DEFAULT 'SE',
                    district TEXT,
                    competent_authority TEXT,
                    
                    -- Measurements
                    area_m2 NUMERIC,
                    area_km2 NUMERIC GENERATED ALWAYS AS (area_m2 / 1000000.0) STORED,
                    length_m NUMERIC,
                    length_km NUMERIC GENERATED ALWAYS AS (length_m / 1000.0) STORED,
                    height NUMERIC,
                    
                    -- Water quality (mainly 2022 data)
                    depth_mean NUMERIC,
                    depth_max NUMERIC,
                    volume_m3 NUMERIC,
                    ecological_status TEXT,
                    chemical_status TEXT,
                    
                    -- Technical info
                    version TEXT,
                    line_code INTEGER,
                    source_layer TEXT,
                    
                    -- Metadata
                    source TEXT NOT NULL, -- 'SMHI_2016' or 'SMHI_SVAR_2022'
                    imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    
                    -- Geometry
                    geometry GEOMETRY(GEOMETRY, 4326)
                );
            """)
            
            # Create indexes
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_geometry 
                ON smhi_water_bodies USING GIST(geometry);
                
                CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_name 
                ON smhi_water_bodies(name);
                
                CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_water_type 
                ON smhi_water_bodies(water_type);
                
                CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_source 
                ON smhi_water_bodies(source);
                
                CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_svar_id 
                ON smhi_water_bodies(svar_id) WHERE svar_id IS NOT NULL;
                
                CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_area 
                ON smhi_water_bodies(area_km2) WHERE area_km2 IS NOT NULL;
                
                CREATE INDEX IF NOT EXISTS idx_smhi_water_bodies_country 
                ON smhi_water_bodies(country);
            """)
            
            # Enable RLS to match existing pattern
            cur.execute("""
                ALTER TABLE smhi_water_bodies ENABLE ROW LEVEL SECURITY;
                
                DROP POLICY IF EXISTS "Allow public read access" ON smhi_water_bodies;
                CREATE POLICY "Allow public read access" ON smhi_water_bodies
                    FOR SELECT USING (true);
                    
                DROP POLICY IF EXISTS "Allow authenticated write" ON smhi_water_bodies;
                CREATE POLICY "Allow authenticated write" ON smhi_water_bodies
                    FOR ALL WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');
            """)
        
        conn.commit()
        print("✅ Table and indexes created successfully")

def import_to_database(gdf: gpd.GeoDataFrame, db_config: dict, batch_size: int = 1000):
    """Import GeoDataFrame to smhi_water_bodies table in batches"""
    
    print(f"📊 Importing {len(gdf):,} features to database...")
    
    # Create SQLAlchemy engine
    engine = create_engine(
        f"postgresql://{db_config['user']}:{db_config['password']}@"
        f"{db_config['host']}:{db_config['port']}/{db_config['database']}"
    )
    
    # Import in batches for better performance
    total_imported = 0
    for i in range(0, len(gdf), batch_size):
        batch = gdf.iloc[i:i+batch_size]
        batch.to_postgis('smhi_water_bodies', engine, if_exists='append', index=False)
        total_imported += len(batch)
        print(f"   Progress: {total_imported:,}/{len(gdf):,} ({total_imported/len(gdf)*100:.1f}%)")
    
    print("✅ Import completed")

def print_summary(db_config: dict):
    """Print summary statistics"""
    
    print("\n📊 IMPORT SUMMARY:")
    print("=" * 60)
    
    with psycopg2.connect(**db_config) as conn:
        with conn.cursor() as cur:
            # Total count
            cur.execute("SELECT COUNT(*) FROM smhi_water_bodies;")
            total = cur.fetchone()[0]
            
            # By source and water type
            cur.execute("""
                SELECT source, water_type, COUNT(*), 
                       AVG(area_km2) as avg_area_km2,
                       AVG(length_km) as avg_length_km,
                       AVG(depth_mean) as avg_depth_m
                FROM smhi_water_bodies 
                GROUP BY source, water_type 
                ORDER BY source, water_type;
            """)
            
            print(f"   🗂️ Total water bodies: {total:,}")
            print(f"   📋 Breakdown:")
            
            for source, water_type, count, avg_area, avg_length, avg_depth in cur.fetchall():
                metrics = []
                if avg_area: metrics.append(f"avg area: {avg_area:.3f} km²")
                if avg_length: metrics.append(f"avg length: {avg_length:.2f} km")
                if avg_depth: metrics.append(f"avg depth: {avg_depth:.1f} m")
                
                metrics_str = f" ({', '.join(metrics)})" if metrics else ""
                print(f"      {source} {water_type}: {count:,}{metrics_str}")
            
            # Data completeness
            cur.execute("""
                SELECT 
                    COUNT(CASE WHEN area_km2 IS NOT NULL THEN 1 END) as with_area,
                    COUNT(CASE WHEN length_km IS NOT NULL THEN 1 END) as with_length,
                    COUNT(CASE WHEN depth_mean IS NOT NULL THEN 1 END) as with_depth,
                    COUNT(CASE WHEN volume_m3 IS NOT NULL THEN 1 END) as with_volume,
                    COUNT(CASE WHEN ecological_status IS NOT NULL THEN 1 END) as with_eco_status,
                    COUNT(CASE WHEN svar_id IS NOT NULL THEN 1 END) as with_svar_id
                FROM smhi_water_bodies;
            """)
            
            with_area, with_length, with_depth, with_volume, with_eco_status, with_svar_id = cur.fetchone()
            
            if total > 0:
                print(f"   📈 Data completeness:")
                print(f"      Area data: {with_area:,} ({with_area/total*100:.1f}%)")
                print(f"      Length data: {with_length:,} ({with_length/total*100:.1f}%)")
                print(f"      Depth data: {with_depth:,} ({with_depth/total*100:.1f}%)")
                print(f"      Volume data: {with_volume:,} ({with_volume/total*100:.1f}%)")
                print(f"      Ecological status: {with_eco_status:,} ({with_eco_status/total*100:.1f}%)")
                print(f"      SVAR IDs: {with_svar_id:,} ({with_svar_id/total*100:.1f}%)")
            else:
                print(f"   ⚠️ No data imported - check for errors above")

def main():
    """Main function"""
    
    parser = argparse.ArgumentParser(description='Import SMHI water bodies data')
    parser.add_argument('--year', choices=['2016', '2022', 'both'], default='both',
                        help='Which year data to import (default: both)')
    parser.add_argument('--drop-existing', action='store_true',
                        help='Drop existing table before importing')
    parser.add_argument('--batch-size', type=int, default=1000,
                        help='Database import batch size (default: 1000)')
    
    args = parser.parse_args()
    
    print("🇸🇪 SMHI WATER BODIES COMPLETE IMPORT")
    print("=" * 50)
    print(f"Year: {args.year}")
    print(f"Drop existing: {args.drop_existing}")
    print(f"Batch size: {args.batch_size}")
    print()
    
    try:
        # Get database config
        db_config = get_db_config()
        print(f"📡 Database: {db_config['user']}@{db_config['host']}:{db_config['port']}/{db_config['database']}")
        
        # Create temp directory
        temp_dir = Path(tempfile.mkdtemp())
        print(f"📁 Temp directory: {temp_dir}")
        
        # Create table
        create_smhi_table(db_config, drop_existing=args.drop_existing)
        
        # Import data based on year selection
        years_to_import = ['2016', '2022'] if args.year == 'both' else [args.year]
        
        for year in years_to_import:
            print(f"\n{'='*20} IMPORTING {year} DATA {'='*20}")
            
            if year == '2016':
                import_2016_data(temp_dir, db_config, args.batch_size)
            elif year == '2022':
                import_2022_data(temp_dir, db_config, args.batch_size)
        
        # Print summary
        print_summary(db_config)
        
        print(f"\n🎉 SMHI IMPORT COMPLETED!")
        print(f"   New table: smhi_water_bodies")
        print(f"   Your existing OSM water_bodies table is unchanged")
        
        # Cleanup
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        return 0
        
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return 1

def import_2016_data(temp_dir: Path, db_config: dict, batch_size: int):
    """Import 2016 data (shapefiles)"""
    
    all_data = []
    
    for layer_key, layer_info in SMHI_DATA_SOURCES['2016'].items():
        print(f"\n--- {layer_info['description']} ---")
        
        try:
            # Download
            extract_dir = download_smhi_file(layer_info['url'], temp_dir)
            
            # Process
            gdf = process_2016_shapefile(extract_dir, layer_info)
            
            if len(gdf) > 0:
                all_data.append(gdf)
                print(f"✅ Processed: {len(gdf):,} features")
            else:
                print("⚠️ No data after processing")
                
        except Exception as e:
            print(f"❌ Error processing {layer_key}: {e}")
            continue
    
    # Combine and import 2016 data
    if all_data:
        print(f"\n--- COMBINING 2016 DATA ---")
        combined_gdf = pd.concat(all_data, ignore_index=True)
        print(f"📊 Total 2016 features: {len(combined_gdf):,}")
        
        # Import to database
        import_to_database(combined_gdf, db_config, batch_size)
    else:
        print("❌ No 2016 data to import")

def import_2022_data(temp_dir: Path, db_config: dict, batch_size: int):
    """Import 2022 data (GeoPackage)"""
    
    layer_info = SMHI_DATA_SOURCES['2022']['combined']
    print(f"\n--- {layer_info['description']} ---")
    
    try:
        # Download
        extract_dir = download_smhi_file(layer_info['url'], temp_dir)
        
        # Process
        gdf = process_2022_geopackage(extract_dir, layer_info)
        
        if len(gdf) > 0:
            print(f"✅ Processed: {len(gdf):,} features")
            
            # Import to database
            import_to_database(gdf, db_config, batch_size)
        else:
            print("⚠️ No 2022 data after processing")
            
    except Exception as e:
        print(f"❌ Error processing 2022 data: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Verify environment
    if not os.path.exists('.env.local'):
        print("❌ .env.local file not found!")
        print("   Make sure you have DB_HOST, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD")
        sys.exit(1)
    
    # Show what we're about to do
    print("⚠️  This will create/update 'smhi_water_bodies' table")
    print("   Your existing 'water_bodies' (OSM) table will NOT be touched")
    
    response = input("\n🚀 Continue with SMHI import? (y/N): ")
    if response.lower() in ['y', 'yes']:
        sys.exit(main())
    else:
        print("Cancelled.")
        sys.exit(0)