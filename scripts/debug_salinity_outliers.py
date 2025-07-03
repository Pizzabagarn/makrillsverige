#!/usr/bin/env python3
"""
Debug script för att identifiera och analysera salthalt-outliers
som orsakar orealistiska extremvärden i visualiseringen
"""

import json
import gzip
import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial.distance import cdist
from collections import defaultdict
import pandas as pd

def load_area_parameters(file_path):
    """Ladda area-parameters data"""
    print(f"📦 Laddar data från {file_path}")
    
    with gzip.open(file_path, 'rt', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"✅ Laddade {len(data['points'])} punkter")
    return data

def extract_all_salinity_data(area_data):
    """Extrahera ALL salthalt-data för analys"""
    print("🔍 Extraherar salthalt-data...")
    
    all_data = []
    
    for point in area_data['points']:
        lat, lon = point['lat'], point['lon']
        
        for data_entry in point['data']:
            if 'salinity' in data_entry and data_entry['salinity'] is not None:
                all_data.append({
                    'lat': lat,
                    'lon': lon,
                    'salinity': data_entry['salinity'],
                    'time': data_entry['time']
                })
    
    print(f"📊 Hittade {len(all_data)} salthalt-mätningar")
    return all_data

def detect_spatial_outliers(data, threshold_distance=0.1, threshold_diff=15):
    """
    Detektera rumsliga outliers - punkter med extremt olika värden
    jämfört med närliggande punkter
    """
    print("🚨 Detekterar rumsliga outliers...")
    
    # Konvertera till numpy arrays
    coords = np.array([[d['lat'], d['lon']] for d in data])
    values = np.array([d['salinity'] for d in data])
    
    outliers = []
    
    for i, (coord, value) in enumerate(zip(coords, values)):
        # Hitta närliggande punkter
        distances = cdist([coord], coords)[0]
        nearby_indices = np.where(distances < threshold_distance)[0]
        
        if len(nearby_indices) > 1:  # Minst en annan närliggande punkt
            nearby_values = values[nearby_indices]
            nearby_values = nearby_values[nearby_values != value]  # Exkludera sig själv
            
            if len(nearby_values) > 0:
                median_nearby = np.median(nearby_values)
                diff = abs(value - median_nearby)
                
                if diff > threshold_diff:
                    outliers.append({
                        'index': i,
                        'lat': coord[0],
                        'lon': coord[1],
                        'value': value,
                        'median_nearby': median_nearby,
                        'difference': diff,
                        'time': data[i]['time']
                    })
    
    print(f"⚠️ Hittade {len(outliers)} potentiella rumsliga outliers")
    return outliers

def detect_statistical_outliers(data, z_threshold=3):
    """Detektera statistiska outliers med Z-score"""
    print("📈 Detekterar statistiska outliers...")
    
    values = np.array([d['salinity'] for d in data])
    
    # Beräkna Z-scores
    mean_val = np.mean(values)
    std_val = np.std(values)
    z_scores = np.abs((values - mean_val) / std_val)
    
    outlier_indices = np.where(z_scores > z_threshold)[0]
    
    outliers = []
    for idx in outlier_indices:
        outliers.append({
            'index': idx,
            'lat': data[idx]['lat'],
            'lon': data[idx]['lon'],
            'value': data[idx]['salinity'],
            'z_score': z_scores[idx],
            'time': data[idx]['time']
        })
    
    print(f"📊 Hittade {len(outliers)} statistiska outliers (Z > {z_threshold})")
    return outliers

def analyze_temporal_patterns(data):
    """Analysera temporala mönster för att hitta konstiga tidsberoenden"""
    print("⏰ Analyserar temporala mönster...")
    
    # Gruppera per tid
    time_groups = defaultdict(list)
    for d in data:
        time_groups[d['time']].append(d['salinity'])
    
    # Beräkna statistik per tidpunkt
    time_stats = {}
    for time, values in time_groups.items():
        time_stats[time] = {
            'count': len(values),
            'mean': np.mean(values),
            'std': np.std(values),
            'min': np.min(values),
            'max': np.max(values),
            'range': np.max(values) - np.min(values)
        }
    
    # Hitta tidpunkter med extrema ranges
    extreme_times = []
    for time, stats in time_stats.items():
        if stats['range'] > 25:  # Mer än 25 g/kg range i samma tidpunkt
            extreme_times.append({
                'time': time,
                'range': stats['range'],
                'min': stats['min'],
                'max': stats['max'],
                'count': stats['count']
            })
    
    print(f"⚠️ Hittade {len(extreme_times)} tidpunkter med extrema ranges (>25 g/kg)")
    return extreme_times, time_stats

