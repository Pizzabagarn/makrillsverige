#!/usr/bin/env python3
"""
Återställer metadata.json filer från befintliga bilder
Används för att återskapa metadata efter att de tagits bort av misstag
"""

import json
import os
from pathlib import Path
from datetime import datetime
import re

def extract_timestamp_from_filename(filename):
    """Extrahera timestamp från filnamn"""
    # Matcha pattern som "current_magnitude_2025-07-20T09-00-00.000Z.webp"
    pattern = r'(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.000Z)'
    match = re.search(pattern, filename)
    if match:
        # FIXAT: Skapa korrekt ISO timestamp - bara ändra tid-delen efter T
        filename_timestamp = match.group(1)
        # Dela upp i datum och tid, fixa bara tiden
        date_part = filename_timestamp[:10]  # 2025-07-19 (behåll bindestreck)
        time_part = filename_timestamp[11:]  # 18-00-00.000Z (ändra till kolon)
        return date_part + 'T' + time_part.replace('-', ':')
    return None

def reconstruct_metadata_for_directory(directory_path, parameter_name):
    """Återskapa metadata.json för en directory"""
    dir_path = Path(directory_path)
    if not dir_path.exists():
        print(f"⚠️ Directory finns inte: {directory_path}")
        return
    
    # Hitta alla WebP-filer
    webp_files = list(dir_path.glob('*.webp'))
    if not webp_files:
        print(f"⚠️ Inga WebP-filer hittades i {directory_path}")
        return
    
    print(f"🔄 Återställer metadata för {len(webp_files)} bilder i {directory_path}")
    
    # Skapa metadata struktur
    metadata = {
        "parameter": parameter_name,
        "generated_at": datetime.now().isoformat(),
        "resolution": "1400x1400",  # RÄTT resolution istället för 400x400
        "wgs84_bbox": [10.3, 16.6, 54.9, 59.6],
        "mercator_bbox": [1146590.7551707178, 1847903.5471683415, 7342482.290188272, 8311215.713002437],
        "projection": "EPSG:3857", 
        "total_images": len(webp_files),
        "images": []
    }
    
    # Standardkoordinater (samma som i original scriptet)
    mercator_coords = [
        [1146590.7551707178, 8311215.713002437],  # top-left
        [1847903.5471683415, 8311215.713002437],  # top-right
        [1847903.5471683415, 7342482.290188272],  # bottom-right
        [1146590.7551707178, 7342482.290188272]   # bottom-left
    ]
    
    # Bearbeta varje bild
    for webp_file in sorted(webp_files):
        timestamp = extract_timestamp_from_filename(webp_file.name)
        if not timestamp:
            print(f"⚠️ Kunde inte extrahera timestamp från {webp_file.name}")
            continue
        
        image_info = {
            "timestamp": timestamp,
            "filename": webp_file.name,
            "data_points": 2692,  # Standardvärde
            "value_range": [0.0, 1.0],  # Standardvärde, normaliserat
            "mercator_coordinates": mercator_coords
        }
        
        metadata["images"].append(image_info)
    
    # Sortera bilder efter timestamp
    metadata["images"].sort(key=lambda x: x["timestamp"])
    metadata["total_images"] = len(metadata["images"])
    
    # Spara metadata
    metadata_path = dir_path / 'metadata.json'
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✅ Återställd metadata: {metadata_path} ({len(metadata['images'])} bilder)")
    return metadata

def main():
    """Huvudfunktion som återställer alla metadata-filer"""
    print("🔄 METADATA ÅTERSTÄLLNING - Återställer metadata från befintliga bilder")
    print("=" * 70)
    
    # Directories att återställa
    directories = [
        ("public/data/current-images-mercator", "current"),
        ("public/data/temperature-images-mercator", "temperature"), 
        ("public/data/salinity-images-mercator", "salinity"),
        ("public/data/mackerel-probability-images-mercator", "mackerel")
    ]
    
    total_restored = 0
    
    for directory, parameter in directories:
        metadata = reconstruct_metadata_for_directory(directory, parameter)
        if metadata:
            total_restored += len(metadata["images"])
    
    print(f"\n✅ ÅTERSTÄLLNING KLAR!")
    print(f"📊 Totalt {total_restored} bilder återställda i metadata")
    print(f"🚀 Du kan nu köra: npm run dev")

if __name__ == "__main__":
    main() 