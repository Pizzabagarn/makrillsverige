#!/usr/bin/env python3
"""
Fix Swedish GeoJSON Format
===========================
Konverterar svenska administrative gränser från array-format till standard GeoJSON FeatureCollection
"""

import json
from pathlib import Path

def fix_geojson_format(input_file, output_file):
    """Konvertera array-format till standard GeoJSON FeatureCollection"""
    
    print(f"🔧 Fixar format för {input_file.name}...")
    
    try:
        # Läs den råa JSON-arrayen
        with open(input_file, 'r', encoding='utf-8') as f:
            features_array = json.load(f)
        
        if not isinstance(features_array, list):
            print(f"   ⚠️ Filen är redan i korrekt format")
            return input_file
        
        # Skapa standard GeoJSON FeatureCollection
        geojson = {
            "type": "FeatureCollection",
            "features": []
        }
        
        # Konvertera varje objekt till en Feature
        for item in features_array:
            if "geometry" in item:
                feature = {
                    "type": "Feature",
                    "geometry": item["geometry"],
                    "properties": {k: v for k, v in item.items() if k != "geometry"}
                }
                geojson["features"].append(feature)
        
        # Spara som standard GeoJSON
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(geojson, f, ensure_ascii=False, indent=2)
        
        print(f"   ✅ {len(geojson['features'])} features konverterade till {output_file.name}")
        return output_file
        
    except Exception as e:
        print(f"   ❌ Fel vid konvertering: {e}")
        return None

def main():
    downloads_dir = Path("administrative_data_downloads")
    
    # Hitta svenska filer som behöver fixas
    swedish_files = list(downloads_dir.glob("sweden_*.geojson"))
    
    if not swedish_files:
        print("❌ Inga svenska GeoJSON-filer hittades!")
        return
    
    print("🔧 FIXING SWEDISH GEOJSON FORMAT")
    print("=" * 40)
    
    fixed_files = []
    
    for file_path in swedish_files:
        output_path = file_path.parent / f"{file_path.stem}_fixed.geojson"
        result = fix_geojson_format(file_path, output_path)
        
        if result:
            fixed_files.append(result)
            # Ersätt originalfilen med den fixade
            file_path.unlink()  # Ta bort original
            result.rename(file_path)  # Byt namn på fixad till original
            print(f"   🔄 Ersatte {file_path.name} med fixad version")
    
    print(f"\n🎉 {len(fixed_files)} svenska filer fixade!")
    print("▶️ Nu kan du köra validering igen...")

if __name__ == "__main__":
    main()