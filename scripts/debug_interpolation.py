#!/usr/bin/env python3
"""
Debug interpolation specifikt för Drogden Lt-området
"""

import json
import gzip
import numpy as np
import matplotlib.pyplot as plt
from scipy.interpolate import griddata
from scipy.spatial import ConvexHull
from pathlib import Path

def debug_interpolation_around_point(target_lat, target_lon, time_target):
    """Debug interpolation runt en specifik punkt"""
    
    # Ladda data
    data_path = Path('public/data/area-parameters-extended.json.gz')
    with gzip.open(data_path, 'rt', encoding='utf-8') as f:
        area_data = json.load(f)
    
    print(f"🔍 Debugging interpolation runt ({target_lat}, {target_lon})")
    
    # Extrahera alla punkter med strömdata för rätt tid
    lons, lats, magnitudes = [], [], []
    all_points = []
    
    for point in area_data['points']:
        lat, lon = point['lat'], point['lon']
        
        # Hitta data för rätt tid
        for data_entry in point['data']:
            if data_entry['time'].startswith(time_target):
                if 'current' in data_entry and data_entry['current']:
                    u = data_entry['current'].get('u')
                    v = data_entry['current'].get('v')
                    
                    if u is not None and v is not None:
                        magnitude = np.sqrt(u**2 + v**2)
                        lons.append(lon)
                        lats.append(lat)
                        magnitudes.append(magnitude)
                        all_points.append((lat, lon, magnitude))
                break
    
    lons = np.array(lons)
    lats = np.array(lats)
    magnitudes = np.array(magnitudes)
    
    print(f"📊 Totalt {len(lons)} datapunkter med strömdata")
    print(f"📊 Magnitude range: {magnitudes.min():.3f} - {magnitudes.max():.3f} m/s")
    
    # Hitta punkter nära target
    radius = 0.1  # 0.1 grader = ~11km
    distances = np.sqrt((lats - target_lat)**2 + (lons - target_lon)**2)
    nearby_mask = distances <= radius
    nearby_count = np.sum(nearby_mask)
    
    print(f"📍 {nearby_count} punkter inom {radius}° av target")
    
    if nearby_count > 0:
        nearby_mags = magnitudes[nearby_mask]
        print(f"   Magnitude i närheten: {nearby_mags.min():.3f} - {nearby_mags.max():.3f} m/s")
        print(f"   Det är {nearby_mags.min()*1.944:.2f} - {nearby_mags.max()*1.944:.2f} knop")
    
    # Skapa convex hull för att se om target är inuti
    if len(lons) >= 3:
        points_2d = np.column_stack([lons, lats])
        try:
            hull = ConvexHull(points_2d)
            hull_points = points_2d[hull.vertices]
            
            # Kolla om target är inuti convex hull
            from matplotlib.path import Path as MplPath
            hull_path = MplPath(hull_points)
            is_inside = hull_path.contains_point([target_lon, target_lat])
            
            print(f"🔶 Convex hull: {len(hull.vertices)} vertices")
            print(f"🎯 Target är {'INUTI' if is_inside else 'UTANFÖR'} convex hull")
            
            if not is_inside:
                print(f"❌ Detta förklarar blå färg! Target får fill_value istället för interpolerat värde")
                
                # Hitta närmaste hull-punkt
                hull_distances = np.sqrt(np.sum((hull_points - [target_lon, target_lat])**2, axis=1))
                min_dist_idx = np.argmin(hull_distances)
                nearest_hull_point = hull_points[min_dist_idx]
                min_distance = hull_distances[min_dist_idx]
                
                print(f"📍 Närmaste hull-punkt: ({nearest_hull_point[1]:.4f}, {nearest_hull_point[0]:.4f})")
                print(f"📏 Avstånd till hull: {min_distance:.4f}° (~{min_distance*111:.1f}km)")
            
        except Exception as e:
            print(f"❌ Kunde inte skapa convex hull: {e}")
    
    # Testa faktisk interpolation på en liten grid runt target
    print(f"\n🧪 Testar interpolation på liten grid runt target...")
    
    margin = 0.05  # 0.05 grader margin
    test_lons = np.linspace(target_lon - margin, target_lon + margin, 11)
    test_lats = np.linspace(target_lat - margin, target_lat + margin, 11)
    test_lon_mesh, test_lat_mesh = np.meshgrid(test_lons, test_lats)
    
    try:
        # Testa med fill_value=0 (gamla metoden)
        test_result_0 = griddata(
            (lons, lats), magnitudes, 
            (test_lon_mesh, test_lat_mesh), 
            method='linear', fill_value=0
        )
        
        # Testa med fill_value=nan (nya metoden)
        test_result_nan = griddata(
            (lons, lats), magnitudes, 
            (test_lon_mesh, test_lat_mesh), 
            method='linear', fill_value=np.nan
        )
        
        # Kolla värdet vid target (center av grid)
        center_idx = 5  # Mitten av 11x11 grid
        value_at_target_0 = test_result_0[center_idx, center_idx]
        value_at_target_nan = test_result_nan[center_idx, center_idx]
        
        print(f"📊 Interpolerat värde vid target:")
        print(f"   Med fill_value=0: {value_at_target_0:.4f} m/s ({value_at_target_0*1.944:.2f} knop)")
        print(f"   Med fill_value=nan: {value_at_target_nan:.4f} m/s ({value_at_target_nan*1.944:.2f} knop)")
        
        if value_at_target_0 == 0:
            print(f"❌ Bekräftat: Target får fill_value=0, inte interpolerat värde!")
        
        # Räkna hur många pixlar som är NaN vs 0
        nan_count = np.sum(np.isnan(test_result_nan))
        zero_count = np.sum(test_result_0 == 0)
        total = test_result_0.size
        
        print(f"📈 Grid-statistik ({total} pixlar):")
        print(f"   NaN med nya metoden: {nan_count} ({100*nan_count/total:.1f}%)")
        print(f"   Zero med gamla metoden: {zero_count} ({100*zero_count/total:.1f}%)")
        
    except Exception as e:
        print(f"❌ Interpolation misslyckades: {e}")

def main():
    # Drogden Lt koordinater
    target_lat = 55.5344
    target_lon = 12.7036
    time_target = "2025-06-29T14"
    
    print("🔬 Debug av interpolationsproblem vid Drogden Lt")
    print("=" * 60)
    
    debug_interpolation_around_point(target_lat, target_lon, time_target)

if __name__ == "__main__":
    main() 