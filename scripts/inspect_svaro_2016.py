#!/usr/bin/env python3
"""
Inspect SVARO_2016.zip to see if it contains water body data with depth/volume
"""

import requests
import zipfile
import tempfile
import geopandas as gpd
import pandas as pd
from pathlib import Path
import fiona

SMHI_BASE_URL = "https://opendata-download.smhi.se/svar/"
SVARO_FILE = "SVARO_2016.zip"

def inspect_svaro_2016():
    """Inspect SVARO_2016.zip for water body data"""
    
    print("🔍 INSPECTING SVARO_2016.zip")
    print("=" * 50)
    
    temp_dir = Path(tempfile.mkdtemp())
    print(f"📁 Temp directory: {temp_dir}")
    
    try:
        # Download
        url = f"{SMHI_BASE_URL}{SVARO_FILE}"
        zip_path = temp_dir / SVARO_FILE
        
        print(f"📥 Downloading {SVARO_FILE} (328MB - this may take a while)...")
        response = requests.get(url, stream=True, timeout=120)
        response.raise_for_status()
        
        downloaded = 0
        with open(zip_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                if downloaded % (10 * 1024 * 1024) == 0:  # Every 10MB
                    print(f"   Downloaded: {downloaded / (1024*1024):.1f} MB")
        
        file_size = zip_path.stat().st_size / (1024*1024)
        print(f"✅ Download complete: {file_size:.1f} MB")
        
        # Extract and analyze
        extract_dir = temp_dir / "extracted"
        extract_dir.mkdir(exist_ok=True)
        
        print("📦 Extracting ZIP...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            files = zip_ref.namelist()
            print(f"   Files in ZIP ({len(files)}):")
            for f in files[:20]:  # Show first 20 files
                print(f"      {f}")
            if len(files) > 20:
                print(f"      ... and {len(files)-20} more files")
            
            zip_ref.extractall(extract_dir)
        
        # Look for interesting files
        print(f"\n📊 ANALYZING EXTRACTED FILES:")
        
        # Find shapefiles and geopackages
        shp_files = list(extract_dir.glob("**/*.shp"))
        gpkg_files = list(extract_dir.glob("**/*.gpkg"))
        
        print(f"   Shapefiles found: {len(shp_files)}")
        print(f"   GeoPackages found: {len(gpkg_files)}")
        
        all_geo_files = [(f, 'shapefile') for f in shp_files] + [(f, 'geopackage') for f in gpkg_files]
        
        for geo_file, file_type in all_geo_files[:5]:  # Inspect first 5 geo files
            print(f"\n{'='*60}")
            print(f"🔍 ANALYZING: {geo_file.name} ({file_type})")
            print(f"{'='*60}")
            
            try:
                if file_type == 'shapefile':
                    gdf = gpd.read_file(geo_file)
                else:  # geopackage
                    # List layers first
                    layers = fiona.listlayers(geo_file)
                    print(f"   Layers: {layers}")
                    
                    # Read first layer
                    gdf = gpd.read_file(geo_file, layer=layers[0] if layers else None)
                
                print(f"📊 Basic info:")
                print(f"   Features: {len(gdf):,}")
                print(f"   CRS: {gdf.crs}")
                
                if len(gdf) > 0:
                    geom_types = gdf.geometry.geom_type.value_counts()
                    print(f"   Geometry types: {dict(geom_types)}")
                
                # Check columns for depth/volume/quality data
                print(f"\n🏷️ COLUMNS ({len(gdf.columns)}):")
                depth_cols = []
                volume_cols = []
                quality_cols = []
                
                for i, col in enumerate(gdf.columns):
                    if col != 'geometry':
                        dtype = str(gdf[col].dtype)
                        non_null = gdf[col].notna().sum() if len(gdf) > 0 else 0
                        pct_filled = (non_null / len(gdf)) * 100 if len(gdf) > 0 else 0
                        
                        # Categorize important columns
                        col_upper = col.upper()
                        if any(word in col_upper for word in ['DEPTH', 'DJUP', 'MEAN', 'MAX', 'MIN']):
                            depth_cols.append(col)
                        elif any(word in col_upper for word in ['VOLUME', 'VOLYM']):
                            volume_cols.append(col)
                        elif any(word in col_upper for word in ['STATUS', 'QUALITY', 'KLASS', 'ECO', 'CHEM']):
                            quality_cols.append(col)
                        
                        print(f"   {i+1:2d}. {col:<25} | {dtype:<12} | {non_null:>6}/{len(gdf):<6} ({pct_filled:5.1f}%)")
                
                # Highlight important findings
                if depth_cols:
                    print(f"\n🏊 DEPTH COLUMNS FOUND: {depth_cols}")
                if volume_cols:
                    print(f"🌊 VOLUME COLUMNS FOUND: {volume_cols}")
                if quality_cols:
                    print(f"🧪 QUALITY COLUMNS FOUND: {quality_cols}")
                
                if depth_cols or volume_cols or quality_cols:
                    print(f"\n🎯 THIS FILE CONTAINS DETAILED WATER DATA!")
                    
                    # Show sample data for important columns
                    important_cols = depth_cols + volume_cols + quality_cols
                    if len(gdf) > 0 and important_cols:
                        sample_cols = ['NAME'] if 'NAME' in gdf.columns else []
                        sample_cols.extend(important_cols[:5])  # First 5 important columns
                        
                        print(f"\n📋 SAMPLE DATA:")
                        sample = gdf[sample_cols].head(3)
                        pd.set_option('display.max_columns', None)
                        pd.set_option('display.width', None)
                        pd.set_option('display.max_colwidth', 30)
                        print(sample.to_string(index=False))
                else:
                    print(f"\n⚠️ No depth/volume/quality columns found")
                
            except Exception as e:
                print(f"❌ Error reading {geo_file.name}: {e}")
                continue
        
        print(f"\n🎉 SVARO_2016 INSPECTION COMPLETE!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        try:
            response = input(f"\n🗑️ Remove temp files? (y/N): ")
            if response.lower() in ['y', 'yes']:
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
                print("✅ Cleaned up")
            else:
                print(f"📁 Files kept in: {temp_dir}")
        except KeyboardInterrupt:
            print(f"\n📁 Files kept in: {temp_dir}")

if __name__ == "__main__":
    inspect_svaro_2016()