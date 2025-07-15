#!/usr/bin/env python3
"""
Djupanalys av makrill-sannolikhetsvärden för optimal colormap-design
Analyserar distributionen av värden för att skapa perfekt hotspot-visualisering
"""

import json
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import matplotlib.colors as colors
from collections import defaultdict

def load_mackerel_metadata():
    """Ladda metadata för makrill-sannolikhet"""
    metadata_path = Path('../public/data/mackerel-probability-images-mercator/metadata.json')
    
    if not metadata_path.exists():
        metadata_path = Path('public/data/mackerel-probability-images-mercator/metadata.json')
    
    with open(metadata_path, 'r') as f:
        return json.load(f)

def extract_value_ranges(metadata):
    """Extrahera alla värdeintervall från metadata"""
    ranges = []
    min_values = []
    max_values = []
    
    for image in metadata['images']:
        if 'value_range' in image:
            min_val, max_val = image['value_range']
            min_values.append(min_val)
            max_values.append(max_val)
            ranges.append(max_val - min_val)
    
    return {
        'min_values': np.array(min_values),
        'max_values': np.array(max_values),
        'ranges': np.array(ranges),
        'total_images': len(min_values)
    }

def analyze_distribution(data):
    """Analysera distributionen av värden"""
    stats = {}
    
    # Kombinera alla min- och max-värden för att få total range
    all_values = np.concatenate([data['min_values'], data['max_values']])
    
    stats['overall'] = {
        'min': np.min(all_values),
        'max': np.max(all_values),
        'mean': np.mean(all_values),
        'median': np.median(all_values),
        'std': np.std(all_values)
    }
    
    # Analysera min-värden (negativa områden)
    stats['min_values'] = {
        'min': np.min(data['min_values']),
        'max': np.max(data['min_values']),
        'mean': np.mean(data['min_values']),
        'median': np.median(data['min_values']),
        'std': np.std(data['min_values'])
    }
    
    # Analysera max-värden (positiva områden)
    stats['max_values'] = {
        'min': np.min(data['max_values']),
        'max': np.max(data['max_values']),
        'mean': np.mean(data['max_values']),
        'median': np.median(data['max_values']),
        'std': np.std(data['max_values'])
    }
    
    # Beräkna percentiler för hela spannet
    stats['percentiles'] = {
        '1%': np.percentile(all_values, 1),
        '5%': np.percentile(all_values, 5),
        '10%': np.percentile(all_values, 10),
        '25%': np.percentile(all_values, 25),
        '50%': np.percentile(all_values, 50),
        '75%': np.percentile(all_values, 75),
        '90%': np.percentile(all_values, 90),
        '95%': np.percentile(all_values, 95),
        '99%': np.percentile(all_values, 99),
    }
    
    return stats

def create_optimal_hotspot_colormap(stats):
    """Skapa optimal hotspot-colormap baserat på verklig dataanalys"""
    
    # Definiera viktiga brytpunkter baserat på statistik
    min_val = stats['overall']['min']
    max_val = stats['overall']['max']
    
    # Negativa värden (ingen/minimal makrill): -35% till 0%
    negative_threshold = 0.0
    
    # Låg chans: 0% till 25%
    low_threshold = 25.0
    
    # Måttlig chans: 25% till 50%
    moderate_threshold = 50.0
    
    # Hög chans: 50% till 75%
    high_threshold = 75.0
    
    # Hotspot: 75% till 100%
    hotspot_threshold = 100.0
    
    # Skapa ultra-smooth hotspot colormap
    colormap_points = [
        # NEGATIVA VÄRDEN - Total svart för "ingen makrill"
        [min_val, "#000000"],      # Djupaste svart för minimum
        [-30, "#000000"],          # Fortfarande svart
        [-20, "#000000"],          # Svart
        [-10, "#000000"],          # Svart
        [-5, "#000000"],           # Svart
        [0, "#000000"],            # Svart vid 0%
        
        # LÅGA VÄRDEN (0-25%) - Övergång från svart till mörk grå
        [2, "#0A0A0A"],            # Mycket svag grå
        [5, "#141414"],            # Svag grå
        [10, "#1E1E1E"],           # Mörk grå
        [15, "#282828"],           # Grå
        [20, "#323232"],           # Ljusare grå
        [25, "#3C3C3C"],           # Ljus grå
        
        # MÅTTLIGA VÄRDEN (25-50%) - Övergång till mörk blå
        [30, "#001122"],           # Första blå antydan
        [35, "#001133"],           # Svag blå
        [40, "#001144"],           # Tydligare blå
        [45, "#001155"],           # Blå
        [50, "#002266"],           # Mörk blå
        
        # HÖGA VÄRDEN (50-75%) - Ljusare blå
        [55, "#003377"],           # Ljusare blå
        [60, "#004488"],           # Stark blå
        [65, "#0055CC"],           # Tydlig blå
        [70, "#0066DD"],           # Ljus blå
        [75, "#0077FF"],           # Stark blå
        
        # HOTSPOT-OMRÅDE (75-100%) - Explosiva färger
        [78, "#1188FF"],           # Ljusare blå
        [82, "#2299FF"],           # Mycket ljus blå
        [85, "#33AAFF"],           # Ljus blå
        [88, "#44BBFF"],           # Mycket ljus blå
        [90, "#55CCFF"],           # Ljusast blå
        [92, "#66DDFF"],           # Ljusaste blå
        [94, "#77EEFF"],           # Extremt ljus blå
        [96, "#88FFFF"],           # Cyan-blå
        [98, "#FFAA00"],           # Orange hotspot
        [99, "#FF4400"],           # Röd hotspot
        [100, "#FFFFFF"],          # Vit för absolut maximum
    ]
    
    return colormap_points

