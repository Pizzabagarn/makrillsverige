#!/usr/bin/env python3
"""
Analys av dataintervall för optimering av interpolation och färgskalor.
Analyserar faktiska värden för att skapa optimala visualiseringar.
"""

import json
import gzip
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from collections import defaultdict
import pandas as pd

def load_area_parameters(file_path):
    """Ladda area-parameters data"""
    print(f"📦 Laddar data från {file_path}")
    
    with gzip.open(file_path, 'rt', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"✅ Laddade {len(data['points'])} punkter med {len(data['metadata']['timestamps'])} tidssteg")
    return data

def analyze_parameter_ranges(area_data, parameter_name):
    """Analysera dataintervall för en specifik parameter"""
    print(f"\n🔍 Analyserar {parameter_name}...")
    
    values = []
    temporal_stats = defaultdict(list)
    spatial_coords = []
    
    for point in area_data['points']:
        lat, lon = point['lat'], point['lon']
        
        for data_entry in point['data']:
            timestamp = data_entry['time'][:13]  # YYYY-MM-DDTHH
            value = None
            
            if parameter_name == 'current':
                if 'current' in data_entry and data_entry['current']:
                    u = data_entry['current'].get('u')
                    v = data_entry['current'].get('v')
                    if u is not None and v is not None:
                        value = np.sqrt(u**2 + v**2)
            elif parameter_name == 'temperature':
                if 'temperature' in data_entry:
                    value = data_entry['temperature']
            elif parameter_name == 'salinity':
                if 'salinity' in data_entry:
                    value = data_entry['salinity']
            
            if value is not None:
                values.append(value)
                temporal_stats[timestamp].append(value)
                spatial_coords.append((lat, lon, value))
    
    if not values:
        print(f"⚠️ Ingen data för {parameter_name}")
        return None
    
    values = np.array(values)
    
    # Grundläggande statistik
    stats = {
        'count': len(values),
        'min': np.min(values),
        'max': np.max(values),
        'mean': np.mean(values),
        'median': np.median(values),
        'std': np.std(values),
        'percentiles': {
            '1%': np.percentile(values, 1),
            '5%': np.percentile(values, 5),
            '10%': np.percentile(values, 10),
            '25%': np.percentile(values, 25),
            '75%': np.percentile(values, 75),
            '90%': np.percentile(values, 90),
            '95%': np.percentile(values, 95),
            '99%': np.percentile(values, 99),
        }
    }
    
    # Temporal variation
    temporal_variation = {}
    for timestamp, timestamp_values in temporal_stats.items():
        if len(timestamp_values) > 1:
            temporal_variation[timestamp] = {
                'min': np.min(timestamp_values),
                'max': np.max(timestamp_values),
                'range': np.max(timestamp_values) - np.min(timestamp_values),
                'std': np.std(timestamp_values)
            }
    
    if temporal_variation:
        ranges = [v['range'] for v in temporal_variation.values()]
        stds = [v['std'] for v in temporal_variation.values()]
        stats['temporal_variation'] = {
            'avg_range': np.mean(ranges),
            'max_range': np.max(ranges),
            'avg_std': np.mean(stds),
            'max_std': np.max(stds)
        }
    
    # Spatial variation (approximation)
    if len(spatial_coords) > 100:
        sample_coords = np.random.choice(len(spatial_coords), 100, replace=False)
        sampled = [spatial_coords[i] for i in sample_coords]
        
        # Beräkna variation mellan närliggande punkter
        spatial_diffs = []
        for i, (lat1, lon1, val1) in enumerate(sampled):
            for j, (lat2, lon2, val2) in enumerate(sampled[i+1:], i+1):
                distance = np.sqrt((lat1-lat2)**2 + (lon1-lon2)**2)
                if distance < 0.5:  # Närliggande punkter
                    spatial_diffs.append(abs(val1 - val2))
        
        if spatial_diffs:
            stats['spatial_variation'] = {
                'avg_neighbor_diff': np.mean(spatial_diffs),
                'max_neighbor_diff': np.max(spatial_diffs)
            }
    
    return stats, values, temporal_stats, spatial_coords

