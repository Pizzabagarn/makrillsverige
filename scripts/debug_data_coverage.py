#!/usr/bin/env python3
import json
import gzip
import matplotlib.pyplot as plt
import numpy as np

def load_area_parameters(file_path):
    """Ladda och dekomprimera area-parameters data"""
    print(f"📦 Laddar area-parameters från {file_path}")
    
    with gzip.open(file_path, 'rt', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"✅ Laddade {len(data['points'])} punkter med {len(data['metadata']['timestamps'])} tidssteg")
    return data

def analyze_data_coverage():
    # Hårdkodad bbox (samma som i scripts)
    bbox = (10.3, 16.6, 54.9, 59.6)  # lon_min, lon_max, lat_min, lat_max
    
    # Ladda data
    area_data = load_area_parameters('public/data/area-parameters-extended.json.gz')
    
    # Extrahera alla punkter
    lons = []
    lats = []
    salinity_points = []
    current_points = []
    
    # Ta första tidsstämpeln för analys
    target_time = "2025-06-29T12:00:00.000Z"
    
    for point in area_data['points']:
        lat, lon = point['lat'], point['lon']
        
        # Kolla om punkten är inom bbox
        if bbox[0] <= lon <= bbox[1] and bbox[2] <= lat <= bbox[3]:
            lons.append(lon)
            lats.append(lat)
            
            # Kolla vad för data som finns
            for data_entry in point['data']:
                if data_entry['time'] == target_time:
                    if 'salinity' in data_entry and data_entry['salinity'] is not None:
                        salinity_points.append((lon, lat))
                    if 'current' in data_entry and data_entry['current']:
                        u = data_entry['current'].get('u')
                        v = data_entry['current'].get('v')
                        if u is not None and v is not None:
                            current_points.append((lon, lat))
                    break
    
    lons = np.array(lons)
    lats = np.array(lats)
    
    print(f"\n🗺️ BBOX COVERAGE ANALYS för {target_time}")
    print(f"📦 Bbox: {bbox}")
    print(f"📍 Totalt {len(lons)} punkter inom bbox")
    print(f"🧂 {len(salinity_points)} punkter med salinity-data")
    print(f"🌊 {len(current_points)} punkter med current-data")
    
    # Analysera täckning
    if len(lons) > 0:
        actual_bounds = (np.min(lons), np.max(lons), np.min(lats), np.max(lats))
        print(f"📏 Faktiska data-gränser: {actual_bounds}")
        
        # Beräkna avstånd till bbox-kanter
        lon_gap_left = actual_bounds[0] - bbox[0]
        lon_gap_right = bbox[1] - actual_bounds[1] 
        lat_gap_bottom = actual_bounds[2] - bbox[2]
        lat_gap_top = bbox[3] - actual_bounds[3]
        
        print(f"📐 Gap till bbox-kanter:")
        print(f"   Vänster:  {lon_gap_left:.3f}° ({lon_gap_left*111:.1f}km)")
        print(f"   Höger:    {lon_gap_right:.3f}° ({lon_gap_right*111:.1f}km)")
        print(f"   Botten:   {lat_gap_bottom:.3f}° ({lat_gap_bottom*111:.1f}km)")
        print(f"   Topp:     {lat_gap_top:.3f}° ({lat_gap_top*111:.1f}km)")
    
    # Visualisera
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
    
    # Plot 1: Alla punkter
    ax1.scatter(lons, lats, c='blue', s=1, alpha=0.6, label=f'Alla punkter ({len(lons)})')
    
    # Rita bbox
    bbox_x = [bbox[0], bbox[1], bbox[1], bbox[0], bbox[0]]
    bbox_y = [bbox[2], bbox[2], bbox[3], bbox[3], bbox[2]]
    ax1.plot(bbox_x, bbox_y, 'r-', linewidth=2, label='Target Bbox')
    
    # Rita faktiska gränser
    if len(lons) > 0:
        actual_x = [actual_bounds[0], actual_bounds[1], actual_bounds[1], actual_bounds[0], actual_bounds[0]]
        actual_y = [actual_bounds[2], actual_bounds[2], actual_bounds[3], actual_bounds[3], actual_bounds[2]]
        ax1.plot(actual_x, actual_y, 'g--', linewidth=2, label='Faktiska data-gränser')
    
    ax1.set_xlabel('Longitude')
    ax1.set_ylabel('Latitude')
    ax1.set_title('Data Point Coverage')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Plot 2: Salinity vs Current coverage
    if salinity_points:
        sal_lons, sal_lats = zip(*salinity_points)
        ax2.scatter(sal_lons, sal_lats, c='green', s=2, alpha=0.7, label=f'Salinity ({len(salinity_points)})')
    
    if current_points:
        cur_lons, cur_lats = zip(*current_points)
        ax2.scatter(cur_lons, cur_lats, c='blue', s=2, alpha=0.7, label=f'Current ({len(current_points)})')
    
    ax2.plot(bbox_x, bbox_y, 'r-', linewidth=2, label='Target Bbox')
    ax2.set_xlabel('Longitude')
    ax2.set_ylabel('Latitude')
    ax2.set_title('Parameter-Specific Coverage')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('data_coverage_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()
    
    print(f"\n💾 Analys sparad som 'data_coverage_analysis.png'")

if __name__ == "__main__":
    analyze_data_coverage() 