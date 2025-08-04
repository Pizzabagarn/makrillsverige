#!/usr/bin/env python3
"""
Inspect SMHI SVAR 2022 GeoPackage file in detail
Check all layers and columns to see what data is actually available
"""

import requests
import zipfile
import tempfile
import geopandas as gpd
import pandas as pd
from pathlib import Path
import fiona

SMHI_BASE_URL = "https://opendata-download.smhi.se/svar/"
GPKG_FILE = "SVAR2022_vattenforekomstavrinningsomraden.zip"

def download_and_inspect_gpkg():
    """Download and thoroughly inspect the SVAR 2022 GeoPackage"""
    
    print("🔍 DETAILED INSPECTION OF SMHI SVAR 2022 GEOPACKAGE")
    print("=" * 60)
    
    # Create temp directory
    temp_dir = Path(tempfile.mkdtemp())
    print(f"📁 Temp directory: {temp_dir}")
    
    try:
        # Download
        url = f"{SMHI_BASE_URL}{GPKG_FILE}"
        zip_path = temp_dir / GPKG_FILE
        
        print(f"📥 Downloading {GPKG_FILE}...")
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        
        with open(zip_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        file_size = zip_path.stat().st_size / (1024*1024)
        print(f"   Downloaded: {file_size:.1f} MB")
        
        # Extract
        extract_dir = temp_dir / "extracted"
        extract_dir.mkdir(exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            files = zip_ref.namelist()
            print(f"   Files in ZIP: {files}")
            zip_ref.extractall(extract_dir)
        
        # Find GeoPackage
        gpkg_files = list(extract_dir.glob("*.gpkg"))
        if not gpkg_files:
            print("❌ No GeoPackage found!")
            return
        
        gpkg_path = gpkg_files[0]
        print(f"\n📊 Analyzing: {gpkg_path.name}")
        
        # List all layers using fiona
        try:
            layers = fiona.listlayers(gpkg_path)
            print(f"\n🏷️ LAYERS IN GEOPACKAGE ({len(layers)}):")
            for i, layer in enumerate(layers, 1):
                print(f"   {i}. {layer}")
            
            # Inspect each layer
            for layer_name in layers:
                print(f"\n{'='*60}")
                print(f"🔍 LAYER: {layer_name}")
                print(f"{'='*60}")
                
                try:
                    # Read layer
                    gdf = gpd.read_file(gpkg_path, layer=layer_name)
                    
                    print(f"📊 Basic info:")
                    print(f"   Features: {len(gdf):,}")
                    print(f"   CRS: {gdf.crs}")
                    
                    # Geometry types
                    if len(gdf) > 0:
                        geom_types = gdf.geometry.geom_type.value_counts()
                        print(f"   Geometry types: {dict(geom_types)}")
                    
                    # All columns
                    print(f"\n🏷️ COLUMNS ({len(gdf.columns)}):")
                    for i, col in enumerate(gdf.columns):
                        if col != 'geometry':
                            dtype = str(gdf[col].dtype)
                            non_null = gdf[col].notna().sum() if len(gdf) > 0 else 0
                            pct_filled = (non_null / len(gdf)) * 100 if len(gdf) > 0 else 0
                            print(f"   {i+1:2d}. {col:<25} | {dtype:<12} | {non_null:>6}/{len(gdf):<6} ({pct_filled:5.1f}%)")
                    
                    # Look for depth/volume/quality columns specifically
                    important_keywords = ['DEPTH', 'DJUP', 'VOLUME', 'VOLYM', 'STATUS', 'QUALITY', 'KLASS', 'ECO', 'CHEM']
                    found_important = []
                    
                    for col in gdf.columns:
                        col_upper = col.upper()
                        for keyword in important_keywords:
                            if keyword in col_upper:
                                found_important.append(col)
                                break
                    
                    if found_important:
                        print(f"\n🎯 IMPORTANT COLUMNS FOUND:")
                        for col in found_important:
                            print(f"   - {col}")
                    else:
                        print(f"\n⚠️ No depth/volume/quality columns found in this layer")
                    
                    # Sample data for important columns
                    sample_cols = [col for col in gdf.columns if col != 'geometry'][:10]  # First 10 non-geometry columns
                    if len(gdf) > 0 and sample_cols:
                        print(f"\n📋 SAMPLE DATA (first 3 rows):")
                        sample = gdf[sample_cols].head(3)
                        pd.set_option('display.max_columns', None)
                        pd.set_option('display.width', None)
                        pd.set_option('display.max_colwidth', 20)
                        print(sample.to_string(index=False))
                    
                    # Check for names
                    name_cols = [col for col in gdf.columns if any(word in col.upper() for word in ['NAME', 'NAMN', 'BETECK'])]
                    if name_cols and len(gdf) > 0:
                        print(f"\n📝 NAME ANALYSIS:")
                        for name_col in name_cols:
                            with_names = gdf[name_col].notna().sum()
                            non_empty = (gdf[name_col].notna() & (gdf[name_col].astype(str).str.strip() != '')).sum()
                            print(f"   {name_col}: {non_empty:,}/{len(gdf):,} ({non_empty/len(gdf)*100:.1f}%) have non-empty names")
                            
                            if non_empty > 0:
                                sample_names = gdf[gdf[name_col].notna() & (gdf[name_col].astype(str).str.strip() != '')][name_col].head(5)
                                print(f"   Sample: {', '.join(sample_names.astype(str))}")
                
                except Exception as e:
                    print(f"❌ Error reading layer {layer_name}: {e}")
                    continue
            
        except ImportError:
            print("⚠️ Fiona not available, using default layer only")
            
            # Fallback to default layer
            gdf = gpd.read_file(gpkg_path)
            print(f"📊 Default layer info:")
            print(f"   Features: {len(gdf):,}")
            print(f"   Columns: {list(gdf.columns)}")
        
        print(f"\n🎉 INSPECTION COMPLETE!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Ask about cleanup
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
    download_and_inspect_gpkg()