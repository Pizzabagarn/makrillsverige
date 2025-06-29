#!/usr/bin/env python3
"""
Debug-script för att kontrollera specifika värden vid en punkt och tid
för att jämföra med FCOO data.
"""

import json
import gzip
from pathlib import Path
import numpy as np

def debug_point_data(lat_target, lon_target, time_target, tolerance=0.01):
    """
    Visa strömdata för en specifik punkt och tid
    lat_target, lon_target: Koordinater att söka efter
    time_target: Tidsstämpel att söka efter (format: "2025-06-29T14")
    tolerance: Tolerans för geografisk matchning (grader)
    """
    
    # Ladda data
    data_path = Path('public/data/area-parameters-extended.json.gz')
    if not data_path.exists():
        print(f"❌ Hittar inte datafil: {data_path}")
        return
    
    print(f"🔍 Debugging för punkt ({lat_target}, {lon_target}) vid tid {time_target}")
    print(f"📍 Tolerans: ±{tolerance}°")
    
    with gzip.open(data_path, 'rt', encoding='utf-8') as f:
        area_data = json.load(f)
    
    print(f"📦 Laddade {len(area_data['points'])} punkter")
    
    # Hitta närliggande punkter
    matching_points = []
    for point in area_data['points']:
        lat_diff = abs(point['lat'] - lat_target)
        lon_diff = abs(point['lon'] - lon_target)
        
        if lat_diff <= tolerance and lon_diff <= tolerance:
            distance = np.sqrt(lat_diff**2 + lon_diff**2)
            matching_points.append({
                'point': point,
                'distance': distance,
                'lat_diff': lat_diff,
                'lon_diff': lon_diff
            })
    
    if not matching_points:
        print(f"❌ Hittade inga punkter inom {tolerance}° av ({lat_target}, {lon_target})")
        # Visa närmaste punkter istället
        all_points = []
        for point in area_data['points'][:100]:  # Begränsa för prestanda
            lat_diff = abs(point['lat'] - lat_target)
            lon_diff = abs(point['lon'] - lon_target)
            distance = np.sqrt(lat_diff**2 + lon_diff**2)
            all_points.append({
                'lat': point['lat'],
                'lon': point['lon'],
                'distance': distance
            })
        
        all_points.sort(key=lambda x: x['distance'])
        print(f"\n📍 Närmaste 5 punkter:")
        for i, p in enumerate(all_points[:5], 1):
            print(f"   {i}. ({p['lat']:.4f}, {p['lon']:.4f}) - avstånd: {p['distance']:.4f}°")
        return
    
    # Sortera efter avstånd
    matching_points.sort(key=lambda x: x['distance'])
    print(f"✅ Hittade {len(matching_points)} punkter inom tolerans")
    
    # Analysera varje matchande punkt
    for i, match in enumerate(matching_points[:3], 1):  # Visa max 3 närmaste
        point = match['point']
        print(f"\n📍 Punkt {i}: ({point['lat']:.4f}, {point['lon']:.4f})")
        print(f"   Avstånd: {match['distance']:.4f}° (Δlat: {match['lat_diff']:.4f}°, Δlon: {match['lon_diff']:.4f}°)")
        
        # Hitta data för rätt tid
        matching_times = []
        for data_entry in point['data']:
            if data_entry['time'].startswith(time_target):
                matching_times.append(data_entry)
        
        if not matching_times:
            print(f"   ❌ Ingen data för tid {time_target}")
            # Visa tillgängliga tider
            available_times = [d['time'][:13] for d in point['data'][:5]]
            print(f"   📅 Första 5 tillgängliga tider: {available_times}")
            continue
        
        print(f"   ✅ Hittade {len(matching_times)} tidssteg för {time_target}")
        
        for j, time_data in enumerate(matching_times):
            print(f"\n   ⏰ Tid {j+1}: {time_data['time']}")
            
            if 'current' in time_data and time_data['current']:
                u = time_data['current'].get('u')
                v = time_data['current'].get('v')
                
                if u is not None and v is not None:
                    magnitude = np.sqrt(u**2 + v**2)
                    print(f"      🌊 Ström: u={u:.4f}, v={v:.4f}")
                    print(f"      📊 Magnitude: {magnitude:.4f} m/s ({magnitude * 1.944:.2f} knop)")
                    
                    # Färgkod enligt din colormap
                    knots = magnitude * 1.944
                    if knots < 0.25:
                        color = "🔵 Mörk blå"
                    elif knots < 0.5:
                        color = "🔷 Ljus blå"
                    elif knots < 0.75:
                        color = "🟢 Grön"
                    elif knots < 1.0:
                        color = "🟡 Gul-grön"
                    elif knots < 1.25:
                        color = "🟡 Gul"
                    elif knots < 1.5:
                        color = "🟠 Orange"
                    elif knots < 1.75:
                        color = "🔴 Röd-orange"
                    elif knots < 2.0:
                        color = "🔴 Röd"
                    elif knots < 2.5:
                        color = "🟤 Mörk röd"
                    else:
                        color = "⚫ Mycket mörk röd"
                    
                    print(f"      🎨 Färg i din app: {color}")
                    
                    # Jämför med FCOO-data
                    if knots < 1.0:
                        print(f"      ⚠️ MÖJLIG DISKREPANS: Din data visar {knots:.2f} knop, FCOO visar 1.7 knop")
                else:
                    print(f"      ❌ Ogiltig strömdata: u={u}, v={v}")
            else:
                print(f"      ❌ Ingen strömdata för denna tidpunkt")
            
            # Visa även annan data om tillgänglig
            if 'temperature' in time_data:
                print(f"      🌡️ Temperatur: {time_data['temperature']:.2f}°C")
            if 'salinity' in time_data:
                print(f"      🧂 Salinitet: {time_data['salinity']:.2f} psu")

def main():
    # Koordinater för Drogden Lt (ungefär från FCOO-bilden)
    # Justera dessa baserat på exakt position du klickade på
    lat_drogden = 55.5344  # Ungefärlig latitude för Drogden Lt
    lon_drogden = 12.7036  # Ungefärlig longitude för Drogden Lt
    
    # Tid för jämförelse (FCOO visade 14:40, vi har data för 14:00)
    time_target = "2025-06-29T14"
    
    print("🧪 Debugging av strömdata för Drogden Lt-området")
    print("=" * 50)
    
    debug_point_data(lat_drogden, lon_drogden, time_target, tolerance=0.05)
    
    print(f"\n📋 Sammanfattning:")
    print(f"- Din app visar data för {time_target}:00:00 (timme 14)")
    print(f"- FCOO visade data för 14:40 (minut 40)")
    print(f"- Detta kan förklara skillnader i strömstyrka")
    print(f"- Din data genererades: 2025-06-29T02:13 (tidig morgonprognos)")
    print(f"- FCOO kan ha nyare/mer aktuell data")

if __name__ == "__main__":
    main() 