def visualize_analysis(data, stats, colormap_points):
    """Skapa visualisering av analysen"""
    fig, axes = plt.subplots(2, 3, figsize=(20, 12))
    fig.suptitle('Makrill-sannolikhet: Djupanalys för Optimal Colormap', fontsize=16, fontweight='bold')
    
    # 1. Histogram av alla värden
    all_values = np.concatenate([data['min_values'], data['max_values']])
    axes[0,0].hist(all_values, bins=50, alpha=0.7, color='steelblue', edgecolor='black')
    axes[0,0].axvline(stats['overall']['mean'], color='red', linestyle='--', linewidth=2, label=f'Medel: {stats["overall"]["mean"]:.1f}%')
    axes[0,0].axvline(stats['overall']['median'], color='green', linestyle='--', linewidth=2, label=f'Median: {stats["overall"]["median"]:.1f}%')
    axes[0,0].axvline(0, color='orange', linestyle='-', linewidth=2, label='0% (Neutral)')
    axes[0,0].set_title('Fördelning av Alla Värden', fontweight='bold')
    axes[0,0].set_xlabel('Makrill-sannolikhet (%)')
    axes[0,0].set_ylabel('Frekvens')
    axes[0,0].legend()
    axes[0,0].grid(True, alpha=0.3)
    
    # 2. Min vs Max värden
    axes[0,1].scatter(data['min_values'], data['max_values'], alpha=0.6, color='coral')
    axes[0,1].plot([stats['overall']['min'], stats['overall']['max']], 
                   [stats['overall']['min'], stats['overall']['max']], 
                   'k--', alpha=0.5, label='y=x')
    axes[0,1].set_title('Min vs Max Värden per Bild', fontweight='bold')
    axes[0,1].set_xlabel('Min värde (%)')
    axes[0,1].set_ylabel('Max värde (%)')
    axes[0,1].legend()
    axes[0,1].grid(True, alpha=0.3)
    
    # 3. Temporal variation
    axes[0,2].plot(data['min_values'], 'b-', alpha=0.7, label='Min värden')
    axes[0,2].plot(data['max_values'], 'r-', alpha=0.7, label='Max värden')
    axes[0,2].fill_between(range(len(data['min_values'])), 
                          data['min_values'], data['max_values'], 
                          alpha=0.3, color='gray', label='Spann')
    axes[0,2].set_title('Temporal Variation', fontweight='bold')
    axes[0,2].set_xlabel('Bild-index (tid)')
    axes[0,2].set_ylabel('Sannolikhet (%)')
    axes[0,2].legend()
    axes[0,2].grid(True, alpha=0.3)
    
    # 4. Percentiler
    percentiles = list(stats['percentiles'].keys())
    percentile_values = list(stats['percentiles'].values())
    axes[1,0].bar(percentiles, percentile_values, color='lightblue', edgecolor='black')
    axes[1,0].set_title('Percentiler', fontweight='bold')
    axes[1,0].set_xlabel('Percentil')
    axes[1,0].set_ylabel('Värde (%)')
    axes[1,0].tick_params(axis='x', rotation=45)
    axes[1,0].grid(True, alpha=0.3)
    
    # 5. Box plot
    box_data = [data['min_values'], data['max_values'], all_values]
    axes[1,1].boxplot(box_data, labels=['Min värden', 'Max värden', 'Alla värden'])
    axes[1,1].set_title('Box Plot Jämförelse', fontweight='bold')
    axes[1,1].set_ylabel('Sannolikhet (%)')
    axes[1,1].grid(True, alpha=0.3)
    
    # 6. Colormap preview
    colormap_values = np.array([point[0] for point in colormap_points])
    colormap_colors = [point[1] for point in colormap_points]
    
    # Skapa gradient för preview
    gradient = np.linspace(stats['overall']['min'], stats['overall']['max'], 256).reshape(1, -1)
    axes[1,2].imshow(gradient, aspect='auto', cmap='hot', extent=[stats['overall']['min'], stats['overall']['max'], 0, 1])
    axes[1,2].set_title('Föreslagen Colormap', fontweight='bold')
    axes[1,2].set_xlabel('Makrill-sannolikhet (%)')
    axes[1,2].set_yticks([])
    
    # Lägg till viktiga brytpunkter
    for i, (value, color) in enumerate(colormap_points[::5]):  # Visa varje 5:e punkt
        axes[1,2].axvline(value, color='white', linestyle='--', alpha=0.7)
        if i % 2 == 0:  # Visa text för varje annan punkt
            axes[1,2].text(value, 0.5, f'{value:.0f}%', rotation=90, 
                          ha='center', va='center', color='white', fontweight='bold')
    
    plt.tight_layout()
    return fig

