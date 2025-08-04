#!/usr/bin/env python3
"""
Import SMHI SVAR 2022 water bodies to separate table
Creates a new smhi_water_bodies table with all SMHI water data (lakes + rivers)
Does NOT touch existing OSM water_bodies table or logic
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

# Load environment variables from .env.local
load_dotenv('.env.local')

# SMHI SVAR 2022 data sources
SVAR_LAYERS = {
    'lakes': {
        'name': 'SVAR2022_sjovattenforekomster.zip',
        'url_suffix': 'SVAR2022_sjovattenforekomster.zip',
        'description': 'SMHI Sjövattenförekomster (lakes)',
        'water_type': 'lake'
    },
    'rivers': {
        'name': 'SVAR2022_vattendragsvattenforekomster.zip', 
        'url_suffix': 'SVAR2022_vattendragsvattenforekomster.zip',
        'description': 'SMHI Vattendragsvattenförekomster (rivers)',
        'water_type': 'river'
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

def download_smhi_layer(layer_name: str, temp_dir: Path) -> Path:
    """Download SMHI SVAR ZIP file"""
    url = f"{SMHI_BASE_URL}{layer_name}"
    zip_path = temp_dir / layer_name
    
    print(f"📥 Laddar ner {layer_name}...")
    
    try:
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        
        with open(zip_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        # Extract ZIP
        extract_dir = temp_dir / layer_name.replace('.zip', '')
        extract_dir.mkdir(exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # Find shapefile
        shp_files = list(extract_dir.glob("*.shp"))
        if not shp_files:
            raise FileNotFoundError(f"No .shp file found in {layer_name}")
        
        print(f"✅ Downloaded and extracted: {shp_files[0].name}")
        return shp_files[0]
        
    except Exception as e:
        print(f"❌ Error downloading {layer_name}: {e}")
        raise

def process_smhi_data(shp_path: Path, water_type: str) -> gpd.GeoDataFrame:
    """Process SMHI shapefile and clean data"""
    
    print(f"📊 Processing {shp_path.name}...")
    
    # Read shapefile
    gdf = gpd.read_file(shp_path)
    
    print(f"   Raw features: {len(gdf)}")
    
    # Convert to EPSG:4326 (same as OSM data)
    if gdf.crs and gdf.crs.to_string() != 'EPSG:4326':
        print(f"   Converting from {gdf.crs} to EPSG:4326...")
        gdf = gdf.to_crs('EPSG:4326')
    
    # Add water_type column
    gdf['water_type'] = water_type
    
    # Clean and standardize column names
    # Common SMHI columns we want to keep
    column_mapping = {
        'SVAR_ID': 'svar_id',
        'EU_CD': 'eu_cd', 
        'MS_CD': 'ms_cd',
        'NAME': 'name',
        'NAME_SE': 'name',  # Fallback to Swedish name
        'AREA': 'area_m2',
        'LENGTH': 'length_m',
        'DEPTH_MEAN': 'depth_mean_m',
        'DEPTH_MAX': 'depth_max_m', 
        'DEPTH_MIN': 'depth_min_m',
        'VOLUME': 'volume_m3',
        'ECO_STATUS': 'ecological_status',
        'CHEM_STATUS': 'chemical_status',
        'geometry': 'geometry'
    }
    
    # Keep only columns that exist
    available_columns = {}
    for old_col, new_col in column_mapping.items():
        if old_col in gdf.columns:
            available_columns[old_col] = new_col
    
    # Rename columns
    gdf = gdf.rename(columns=available_columns)
    
    # Select only the columns we mapped
    keep_columns = list(available_columns.values()) + ['water_type']
    existing_columns = [col for col in keep_columns if col in gdf.columns]
    gdf = gdf[existing_columns]
    
    # Filter out records without names
    if 'name' in gdf.columns:
        before_filter = len(gdf)
        gdf = gdf[gdf['name'].notna() & (gdf['name'].str.strip() != '')]
        after_filter = len(gdf)
        print(f"   Filtered out {before_filter - after_filter} records without names")
    
    # Convert numeric columns
    numeric_columns = ['area_m2', 'length_m', 'depth_mean_m', 'depth_max_m', 'depth_min_m', 'volume_m3']
    for col in numeric_columns:
        if col in gdf.columns:
            gdf[col] = pd.to_numeric(gdf[col], errors='coerce')
    
    # Add metadata
    gdf['source'] = 'SMHI_SVAR_2022'
    gdf['imported_at'] = pd.Timestamp.now()
    
    print(f"   Processed features: {len(gdf)}")
    return gdf

def create_smhi_table(db_config: dict):
    """Create the smhi_water_bodies table"""
    
    print("🗂️ Creating smhi_water_bodies table...")
    
    with psycopg2.connect(**db_config) as conn:
        with conn.cursor() as cur:
            # Drop existing table if it exists
            cur.execute("DROP TABLE IF EXISTS smhi_water_bodies CASCADE;")
            
            # Create new table
            cur.execute("""
                CREATE TABLE smhi_water_bodies (
                    id BIGSERIAL PRIMARY KEY,
                    svar_id TEXT,
                    eu_cd TEXT,
                    ms_cd TEXT,
                    name TEXT NOT NULL,
                    water_type TEXT NOT NULL,
                    area_m2 NUMERIC,
                    area_km2 NUMERIC GENERATED ALWAYS AS (area_m2 / 1000000.0) STORED,
                    length_m NUMERIC,
                    length_km NUMERIC GENERATED ALWAYS AS (length_m / 1000.0) STORED,
                    depth_mean_m NUMERIC,
                    depth_max_m NUMERIC,
                    depth_min_m NUMERIC,
                    volume_m3 NUMERIC,
                    ecological_status TEXT,
                    chemical_status TEXT,
                    source TEXT DEFAULT 'SMHI_SVAR_2022',
                    imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    geometry GEOMETRY(GEOMETRY, 4326)
                );
            """)
            
            # Create indexes
            cur.execute("""
                CREATE INDEX idx_smhi_water_bodies_geometry ON smhi_water_bodies USING GIST(geometry);
                CREATE INDEX idx_smhi_water_bodies_name ON smhi_water_bodies(name);
                CREATE INDEX idx_smhi_water_bodies_water_type ON smhi_water_bodies(water_type);
                CREATE INDEX idx_smhi_water_bodies_svar_id ON smhi_water_bodies(svar_id) WHERE svar_id IS NOT NULL;
                CREATE INDEX idx_smhi_water_bodies_area ON smhi_water_bodies(area_km2) WHERE area_km2 IS NOT NULL;
            """)
            
            # Enable RLS (Row Level Security) to match existing pattern
            cur.execute("""
                ALTER TABLE smhi_water_bodies ENABLE ROW LEVEL SECURITY;
                
                CREATE POLICY "Allow public read access" ON smhi_water_bodies
                    FOR SELECT USING (true);
                    
                CREATE POLICY "Allow authenticated write" ON smhi_water_bodies
                    FOR ALL WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');
            """)
        
        conn.commit()
        print("✅ Table created successfully")

def import_to_database(gdf: gpd.GeoDataFrame, db_config: dict):
    """Import GeoDataFrame to smhi_water_bodies table"""
    
    print(f"📊 Importing {len(gdf)} features to database...")
    
    # Create SQLAlchemy engine
    engine = create_engine(
        f"postgresql://{db_config['user']}:{db_config['password']}@"
        f"{db_config['host']}:{db_config['port']}/{db_config['database']}"
    )
    
    # Import to PostGIS (append to existing table)
    gdf.to_postgis('smhi_water_bodies', engine, if_exists='append', index=False)
    
    print("✅ Import completed")

def print_summary(db_config: dict):
    """Print summary statistics"""
    
    print("\n📊 IMPORT SUMMARY:")
    
    with psycopg2.connect(**db_config) as conn:
        with conn.cursor() as cur:
            # Total count
            cur.execute("SELECT COUNT(*) FROM smhi_water_bodies;")
            total = cur.fetchone()[0]
            
            # By water type
            cur.execute("""
                SELECT water_type, COUNT(*), 
                       AVG(area_km2) as avg_area_km2,
                       AVG(depth_mean_m) as avg_depth_m
                FROM smhi_water_bodies 
                GROUP BY water_type 
                ORDER BY COUNT(*) DESC;
            """)
            
            print(f"   🗂️ Total water bodies: {total:,}")
            print(f"   📋 Breakdown by type:")
            
            for water_type, count, avg_area, avg_depth in cur.fetchall():
                area_str = f", avg area: {avg_area:.2f} km²" if avg_area else ""
                depth_str = f", avg depth: {avg_depth:.1f} m" if avg_depth else ""
                print(f"      {water_type}: {count:,}{area_str}{depth_str}")
            
            # Data completeness
            cur.execute("""
                SELECT 
                    COUNT(CASE WHEN area_km2 IS NOT NULL THEN 1 END) as with_area,
                    COUNT(CASE WHEN depth_mean_m IS NOT NULL THEN 1 END) as with_depth,
                    COUNT(CASE WHEN volume_m3 IS NOT NULL THEN 1 END) as with_volume,
                    COUNT(CASE WHEN ecological_status IS NOT NULL THEN 1 END) as with_eco_status
                FROM smhi_water_bodies;
            """)
            
            with_area, with_depth, with_volume, with_eco_status = cur.fetchone()
            
            print(f"   📈 Data completeness:")
            print(f"      Area data: {with_area:,} ({with_area/total*100:.1f}%)")
            print(f"      Depth data: {with_depth:,} ({with_depth/total*100:.1f}%)")
            print(f"      Volume data: {with_volume:,} ({with_volume/total*100:.1f}%)")
            print(f"      Ecological status: {with_eco_status:,} ({with_eco_status/total*100:.1f}%)")

def main():
    """Main function"""
    
    print("🇸🇪 SMHI WATER BODIES IMPORT")
    print("Creates separate smhi_water_bodies table (does not touch OSM data)\n")
    
    try:
        # Get database config
        db_config = get_db_config()
        print(f"📡 Database: {db_config['user']}@{db_config['host']}:{db_config['port']}/{db_config['database']}")
        
        # Create temp directory
        temp_dir = Path(tempfile.mkdtemp())
        print(f"📁 Temp directory: {temp_dir}")
        
        # Create table
        create_smhi_table(db_config)
        
        # Process each SMHI layer
        all_data = []
        
        for layer_key, layer_info in SVAR_LAYERS.items():
            print(f"\n--- {layer_info['description']} ---")
            
            try:
                # Download
                shp_path = download_smhi_layer(layer_info['url_suffix'], temp_dir)
                
                # Process
                gdf = process_smhi_data(shp_path, layer_info['water_type'])
                
                if len(gdf) > 0:
                    all_data.append(gdf)
                else:
                    print("⚠️ No data after filtering")
                    
            except Exception as e:
                print(f"❌ Error processing {layer_key}: {e}")
                continue
        
        # Combine all data
        if all_data:
            print(f"\n--- COMBINING DATA ---")
            combined_gdf = pd.concat(all_data, ignore_index=True)
            print(f"📊 Total combined features: {len(combined_gdf)}")
            
            # Import to database
            import_to_database(combined_gdf, db_config)
            
            # Print summary
            print_summary(db_config)
            
        else:
            print("❌ No data to import")
            return 1
        
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

if __name__ == "__main__":
    # Verify environment
    if not os.path.exists('.env.local'):
        print("❌ .env.local file not found!")
        print("   Make sure you have DB_HOST, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD")
        sys.exit(1)
    
    # Show what we're about to do
    print("⚠️  This will create a new 'smhi_water_bodies' table")
    print("   Your existing 'water_bodies' (OSM) table will NOT be touched")
    
    response = input("\n🚀 Continue with SMHI import? (y/N): ")
    if response.lower() in ['y', 'yes']:
        sys.exit(main())
    else:
        print("Cancelled.")
        sys.exit(0)