def suggest_optimal_colormap(stats, parameter_name):
    """Föreslå optimal färgskala baserat på dataanalys"""
    min_val = stats['min']
    max_val = stats['max']
    std = stats['std']
    
    # Använd percentiler för att skapa färgskala som fångar variationer
    p1 = stats['percentiles']['1%']
    p5 = stats['percentiles']['5%']
    p10 = stats['percentiles']['10%']
    p25 = stats['percentiles']['25%']
    p75 = stats['percentiles']['75%']
    p90 = stats['percentiles']['90%']
    p95 = stats['percentiles']['95%']
    p99 = stats['percentiles']['99%']
    
    # Skapa adaptiv färgskala med fler steg i variabla områden
    if parameter_name == 'current':
        # Fler steg i låga hastigheter där mest variation finns
        colormap_points = [
            p1, p5, p10, p25, 
            np.mean([p25, stats['median']]),
            stats['median'],
            np.mean([stats['median'], p75]),
            p75, p90, p95, p99
        ]
        colors = [
            '#000040', '#000080', '#0040FF', '#0080FF', '#00AAFF',
            '#00FFAA', '#80FF80', '#AAFF00', '#FFFF00', '#FFAA00', '#FF0000'
        ]
    
    elif parameter_name == 'temperature':
        # Fler steg kring normala temperaturer
        colormap_points = [
            min_val, p5, p10, p25,
            np.mean([p25, stats['median']]),
            stats['median'],
            np.mean([stats['median'], p75]),
            p75, p90, p95, max_val
        ]
        colors = [
            '#000040', '#000080', '#0040FF', '#0080FF', '#00AAFF',
            '#00FFAA', '#80FF80', '#AAFF00', '#FFFF00', '#FFAA00', '#FF0000'
        ]
    
    elif parameter_name == 'salinity':
        # Fler steg i bräckt-salt övergången
        colormap_points = [
            min_val, p5, p10, p25,
            np.mean([p25, stats['median']]),
            stats['median'],
            np.mean([stats['median'], p75]),
            p75, p90, p95, max_val
        ]
        colors = [
            '#8B4513', '#CD853F', '#DEB887', '#F4A460', '#FFD700',
            '#ADFF2F', '#00FF7F', '#00CED1', '#1E90FF', '#0000CD', '#000040'
        ]
    
    # Ta bort dubbletter och sortera
    colormap_data = list(zip(colormap_points, colors))
    colormap_data = sorted(list(set(colormap_data)), key=lambda x: x[0])
    
    return colormap_data