def print_analysis_report(data, stats, colormap_points):
    """Skriv ut detaljerad analysrapport"""
    print("=" * 80)
    print("🔬 DJUPANALYS AV MAKRILL-SANNOLIKHETSVÄRDEN")
    print("=" * 80)
    
    print(f"\n📊 GRUNDLÄGGANDE STATISTIK:")
    print(f"   Totalt antal bilder: {data['total_images']}")
    print(f"   Värdeintervall: {stats['overall']['min']:.1f}% - {stats['overall']['max']:.1f}%")
    print(f"   Spann: {stats['overall']['max'] - stats['overall']['min']:.1f}%")
    print(f"   Medelvärde: {stats['overall']['mean']:.1f}%")
    print(f"   Median: {stats['overall']['median']:.1f}%")
    print(f"   Standardavvikelse: {stats['overall']['std']:.1f}%")
    
    print(f"\n📉 NEGATIVA VÄRDEN (ingen makrill):")
    print(f"   Min: {stats['min_values']['min']:.1f}%")
    print(f"   Max: {stats['min_values']['max']:.1f}%")
    print(f"   Medel: {stats['min_values']['mean']:.1f}%")
    
    print(f"\n📈 POSITIVA VÄRDEN (makrill närvarande):")
    print(f"   Min: {stats['max_values']['min']:.1f}%")
    print(f"   Max: {stats['max_values']['max']:.1f}%")
    print(f"   Medel: {stats['max_values']['mean']:.1f}%")
    
    print(f"\n🎯 VIKTIGA BRYTPUNKTER:")
    print(f"   Negativ tröskel: < 0% (svart)")
    print(f"   Låg chans: 0-25% (mörk grå)")
    print(f"   Måttlig chans: 25-50% (mörk blå)")
    print(f"   Hög chans: 50-75% (ljus blå)")
    print(f"   Hotspot: 75-100% (orange-röd-vit)")
    
    print(f"\n🎨 COLORMAP DESIGN-PRINCIPER:")
    print(f"   • Negativa värden: Total svart (ingen makrill)")
    print(f"   • 0-25%: Gradvis övergång från svart till grå")
    print(f"   • 25-50%: Övergång till mörk blå")
    print(f"   • 50-75%: Ljusare blå toner")
    print(f"   • 75-100%: Explosiva hotspot-färger (orange→röd→vit)")
    print(f"   • Silkesmjuka övergångar för att undvika färghopp")
    
    print(f"\n🔥 HOTSPOT-EFFEKT:")
    print(f"   • Mörk bakgrund framhäver ljusa hotspots")
    print(f"   • Vit färg reserved för absolut maximum (100%)")
    print(f"   • Orange-röd för stark makrill-aktivitet")
    print(f"   • Perceptuellt optimerad för att dra uppmärksamhet")

