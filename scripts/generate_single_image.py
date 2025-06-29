#!/usr/bin/env python3
"""
Generera bara en specifik bild för snabb testning
"""

import sys
import os
sys.path.append('scripts')

# Importera från huvudscriptet
from generate_current_magnitude_images import (
    load_water_mask, load_area_parameters, create_water_point_cache,
    create_water_mask_grid, extract_current_data_for_timestamp,
    create_interpolated_image, get_bbox_from_water_mask
)
from pathlib import Path

def generate_single_image(timestamp):
    """Generera en enda bild för testning"""
    
    print(f"🎯 Genererar bara bild för: {timestamp}")
    
    # Ladda data
    water_polygons = load_water_mask('public/data/scandinavian-waters.geojson')
    area_data = load_area_parameters('public/data/area-parameters-extended.json.gz')
    
    # Beräkna bounding box
    bbox = get_bbox_from_water_mask(water_polygons)
    print(f"🗺️ Bounding box: {bbox}")
    
    # Skapa caches (snabbare för en bild)
    resolution = 1200  # Lägre upplösning för snabb testning
    water_point_cache = create_water_point_cache(area_data, water_polygons)
    water_mask_grid = create_water_mask_grid(water_polygons, bbox, resolution)
    
    # Generera bilden
    timestamp_prefix = timestamp[:13]  # "2025-06-29T14"
    safe_timestamp = timestamp.replace(':', '-').replace('+', 'plus')
    output_path = Path(f"public/data/current-magnitude-images/current_magnitude_{safe_timestamp}.png")
    
    print(f"📸 Extraherar data för {timestamp_prefix}...")
    lons, lats, magnitudes = extract_current_data_for_timestamp(
        area_data, timestamp_prefix, water_point_cache
    )
    
    print(f"🔢 Hittade {len(lons)} datapunkter")
    if len(lons) > 0:
        print(f"📊 Magnitude range: {magnitudes.min():.3f} - {magnitudes.max():.3f} m/s")
        print(f"   Det är {magnitudes.min()*1.944:.2f} - {magnitudes.max()*1.944:.2f} knop")
    
    if len(lons) > 0:
        success = create_interpolated_image(
            lons, lats, magnitudes, water_mask_grid, 
            output_path, timestamp, bbox
        )
        if success:
            print(f"✅ Bild genererad: {output_path}")
            return True
    else:
        print(f"❌ Ingen data för {timestamp}")
    
    return False

if __name__ == "__main__":
    # Generera bara 14:00 bilden för testning
    test_timestamp = "2025-06-29T14:00:00.000Z"
    success = generate_single_image(test_timestamp)
    
    if success:
        print(f"\n🎉 Klar! Nu kan du testa bilden i appen.")
        print(f"💡 Om den nu visar rätt färg (orange/röd), kan du köra:")
        print(f"   python scripts/generate_current_magnitude_images.py")
        print(f"   för att regenerera alla bilder med fixen.") 