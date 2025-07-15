#!/usr/bin/env python3
"""
Extraherar färger från colorcet.fire för frontend-legenden
Baserat på det verkliga värdeintervallet från makrill-dataanalysen
"""

import numpy as np
import matplotlib.pyplot as plt
import colorcet as cc
import json

def extract_fire_colormap(min_val=-39.0, max_val=102.2, num_colors=50):
    """
    Extraherar färger från colorcet.fire för specificerat värdeintervall
    """
    
    # Skapa värdeintervall från min till max
    values = np.linspace(min_val, max_val, num_colors)
    
    # Hämta colorcet.fire colormap
    fire_cmap = cc.fire
    
    # Normalisera värden till 0-1 range för colormap
    normalized_values = (values - min_val) / (max_val - min_val)
    
    # Extrahera färger från colormap
    colors = []
    for i, (value, norm_val) in enumerate(zip(values, normalized_values)):
        # Få RGB-värden från colormap
        rgba = fire_cmap(norm_val)
        
        # Konvertera till hex
        hex_color = "#{:02x}{:02x}{:02x}".format(
            int(rgba[0] * 255),
            int(rgba[1] * 255),
            int(rgba[2] * 255)
        )
        
        colors.append({
            "value": round(value, 1),
            "color": hex_color,
            "label": f"{value:.1f}%" if i % 5 == 0 else ""  # Bara label på var 5:e
        })
    
    return colors

def create_frontend_colormap():
    """Skapa optimerad colormap för frontend-legenden"""
    
    # Viktiga brytpunkter för makrill-sannolikhet
    key_values = [
        -39.0,  # Absolut minimum
        -30.0,  # Negativ region
        -20.0,  # Negativ region
        -10.0,  # Negativ region
        0.0,    # Neutral punkt
        10.0,   # Låg sannolikhet
        20.0,   # Låg sannolikhet
        30.0,   # Medel (runt medelvärde 32.2%)
        40.0,   # Måttlig sannolikhet
        50.0,   # Hög sannolikhet
        60.0,   # Mycket hög sannolikhet
        70.0,   # Hotspot början
        80.0,   # Hotspot
        90.0,   # Stark hotspot
        95.0,   # Mycket stark hotspot
        100.0,  # Maximum hotspot
        102.2   # Absolut maximum
    ]
    
    # Hämta colorcet.fire colormap
    fire_cmap = cc.fire
    
    # Skapa färgkarta för nyckelvärdena
    min_val, max_val = min(key_values), max(key_values)
    colors = []
    
    for value in key_values:
        # Normalisera värde till 0-1 range
        norm_val = (value - min_val) / (max_val - min_val)
        
        # Få RGB-värden från colormap
        rgba = fire_cmap(norm_val)
        
        # Konvertera till hex
        hex_color = "#{:02x}{:02x}{:02x}".format(
            int(rgba[0] * 255),
            int(rgba[1] * 255),
            int(rgba[2] * 255)
        )
        
        colors.append({
            "value": value,
            "color": hex_color,
            "label": f"{value:.1f}%"
        })
    
    return colors

def main():
    print("🎨 Extraherar colorcet.fire färger för frontend...")
    
    # Skapa colormap för frontend
    frontend_colors = create_frontend_colormap()
    
    # Visa några exempel
    print("\n🔥 Colorcet.fire färger för makrill-legenden:")
    print("=" * 50)
    
    for color in frontend_colors:
        print(f"  {color['value']:6.1f}% → {color['color']}")
    
    # Spara som JSON för frontend
    output_data = {
        "colormap_name": "colorcet.fire",
        "description": "Perceptuellt uniform hotspot-visualisering",
        "value_range": [-39.0, 102.2],
        "colors": frontend_colors
    }
    
    with open('mackerel_fire_colormap.json', 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n💾 Sparade {len(frontend_colors)} färger till: mackerel_fire_colormap.json")
    
    # Skapa TypeScript-format för direktintegration
    print("\n📝 TypeScript-format för frontend:")
    print("=" * 50)
    print("const MACKEREL_FIRE_COLORMAP = [")
    
    for i, color in enumerate(frontend_colors):
        comma = "," if i < len(frontend_colors) - 1 else ""
        print(f"  {{ value: {color['value']}, color: '{color['color']}', label: '{color['label']}' }}{comma}")
    
    print("];")
    
    print("\n🏁 Färgextraktion klar!")
    print("✅ Använd dessa färger i MackerelLegend.tsx och colormap-utils.ts")

if __name__ == "__main__":
    main() 