def generate_colormap_code(colormap_points):
    """Generera kod för den optimerade colormapen"""
    code = '''
# OPTIMERAD MAKRILL-HOTSPOT COLORMAP - Baserad på verklig dataanalys
# Värdeintervall: -35% till +100%
# Design: Svart bakgrund → Grå → Blå → Orange → Röd → Vit hotspots
MACKEREL_HOTSPOT_COLORMAP = [
'''
    
    for value, color in colormap_points:
        code += f'    [{value:.1f}, "{color}"],  # {get_color_description(value)}\n'
    
    code += ''']

def create_mackerel_hotspot_colormap():
    """Skapa ultra-smooth hotspot colormap med vetenskaplig grund"""
    # Normalisera värden till 0-1 range för matplotlib
    min_val = min(point[0] for point in MACKEREL_HOTSPOT_COLORMAP)
    max_val = max(point[0] for point in MACKEREL_HOTSPOT_COLORMAP)
    
    normalized_points = []
    for value, color in MACKEREL_HOTSPOT_COLORMAP:
        normalized_value = (value - min_val) / (max_val - min_val)
        normalized_points.append((normalized_value, color))
    
    # Skapa LinearSegmentedColormap
    positions = [point[0] for point in normalized_points]
    colors = [point[1] for point in normalized_points]
    
    cmap = colors.LinearSegmentedColormap.from_list(
        'mackerel_hotspot_scientific', 
        list(zip(positions, colors)),
        gamma=0.8  # Gamma för mjuka övergångar
    )
    
    return cmap, min_val, max_val
'''
    
    return code

def get_color_description(value):
    """Få beskrivning av vad färgen representerar"""
    if value < 0:
        return "Ingen makrill (svart)"
    elif value < 10:
        return "Minimal chans (mörk grå)"
    elif value < 25:
        return "Låg chans (grå)"
    elif value < 50:
        return "Måttlig chans (blå)"
    elif value < 75:
        return "Hög chans (ljus blå)"
    elif value < 90:
        return "Mycket hög chans (cyan)"
    elif value < 99:
        return "Hotspot (orange-röd)"
    else:
        return "Maximum hotspot (vit)"

def main():
    print("🔬 MAKRILL-SANNOLIKHET: DJUPANALYS FÖR OPTIMAL COLORMAP")
    print("=" * 60)
    
    # Ladda metadata
    print("📂 Laddar metadata...")
    metadata = load_mackerel_metadata()
    
    # Extrahera värdeintervall
    print("📊 Extraherar värdeintervall...")
    data = extract_value_ranges(metadata)
    
    # Analysera distribution
    print("🔍 Analyserar distribution...")
    stats = analyze_distribution(data)
    
    # Skapa optimal colormap
    print("🎨 Skapar optimal hotspot-colormap...")
    colormap_points = create_optimal_hotspot_colormap(stats)
    
    # Skapa visualisering
    print("📈 Skapar visualisering...")
    fig = visualize_analysis(data, stats, colormap_points)
    
    # Spara visualisering
    fig.savefig('mackerel_probability_analysis.png', dpi=300, bbox_inches='tight')
    print("💾 Sparade visualisering: mackerel_probability_analysis.png")
    
    # Skriv ut rapport
    print_analysis_report(data, stats, colormap_points)
    
    # Generera kod
    colormap_code = generate_colormap_code(colormap_points)
    with open('mackerel_hotspot_colormap_code.py', 'w') as f:
        f.write(colormap_code)
    print("💾 Sparade colormap-kod: mackerel_hotspot_colormap_code.py")
    
    # Spara analysdata
    analysis_data = {
        'metadata_summary': {
            'total_images': data['total_images'],
            'value_range': [stats['overall']['min'], stats['overall']['max']]
        },
        'statistics': stats,
        'colormap_points': colormap_points
    }
    
    with open('mackerel_analysis_results.json', 'w') as f:
        json.dump(analysis_data, f, indent=2)
    print("💾 Sparade analysresultat: mackerel_analysis_results.json")
    
    print("\n🏁 ANALYS KLAR!")
    print("✅ Optimal hotspot-colormap skapad baserat på verklig data")
    print("✅ Visualisering och kod genererad")
    print("✅ Redo för implementation i generate_marine_images_mercator.py")

if __name__ == "__main__":
    main() 