def create_outlier_visualization(data, spatial_outliers, statistical_outliers):
    """Skapa visualisering av outliers"""
    print("📈 Skapar visualisering...")
    
    # Konvertera till arrays
    lats = np.array([d['lat'] for d in data])
    lons = np.array([d['lon'] for d in data])
    values = np.array([d['salinity'] for d in data])
    
    # Spatial outliers
    spatial_lats = np.array([o['lat'] for o in spatial_outliers])
    spatial_lons = np.array([o['lon'] for o in spatial_outliers])
    spatial_values = np.array([o['value'] for o in spatial_outliers])
    
    # Statistical outliers
    stat_lats = np.array([o['lat'] for o in statistical_outliers])
    stat_lons = np.array([o['lon'] for o in statistical_outliers])
    stat_values = np.array([o['value'] for o in statistical_outliers])
    
    # Skapa plot
    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    fig.suptitle('Salthalt Outlier-analys', fontsize=16)
    
    # 1. Alla datapunkter
    scatter = axes[0,0].scatter(lons, lats, c=values, cmap='RdBu_r', s=1, alpha=0.6)
    axes[0,0].set_title('Alla salthalt-mätningar')
    axes[0,0].set_xlabel('Longitude')
    axes[0,0].set_ylabel('Latitude')
    plt.colorbar(scatter, ax=axes[0,0], label='Salthalt (g/kg)')
    
    # 2. Spatial outliers
    if len(spatial_outliers) > 0:
        scatter2 = axes[0,1].scatter(lons, lats, c='lightgray', s=1, alpha=0.3)
        scatter2 = axes[0,1].scatter(spatial_lons, spatial_lats, c=spatial_values, 
                                   cmap='RdBu_r', s=20, edgecolors='black', linewidth=0.5)
        axes[0,1].set_title(f'Spatial outliers ({len(spatial_outliers)})')
        axes[0,1].set_xlabel('Longitude')
        axes[0,1].set_ylabel('Latitude')
        plt.colorbar(scatter2, ax=axes[0,1], label='Salthalt (g/kg)')
    
    # 3. Statistical outliers
    if len(statistical_outliers) > 0:
        scatter3 = axes[1,0].scatter(lons, lats, c='lightgray', s=1, alpha=0.3)
        scatter3 = axes[1,0].scatter(stat_lons, stat_lats, c=stat_values, 
                                   cmap='RdBu_r', s=20, edgecolors='red', linewidth=0.5)
        axes[1,0].set_title(f'Statistiska outliers ({len(statistical_outliers)})')
        axes[1,0].set_xlabel('Longitude')
        axes[1,0].set_ylabel('Latitude')
        plt.colorbar(scatter3, ax=axes[1,0], label='Salthalt (g/kg)')
    
    # 4. Histogram
    axes[1,1].hist(values, bins=50, alpha=0.7, edgecolor='black')
    axes[1,1].set_title('Fördelning av salthalt')
    axes[1,1].set_xlabel('Salthalt (g/kg)')
    axes[1,1].set_ylabel('Frekvens')
    axes[1,1].axvline(np.mean(values), color='red', linestyle='--', 
                     label=f'Medel: {np.mean(values):.1f}')
    axes[1,1].axvline(np.median(values), color='green', linestyle='--',
                     label=f'Median: {np.median(values):.1f}')
    axes[1,1].legend()
    
    plt.tight_layout()
    plt.savefig('salinity_outlier_analysis.png', dpi=300, bbox_inches='tight')
    print("💾 Sparade visualisering: salinity_outlier_analysis.png")
    
    return fig

