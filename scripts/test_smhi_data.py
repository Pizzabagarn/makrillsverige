#!/usr/bin/env python3
"""
Test script to examine SMHI SVAR 2022 data structure
Downloads and inspects both lakes and rivers data
"""

import requests
import zipfile
import tempfile
import geopandas as gpd
import pandas as pd
from pathlib import Path

# SMHI data sources - actual files found on server
SVAR_LAYERS = {
    'water_bodies_2022': {
        'urls': [
            'SVAR2022_vattenforekomstavrinningsomraden.zip'
        ],
        'description': 'SMHI SVAR 2022 Vattenförekomster med avrinningsområden'
    },
    'water_surfaces_2016': {
        'urls': [
            'Vattenytor_2016.zip'
        ],
        'description': 'SMHI Vattenytor 2016'
    },
    'water_lines_2016': {
        'urls': [
            'Vattendragslinjer_natverk_2016.zip'
        ],
        'description': 'SMHI Vattendragslinjernätverk 2016'
    }
}

SMHI_BASE_URL = "https://opendata-download.smhi.se/svar/"

def try_download_layer(possible_urls: list, layer_desc: str, temp_dir: Path):
    """Try downloading a layer with multiple possible URLs"""
    
    print(f"\n{'='*60}")
    print(f"🔍 TRYING TO FIND: {layer_desc}")
    print(f"{'='*60}")
    
    for i, url_suffix in enumerate(possible_urls, 1):
        url = f"{SMHI_BASE_URL}{url_suffix}"
        print(f"📥 Attempt {i}/{len(possible_urls)}: {url_suffix}")
        
        try:
            response = requests.head(url, timeout=10)  # Just check if exists
            
            if response.status_code == 200:
                print(f"✅ Found! Status: {response.status_code}")
                return download_and_examine_layer(url_suffix, layer_desc, temp_dir)
            else:
                print(f"❌ Status: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
    
    print(f"😞 Could not find any working URL for {layer_desc}")
    return None

def download_and_examine_layer(layer_name: str, layer_desc: str, temp_dir: Path):
    """Download and examine a SMHI layer"""
    
    print(f"\n📊 DOWNLOADING AND EXAMINING: {layer_name}")
    print(f"{'='*60}")
    
    url = f"{SMHI_BASE_URL}{layer_name}"
    zip_path = temp_dir / layer_name
    
    try:
        print(f"📥 Downloading {layer_name}...")
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        
        # Save ZIP
        with open(zip_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        file_size = zip_path.stat().st_size / (1024*1024)  # MB
        print(f"   File size: {file_size:.1f} MB")
        
        # Extract ZIP
        extract_dir = temp_dir / layer_name.replace('.zip', '')
        extract_dir.mkdir(exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            files = zip_ref.namelist()
            print(f"   Files in ZIP: {len(files)}")
            for f in files[:10]:  # Show first 10 files
                print(f"      {f}")
            if len(files) > 10:
                print(f"      ... and {len(files)-10} more files")
                
            zip_ref.extractall(extract_dir)
        
        # Find shapefile
        shp_files = list(extract_dir.glob("*.shp"))
        if not shp_files:
            print("❌ No shapefile found!")
            return None
            
        shp_path = shp_files[0]
        print(f"📊 Shapefile: {shp_path.name}")
        
        # Read with GeoPandas
        print("📖 Reading shapefile...")
        gdf = gpd.read_file(shp_path)
        
        print(f"\n📊 BASIC INFO:")
        print(f"   Total features: {len(gdf):,}")
        print(f"   CRS: {gdf.crs}")
        
        # Geometry types
        geom_types = gdf.geometry.geom_type.value_counts()
        print(f"   Geometry types:")
        for geom_type, count in geom_types.items():
            print(f"      {geom_type}: {count:,}")
        
        # Show columns
        print(f"\n🏷️ COLUMNS ({len(gdf.columns)}):")
        for i, col in enumerate(gdf.columns):
            dtype = str(gdf[col].dtype)
            non_null = gdf[col].notna().sum()
            pct_filled = (non_null / len(gdf)) * 100
            print(f"   {i+1:2d}. {col:<25} | {dtype:<12} | {non_null:>6}/{len(gdf):<6} ({pct_filled:5.1f}%)")
        
        # Sample some key columns if they exist
        key_columns = ['SVAR_ID', 'NAME', 'NAME_SE', 'NAMN', 'AREA', 'LENGTH', 'DEPTH_MEAN', 'DEPTH_MAX', 'VOLUME', 'ECO_STATUS', 'CHEM_STATUS']
        existing_key_cols = [col for col in key_columns if col in gdf.columns]
        
        if existing_key_cols:
            print(f"\n📋 SAMPLE DATA (first 5 rows of key columns):")
            sample = gdf[existing_key_cols].head()
            pd.set_option('display.max_columns', None)
            pd.set_option('display.width', None)
            pd.set_option('display.max_colwidth', 30)
            print(sample.to_string(index=False))
        
        # Check for names - try multiple name columns
        name_columns = [col for col in gdf.columns if any(word in col.upper() for word in ['NAME', 'NAMN'])]
        if name_columns:
            print(f"\n📝 NAME ANALYSIS:")
            for name_col in name_columns:
                total = len(gdf)
                with_names = gdf[name_col].notna().sum()
                non_empty = (gdf[name_col].notna() & (gdf[name_col].astype(str).str.strip() != '')).sum()
                print(f"   {name_col}: {non_empty:,}/{total:,} ({non_empty/total*100:.1f}%) have non-empty names")
                
                if non_empty > 0:
                    sample_names = gdf[gdf[name_col].notna() & (gdf[name_col].astype(str).str.strip() != '')][name_col].head(10)
                    print(f"   Sample names: {', '.join(sample_names.astype(str))}")
        
        # Geometry bounds
        bounds = gdf.total_bounds
        print(f"\n🗺️ GEOGRAPHIC EXTENT:")
        print(f"   Min X (West):  {bounds[0]:.6f}")
        print(f"   Min Y (South): {bounds[1]:.6f}")
        print(f"   Max X (East):  {bounds[2]:.6f}")
        print(f"   Max Y (North): {bounds[3]:.6f}")
        
        # Area/Length statistics if available
        numeric_cols = ['AREA', 'LENGTH', 'DEPTH_MEAN', 'DEPTH_MAX', 'VOLUME']
        for col in numeric_cols:
            if col in gdf.columns:
                # Convert to numeric
                numeric_data = pd.to_numeric(gdf[col], errors='coerce')
                valid_data = numeric_data.dropna()
                
                if len(valid_data) > 0:
                    print(f"\n📊 {col} STATISTICS:")
                    print(f"   Valid values: {len(valid_data):,}/{len(gdf):,} ({len(valid_data)/len(gdf)*100:.1f}%)")
                    print(f"   Min: {valid_data.min():,.2f}")
                    print(f"   Mean: {valid_data.mean():,.2f}")
                    print(f"   Max: {valid_data.max():,.2f}")
                    
                    if col == 'AREA':
                        # Convert to km² for lakes
                        area_km2 = valid_data / 1000000
                        print(f"   Mean area: {area_km2.mean():.3f} km²")
                        print(f"   Largest: {area_km2.max():.2f} km²")
                        print(f"   Smallest: {area_km2.min():.6f} km²")
                    elif col == 'LENGTH':
                        # Convert to km for rivers  
                        length_km = valid_data / 1000
                        print(f"   Mean length: {length_km.mean():.2f} km")
                        print(f"   Longest: {length_km.max():.2f} km")
        
        # Status columns
        status_cols = [col for col in gdf.columns if 'STATUS' in col.upper()]
        for col in status_cols:
            if col in gdf.columns:
                print(f"\n🏥 {col} VALUES:")
                value_counts = gdf[col].value_counts(dropna=False)
                for value, count in value_counts.head(10).items():
                    pct = (count / len(gdf)) * 100
                    print(f"   {str(value):<20}: {count:>6} ({pct:5.1f}%)")
                    
        return gdf
        
    except Exception as e:
        print(f"❌ Error examining {layer_name}: {e}")
        import traceback
        traceback.print_exc()
        return None

def check_svar_directory():
    """Try to list what's actually available in SVAR directory"""
    
    print(f"\n{'='*60}")
    print(f"🔍 CHECKING WHAT'S AVAILABLE IN SVAR DIRECTORY")
    print(f"{'='*60}")
    
    # Try to get directory listing (might not work but worth trying)
    try:
        response = requests.get(SMHI_BASE_URL, timeout=10)
        if response.status_code == 200:
            print("Directory listing found:")
            print(response.text[:1000])  # Show first 1000 chars
        else:
            print(f"Directory listing not available (status: {response.status_code})")
    except Exception as e:
        print(f"Could not get directory listing: {e}")
    
    # Try some common SVAR file patterns
    common_patterns = [
        'SVAR2022_sjovattenforekomster.zip',
        'SVAR2022_vattendragsvattenforekomster.zip',
        'SVAR2023_sjovattenforekomster.zip',
        'SVAR2023_vattendragsvattenforekomster.zip',
        'SVAR_sjovattenforekomster.zip',
        'SVAR_vattendragsvattenforekomster.zip',
        'sjovattenforekomster.zip',
        'vattendragsvattenforekomster.zip'
    ]
    
    print(f"\n🔍 Testing common file patterns:")
    available_files = []
    
    for pattern in common_patterns:
        try:
            url = f"{SMHI_BASE_URL}{pattern}"
            response = requests.head(url, timeout=5)
            status = "✅ Available" if response.status_code == 200 else f"❌ {response.status_code}"
            print(f"   {pattern:<40} {status}")
            if response.status_code == 200:
                available_files.append(pattern)
        except Exception as e:
            print(f"   {pattern:<40} ❌ Error: {str(e)[:30]}")
    
    return available_files

def main():
    """Main test function"""
    
    print("🇸🇪 SMHI SVAR DATA EXAMINATION")
    print("Testing data structure for both lakes and rivers\n")
    
    # First check what's actually available
    print("Step 1: Checking what files are available...")
    available_files = check_svar_directory()
    
    if available_files:
        print(f"\n✅ Found {len(available_files)} available files!")
        for f in available_files:
            print(f"   - {f}")
    else:
        print("\n⚠️ No files found with standard naming - will try alternative patterns")
    
    # Create temp directory
    temp_dir = Path(tempfile.mkdtemp())
    print(f"\n📁 Temp directory: {temp_dir}")
    
    results = {}
    
    try:
        # Examine each layer type
        for layer_key, layer_info in SVAR_LAYERS.items():
            print(f"\nStep 2: Examining {layer_key}...")
            gdf = try_download_layer(
                layer_info['urls'], 
                layer_info['description'], 
                temp_dir
            )
            if gdf is not None:
                results[layer_key] = gdf
        
        # Summary comparison
        if results:
            print(f"\n{'='*60}")
            print(f"📊 FINAL SUMMARY")
            print(f"{'='*60}")
            
            for layer_key, gdf in results.items():
                layer_desc = SVAR_LAYERS[layer_key]['description']
                name_cols = [col for col in gdf.columns if any(word in col.upper() for word in ['NAME', 'NAMN'])]
                
                with_names = 0
                if name_cols:
                    main_name_col = name_cols[0]
                    with_names = (gdf[main_name_col].notna() & (gdf[main_name_col].astype(str).str.strip() != '')).sum()
                
                print(f"\n{layer_desc}:")
                print(f"   Features: {len(gdf):,}")
                print(f"   With names: {with_names:,} ({with_names/len(gdf)*100:.1f}%)")
                print(f"   Columns: {len(gdf.columns)}")
                print(f"   CRS: {gdf.crs}")
                
                # Show some important columns if available
                important_cols = ['AREA', 'LENGTH', 'DEPTH_MEAN', 'VOLUME']
                has_data = []
                for col in important_cols:
                    if col in gdf.columns:
                        valid_count = pd.to_numeric(gdf[col], errors='coerce').notna().sum()
                        if valid_count > 0:
                            has_data.append(f"{col}({valid_count})")
                
                if has_data:
                    print(f"   Data available: {', '.join(has_data)}")
            
            print(f"\n🎉 EXAMINATION COMPLETE!")
            print(f"   Found {len(results)} out of {len(SVAR_LAYERS)} layer types")
            
            if len(results) == len(SVAR_LAYERS):
                print(f"   ✅ Ready to proceed with full import script")
            else:
                missing = set(SVAR_LAYERS.keys()) - set(results.keys())
                print(f"   ⚠️ Missing layers: {', '.join(missing)}")
                print(f"   You can still proceed with available data")
        else:
            print(f"\n❌ No data found - check URLs or connectivity")
        
    except Exception as e:
        print(f"❌ Error during examination: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Ask if user wants to clean up temp files
        try:
            response = input(f"\n🗑️ Remove temp files in {temp_dir}? (y/N): ")
            if response.lower() in ['y', 'yes']:
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
                print("✅ Temp files cleaned up")
            else:
                print(f"📁 Temp files kept in: {temp_dir}")
        except KeyboardInterrupt:
            print(f"\n📁 Temp files kept in: {temp_dir}")

if __name__ == "__main__":
    main()