def create_visualization(stats, values, parameter_name):
    """Skapa visualisering av datafördelning"""
    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    fig.suptitle(f'Dataanalys: {parameter_name.title()}', fontsize=16)
    
    # Histogram
    axes[0,0].hist(values, bins=50, alpha=0.7, edgecolor='black')
    axes[0,0].axvline(stats['mean'], color='red', linestyle='--', label=f'Medel: {stats["mean"]:.3f}')
    axes[0,0].axvline(stats['median'], color='green', linestyle='--', label=f'Median: {stats["median"]:.3f}')
    axes[0,0].set_title('Fördelning av värden')
    axes[0,0].set_xlabel('Värde')
    axes[0,0].set_ylabel('Frekvens')
    axes[0,0].legend()
    
    # Box plot
    axes[0,1].boxplot(values)
    axes[0,1].set_title('Box Plot')
    axes[0,1].set_ylabel('Värde')
    
    # Percentiler
    percentiles = list(stats['percentiles'].keys())
    percentile_values = list(stats['percentiles'].values())
    axes[1,0].plot(percentiles, percentile_values, 'o-')
    axes[1,0].set_title('Percentiler')
    axes[1,0].set_xlabel('Percentil')
    axes[1,0].set_ylabel('Värde')
    axes[1,0].tick_params(axis='x', rotation=45)
    
    # Statistik text
    stats_text = f"""
    Antal värden: {stats['count']:,}
    Min: {stats['min']:.3f}
    Max: {stats['max']:.3f}
    Medel: {stats['mean']:.3f}
    Median: {stats['median']:.3f}
    Std: {stats['std']:.3f}
    
    Variationer:
    """
    
    if 'temporal_variation' in stats:
        stats_text += f"""
    Temporal avg range: {stats['temporal_variation']['avg_range']:.3f}
    Temporal max range: {stats['temporal_variation']['max_range']:.3f}
        """
    
    if 'spatial_variation' in stats:
        stats_text += f"""
    Spatial avg diff: {stats['spatial_variation']['avg_neighbor_diff']:.3f}
    Spatial max diff: {stats['spatial_variation']['max_neighbor_diff']:.3f}
        """
    
    axes[1,1].text(0.1, 0.9, stats_text, transform=axes[1,1].transAxes, 
                   verticalalignment='top', fontfamily='monospace')
    axes[1,1].set_title('Statistik')
    axes[1,1].axis('off')
    
    plt.tight_layout()
    return fig

def main():
    print("🔍 DATAANALYS FÖR OPTIMAL INTERPOLATION")
    print("=" * 50)
    
    # Ladda data
    area_data = load_area_parameters('public/data/area-parameters-extended.json.gz')
    
    # Analysera varje parameter
    parameters = ['current', 'temperature', 'salinity']
    results = {}
    
    for param in parameters:
        result = analyze_parameter_ranges(area_data, param)
        if result:
            stats, values, temporal_stats, spatial_coords = result
            results[param] = {
                'stats': stats,
                'values': values,
                'temporal_stats': temporal_stats,
                'spatial_coords': spatial_coords
            }
            
            # Skapa visualisering
            fig = create_visualization(stats, values, param)
            output_path = f'data_analysis_{param}.png'
            fig.savefig(output_path, dpi=300, bbox_inches='tight')
            print(f"📊 Sparade visualisering: {output_path}")
            plt.close(fig)
            
            # Föreslå optimal färgskala
            optimal_colormap = suggest_optimal_colormap(stats, param)
            print(f"\n🎨 Föreslagen optimal färgskala för {param}:")
            for value, color in optimal_colormap:
                print(f"    {value:.3f}: {color}")
    
    # Spara fullständig analys
    analysis_output = {}
    for param, result in results.items():
        analysis_output[param] = {
            'statistics': result['stats'],
            'suggested_colormap': suggest_optimal_colormap(result['stats'], param)
        }
    
    with open('comprehensive_data_analysis.json', 'w') as f:
        json.dump(analysis_output, f, indent=2)
    
    print(f"\n💾 Sparade komplett analys: comprehensive_data_analysis.json")
    
    # Sammanfattning
    print(f"\n📈 SAMMANFATTNING:")
    print("=" * 50)
    
    for param, result in results.items():
        stats = result['stats']
        print(f"\n{param.title()}:")
        print(f"  Range: {stats['min']:.3f} - {stats['max']:.3f}")
        print(f"  Medel ± Std: {stats['mean']:.3f} ± {stats['std']:.3f}")
        
        if 'temporal_variation' in stats:
            print(f"  Temporal variation: {stats['temporal_variation']['avg_range']:.3f} (avg)")
        
        if 'spatial_variation' in stats:
            print(f"  Spatial variation: {stats['spatial_variation']['avg_neighbor_diff']:.3f} (avg)")
    
    print(f"\n🚀 Nästa steg: Implementera RBF/ML interpolation med optimerade färgskalor!")

if __name__ == "__main__":
    main() 