def suggest_data_cleaning(spatial_outliers, statistical_outliers, extreme_times):
    """Föreslå datarensningsteknik"""
    print("\n🧹 FÖRSLAG PÅ DATARENSNING:")
    print("=" * 50)
    
    # Spatial outliers
    if len(spatial_outliers) > 0:
        print(f"🗺️ SPATIAL OUTLIERS ({len(spatial_outliers)} st):")
        worst_spatial = sorted(spatial_outliers, key=lambda x: x['difference'], reverse=True)[:5]
        for o in worst_spatial:
            print(f"  • {o['value']:.1f} g/kg vid ({o['lat']:.3f}, {o['lon']:.3f})")
            print(f"    Skillnad mot närliggande: {o['difference']:.1f} g/kg")
    
    # Statistical outliers
    if len(statistical_outliers) > 0:
        print(f"\n📊 STATISTISKA OUTLIERS ({len(statistical_outliers)} st):")
        worst_stat = sorted(statistical_outliers, key=lambda x: x['z_score'], reverse=True)[:5]
        for o in worst_stat:
            print(f"  • {o['value']:.1f} g/kg vid ({o['lat']:.3f}, {o['lon']:.3f})")
            print(f"    Z-score: {o['z_score']:.2f}")
    
    # Extreme times
    if len(extreme_times) > 0:
        print(f"\n⏰ EXTREMA TIDPUNKTER ({len(extreme_times)} st):")
        for t in extreme_times[:3]:
            print(f"  • {t['time']}: {t['min']:.1f} - {t['max']:.1f} g/kg (range: {t['range']:.1f})")
    
    print(f"\n💡 REKOMMENDATIONER:")
    print("1. Filtrera bort spatial outliers med >15 g/kg skillnad mot grannar")
    print("2. Filtrera bort statistiska outliers med Z-score >3")
    print("3. Lägg till medianfiltrering för att minska extrema gradienter")
    print("4. Överväg att interpolera över tid för att fylla extrema värden")

def main():
    print("🔍 SALTHALT OUTLIER-ANALYS")
    print("=" * 40)
    
    # Ladda data
    area_data = load_area_parameters('../public/data/area-parameters-extended.json.gz')
    
    # Extrahera salthalt-data
    salinity_data = extract_all_salinity_data(area_data)
    
    # Grundläggande statistik
    values = [d['salinity'] for d in salinity_data]
    print(f"\n📊 GRUNDLÄGGANDE STATISTIK:")
    print(f"Antal mätningar: {len(values):,}")
    print(f"Min: {np.min(values):.3f} g/kg")
    print(f"Max: {np.max(values):.3f} g/kg")
    print(f"Medel: {np.mean(values):.3f} g/kg")
    print(f"Median: {np.median(values):.3f} g/kg")
    print(f"Std: {np.std(values):.3f} g/kg")
    print(f"Range: {np.max(values) - np.min(values):.3f} g/kg")
    
    # Detektera outliers
    spatial_outliers = detect_spatial_outliers(salinity_data)
    statistical_outliers = detect_statistical_outliers(salinity_data)
    extreme_times, time_stats = analyze_temporal_patterns(salinity_data)
    
    # Skapa visualisering
    fig = create_outlier_visualization(salinity_data, spatial_outliers, statistical_outliers)
    
    # Föreslå lösningar
    suggest_data_cleaning(spatial_outliers, statistical_outliers, extreme_times)
    
    # Spara outlier-data
    outlier_report = {
        'basic_stats': {
            'count': len(values),
            'min': float(np.min(values)),
            'max': float(np.max(values)),
            'mean': float(np.mean(values)),
            'median': float(np.median(values)),
            'std': float(np.std(values))
        },
        'spatial_outliers': spatial_outliers,
        'statistical_outliers': statistical_outliers,
        'extreme_times': extreme_times
    }
    
    with open('salinity_outlier_report.json', 'w') as f:
        json.dump(outlier_report, f, indent=2)
    
    print(f"\n💾 Sparade outlier-rapport: salinity_outlier_report.json")
    print("🏁 Analys klar!")

if __name__ == "__main__":
    main() 