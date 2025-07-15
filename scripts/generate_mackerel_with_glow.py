#!/usr/bin/env python3
"""
MAKRILL GLOW-EFFEKT OCH KONTURLINJER
Förbättrad visualisering med glow-effekt runt hotspots och konturlinjer för kritiska nivåer
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as colors
from matplotlib.colors import ListedColormap
from scipy.ndimage import gaussian_filter, binary_dilation
from scipy.interpolate import griddata
import colorcet as cc
import json
import argparse
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

def create_glow_effect(probability_grid, threshold=75.0, sigma=4.0, intensity=0.8):
    """
    Skapar optimerad glow-effekt runt hotspots för maximal visuell effekt
    
    Args:
        probability_grid: 2D array med sannolikhetsvärden
        threshold: Tröskelvärde för glow (optimerat till 75%)
        sigma: Gaussisk blur-styrka (optimerat till 4.0 för bredare glow)
        intensity: Glow-intensitet (optimerat till 0.8 för starkare effekt)
    
    Returns:
        glow_mask: 2D array med glow-effekt
    """
    # Tröskla ut höga värden (lägre tröskel för fler hotspots)
    high_prob_mask = probability_grid >= threshold
    
    # Applicera Gaussisk blur för glow-effekt (bredare för mjukare effekt)
    glow_mask = gaussian_filter(high_prob_mask.astype(float), sigma=sigma)
    
    # Normalisera och applicera intensitet (starkare för bättre synlighet)
    if glow_mask.max() > 0:
        glow_mask = glow_mask / glow_mask.max() * intensity
    
    return glow_mask

def create_contour_lines(probability_grid, x_grid, y_grid, levels=[10, 25, 50, 75, 90], linewidths=[1.0, 1.5, 2.0, 2.5, 3.0]):
    """
    Skapar optimerade konturlinjer för praktisk navigation
    
    Args:
        probability_grid: 2D array med sannolikhetsvärden
        x_grid, y_grid: Koordinatgrids
        levels: Lista med konturlinjenivåer (optimerat för fiskare)
        linewidths: Linjetjocklek för varje nivå (progressiv)
    
    Returns:
        contour_data: Data för konturlinjer
    """
    # Optimerade kontrastfärger för bästa synlighet
    # Vita linjer syns bäst mot mörka områden, svarta mot ljusa
    contour_colors = [
        '#FFFFFF',  # 10% - Vit (syns mot mörka områden)
        '#FFFF00',  # 25% - Gul (stark kontrast)
        '#FF8000',  # 50% - Orange (balanserad synlighet)
        '#FF0000',  # 75% - Röd (viktig tröskel)
        '#000000',  # 90% - Svart (syns mot ljusa hotspots)
    ]
    
    return {
        'levels': levels,
        'colors': contour_colors,
        'linewidths': linewidths
    }

def generate_enhanced_mackerel_map(
    probability_data, 
    coordinates,
    output_path,
    timestamp,
    glow_threshold=75.0,
    glow_sigma=4.0,
    glow_intensity=0.8,
    contour_levels=[10, 25, 50, 75, 90],
    smoothing_factor=0.8
):
    """
    Genererar förbättrad makrillkarta med glow-effekt och konturlinjer
    """
    
    print(f"🎨 Genererar förbättrad makrillkarta för {timestamp}")
    print(f"   🌟 Glow-effekt: tröskel={glow_threshold}%, sigma={glow_sigma}, intensitet={glow_intensity}")
    print(f"   📊 Konturlinjer: {contour_levels}")
    
    # Extrahera koordinater och sannolikhetsvärden
    lons = [coord[0] for coord in coordinates]
    lats = [coord[1] for coord in coordinates]
    probs = list(probability_data)
    
    # Skapa grid för interpolation
    lon_min, lon_max = min(lons), max(lons)
    lat_min, lat_max = min(lats), max(lats)
    
    # Högupplöst grid för smidig visualisering
    grid_resolution = 400
    lon_grid = np.linspace(lon_min, lon_max, grid_resolution)
    lat_grid = np.linspace(lat_min, lat_max, grid_resolution)
    LON, LAT = np.meshgrid(lon_grid, lat_grid)
    
    # Interpolera sannolikhetsvärden
    probability_grid = griddata(
        (lons, lats), probs, (LON, LAT), 
        method='cubic', fill_value=0
    )
    
    # Applicera smoothing
    probability_grid = gaussian_filter(probability_grid, sigma=smoothing_factor)
    
    # Skapa glow-effekt
    glow_mask = create_glow_effect(
        probability_grid, 
        threshold=glow_threshold,
        sigma=glow_sigma,
        intensity=glow_intensity
    )
    
    # Skapa konturlinjer
    contour_data = create_contour_lines(
        probability_grid, LON, LAT, 
        levels=contour_levels
    )
    
    # Skapa visualisering
    fig, ax = plt.subplots(1, 1, figsize=(12, 8))
    
    # 1. Rita huvudkartan med colorcet.fire
    fire_cmap = ListedColormap(cc.fire)
    main_plot = ax.contourf(
        LON, LAT, probability_grid,
        levels=50,
        cmap=fire_cmap,
        vmin=-39.0,
        vmax=102.2,
        extend='both'
    )
    
    # 2. Lägg till glow-effekt som extra lager (dramatisk gul-vit glow)
    glow_colors = ['#00000000', '#FFFF0040', '#FFFF0080', '#FFFF00C0', '#FFFFFFFF']
    glow_cmap = ListedColormap(glow_colors)
    glow_plot = ax.contourf(
        LON, LAT, glow_mask,
        levels=20,
        cmap=glow_cmap,
        alpha=0.9,
        extend='max'
    )
    
    # 3. Rita konturlinjer
    contour_plot = ax.contour(
        LON, LAT, probability_grid,
        levels=contour_data['levels'],
        colors=contour_data['colors'],
        linewidths=contour_data['linewidths'],
        alpha=0.9
    )
    
    # Lägg till labels på konturlinjer
    ax.clabel(contour_plot, inline=True, fontsize=8, fmt='%g%%')
    
    # Styling
    ax.set_title(f'Makrillsannolikhet med Glow-effekt - {timestamp}', 
                fontsize=14, fontweight='bold')
    ax.set_xlabel('Longitud')
    ax.set_ylabel('Latitud')
    
    # Colorbar
    cbar = plt.colorbar(main_plot, ax=ax, shrink=0.8)
    cbar.set_label('Sannolikhet (%)', rotation=270, labelpad=15)
    
    # Spara bild
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    print(f"   ✅ Sparad: {output_path}")
    
    return {
        'glow_threshold': glow_threshold,
        'glow_sigma': glow_sigma,
        'contour_levels': contour_levels,
        'min_prob': float(np.min(probability_grid)),
        'max_prob': float(np.max(probability_grid)),
        'hotspot_count': int(np.sum(probability_grid >= glow_threshold))
    }

def main():
    parser = argparse.ArgumentParser(description='Generera förbättrad makrillkarta')
    parser.add_argument('--timestamp', default='2025-07-15T12:00:00Z', help='Tidsstämpel')
    parser.add_argument('--glow-threshold', type=float, default=75.0, help='Glow-tröskel (%) - optimerat till 75%')
    parser.add_argument('--glow-sigma', type=float, default=4.0, help='Glow-blur styrka - optimerat till 4.0')
    parser.add_argument('--glow-intensity', type=float, default=0.8, help='Glow-intensitet - optimerat till 0.8')
    parser.add_argument('--contour-levels', nargs='+', type=float, default=[10, 25, 50, 75, 90], 
                       help='Konturlinjenivåer - optimerat för fiskare')
    parser.add_argument('--output', default='mackerel_enhanced.png', help='Utdatafil')
    
    args = parser.parse_args()
    
    print("🌟 MAKRILL GLOW-EFFEKT OCH KONTURLINJER")
    print("=" * 50)
    
    # Simulera data för test (ersätt med riktig data)
    np.random.seed(42)
    n_points = 1000
    
    # Skapa testdata med hotspots
    lons = np.random.uniform(10, 15, n_points)
    lats = np.random.uniform(55, 60, n_points)
    
    # Skapa realistiska sannolikhetsvärden med hotspots
    base_prob = np.random.normal(30, 20, n_points)
    
    # Lägg till hotspots
    hotspot_centers = [(12.5, 57.5), (13.8, 58.2), (11.2, 56.8)]
    for center_lon, center_lat in hotspot_centers:
        distances = np.sqrt((lons - center_lon)**2 + (lats - center_lat)**2)
        hotspot_effect = 60 * np.exp(-distances * 2)
        base_prob += hotspot_effect
    
    # Klämma till realistiskt intervall
    probability_data = np.clip(base_prob, -39, 102.2)
    coordinates = list(zip(lons, lats))
    
    # Generera förbättrad karta
    result = generate_enhanced_mackerel_map(
        probability_data=probability_data,
        coordinates=coordinates,
        output_path=args.output,
        timestamp=args.timestamp,
        glow_threshold=args.glow_threshold,
        glow_sigma=args.glow_sigma,
        glow_intensity=args.glow_intensity,
        contour_levels=args.contour_levels
    )
    
    print("\n📊 Resultat:")
    print(f"   🎯 Glow-tröskel: {result['glow_threshold']}%")
    print(f"   🌟 Hotspots (≥{result['glow_threshold']}%): {result['hotspot_count']} områden")
    print(f"   📈 Sannolikhetsintervall: {result['min_prob']:.1f}% - {result['max_prob']:.1f}%")
    print(f"   📊 Konturlinjer: {result['contour_levels']}")
    
    print("\n🏁 Förbättrad makrillkarta genererad!")
    print("✅ Glow-effekt framhäver hotspots")
    print("✅ Konturlinjer markerar kritiska nivåer")
    print("✅ Colorcet.fire för perceptuell uniformitet")

if __name__ == "__main__":
    main() 