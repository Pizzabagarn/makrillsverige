#!/usr/bin/env python3
"""
Script för att generera interpolerade bilder för marina parametrar.
Stöder strömstyrka, vattentemperatur och salthalt med egna färgskalor.
Liknar FCOO Marine Forecast-systemet med färgade zoner.
"""

import json
import gzip
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as colors
from scipy.interpolate import griddata
from datetime import datetime
import os
from pathlib import Path
import geojson
from shapely.geometry import shape, Point
import argparse

# FÄRGSKALOR FÖR OLIKA PARAMETRAR

# Strömstyrka (0-1.2+ m/s, motsvarar 0-2.3+ knop)
CURRENT_COLORMAP = [
    (0.0, '#000080'),    # Mörk blå för 0.0 m/s
    (0.1, '#0080FF'),    # Ljusare blå för 0.1 m/s
    (0.2, '#00FF80'),    # Grön för 0.2 m/s  
    (0.4, '#80FF00'),    # Gul-grön för 0.4 m/s
    (0.6, '#FFFF00'),    # Gul för 0.6 m/s
    (0.8, '#FF8000'),    # Orange för 0.8 m/s
    (1.0, '#FF4000'),    # Röd-orange för 1.0 m/s
    (1.1, '#FF0000'),    # Röd för 1.1 m/s
    (1.2, '#800000'),    # Mörk röd för 1.2 m/s (≈ 2.3 knop)
    (1.3, '#400000'),    # Mycket mörk röd för 1.2+ m/s (extrema värden)
]

# Vattentemperatur (12-22°C, typisk för svenska vatten)
TEMPERATURE_COLORMAP = [
    (12.0, '#000080'),   # Mörk blå för kallt vatten (12°C)
    (13.0, '#0040FF'),   # Blå för 13°C
    (14.0, '#0080FF'),   # Ljusblå för 14°C
    (15.0, '#00C0FF'),   # Cyan för 15°C
    (16.0, '#00FFFF'),   # Turkos för 16°C
    (17.0, '#40FF80'),   # Grön-turkos för 17°C
    (18.0, '#80FF40'),   # Gul-grön för 18°C
    (19.0, '#FFFF00'),   # Gul för 19°C
    (20.0, '#FF8000'),   # Orange för 20°C
    (21.0, '#FF4000'),   # Röd-orange för 21°C
    (22.0, '#FF0000'),   # Röd för varmt vatten (22°C)
]

# Salthalt (5-35 PSU, från bräckt till salt havsvatten)
SALINITY_COLORMAP = [
    (5.0,  '#8B4513'),   # Brun för mycket låg salthalt (bräckt)
    (8.0,  '#D2691E'),   # Orange-brun för låg salthalt
    (12.0, '#FF8C00'),   # Orange för låg-medel salthalt
    (15.0, '#FFD700'),   # Guld för medel salthalt
    (18.0, '#FFFF00'),   # Gul för medel-hög salthalt
    (22.0, '#90EE90'),   # Ljusgrön för hög salthalt
    (26.0, '#00FF7F'),   # Grön för mycket hög salthalt
    (30.0, '#00CED1'),   # Turkos för saltvatten
    (33.0, '#0080FF'),   # Blå för högsalt havsvatten
    (35.0, '#000080'),   # Mörk blå för extremt salt vatten
]

def get_parameter_config(parameter):
    """Hämta konfiguration för en specifik parameter"""
    if parameter == 'current':
        return {
            'colormap': CURRENT_COLORMAP,
            'unit': 'm/s',
            'name': 'strömstyrka',
            'name_en': 'current_magnitude'
        }
    elif parameter == 'temperature':
        return {
            'colormap': TEMPERATURE_COLORMAP,
            'unit': '°C',
            'name': 'vattentemperatur',
            'name_en': 'temperature'
        }
    elif parameter == 'salinity':
        return {
            'colormap': SALINITY_COLORMAP,
            'unit': 'PSU',
            'name': 'salthalt',
            'name_en': 'salinity'
        }
    else:
        raise ValueError(f"Okänd parameter: {parameter}")

def create_colormap(parameter):
    """Skapa en colormap som matchar FCOO:s färgschema för specifik parameter"""
    config = get_parameter_config(parameter)
    colormap_data = config['colormap']
    
    values = [item[0] for item in colormap_data]
    colors_list = [item[1] for item in colormap_data]
    
    # Normalisera värden till 0-1 för matplotlib
    norm_values = [(v - min(values)) / (max(values) - min(values)) for v in values]
    
    # Skapa colormap
    cmap = colors.LinearSegmentedColormap.from_list(
        f'{parameter}_colormap', 
        list(zip(norm_values, colors_list))
    )
    return cmap, min(values), max(values)

def load_water_mask(geojson_path):
    """Ladda vattenmask från GeoJSON för att begränsa interpolation"""
    print(f"🌊 Laddar vattenmask från {geojson_path}")
    
    with open(geojson_path, 'r', encoding='utf-8') as f:
        water_geojson = geojson.load(f)
    
    # Skapa Shapely-geometrier från alla polygoner
    water_polygons = []
    for feature in water_geojson['features']:
        if feature['geometry']['type'] in ['Polygon', 'MultiPolygon']:
            water_polygons.append(shape(feature['geometry']))
    
    print(f"✅ Laddade {len(water_polygons)} vattenpolygoner")
    return water_polygons

def point_in_water(lon, lat, water_polygons):
    """Kontrollera om en punkt är i vatten"""
    point = Point(lon, lat)
    return any(polygon.contains(point) for polygon in water_polygons)

def load_area_parameters(file_path):
    """Ladda och dekomprimera area-parameters data"""
    print(f"📦 Laddar area-parameters från {file_path}")
    
    with gzip.open(file_path, 'rt', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"✅ Laddade {len(data['points'])} punkter med {len(data['metadata']['timestamps'])} tidssteg")
    return data

def extract_parameter_data_for_timestamp(area_data, timestamp_prefix, water_point_cache, parameter):
    """Extrahera parameterdata för en specifik tidsstämpel"""
    lons, lats, values = [], [], []
    
    for point in area_data['points']:
        lat, lon = point['lat'], point['lon']
        
        # Använd cache för att snabbt kolla om punkten är i vatten
        point_key = f"{lat:.4f},{lon:.4f}"
        if point_key not in water_point_cache:
            continue
            
        # Hitta data för rätt tidsstämpel
        for data_entry in point['data']:
            if data_entry['time'].startswith(timestamp_prefix):
                value = None
                
                if parameter == 'current':
                    if 'current' in data_entry and data_entry['current']:
                        u = data_entry['current'].get('u')
                        v = data_entry['current'].get('v')
                        if u is not None and v is not None:
                            # Beräkna strömstyrka (magnitude) i m/s
                            value = np.sqrt(u**2 + v**2)
                
                elif parameter == 'temperature':
                    if 'temperature' in data_entry:
                        value = data_entry['temperature']
                
                elif parameter == 'salinity':
                    if 'salinity' in data_entry:
                        value = data_entry['salinity']
                
                if value is not None:
                    lons.append(lon)
                    lats.append(lat)
                    values.append(value)
                break
    
    return np.array(lons), np.array(lats), np.array(values)

def create_interpolated_image(lons, lats, values, water_mask_grid, output_path, timestamp, bbox, parameter):
    """Skapa interpolerad PNG-bild av specifik parameter"""
    
    config = get_parameter_config(parameter)
    param_name = config['name']
    unit = config['unit']
    
    if len(lons) == 0:
        print(f"⚠️ Ingen {param_name}-data för {timestamp}")
        return False
    
    # Använd samma upplösning som förcachad mask
    lon_min, lon_max, lat_min, lat_max = bbox
    grid_resolution = water_mask_grid.shape[0]  # Matcha cachad mask-storlek
    
    lon_grid = np.linspace(lon_min, lon_max, grid_resolution)
    lat_grid = np.linspace(lat_min, lat_max, grid_resolution)
    lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
    
    print(f"🔄 Interpolerar {len(values)} {param_name}-punkter till {grid_resolution}x{grid_resolution} grid...")
    
    # Interpolera med scipy.griddata (cubic metod för mest accurate data)
    try:
        grid_values = griddata(
            (lons, lats), 
            values, 
            (lon_mesh, lat_mesh), 
            method='cubic',
            fill_value=np.nan  # Använd NaN istället för 0 för att undvika falska värden
        )
        
        # Om cubic interpolation lämnar för många NaN-värden, prova nearest som fallback
        nan_count = np.sum(np.isnan(grid_values))
        total_count = grid_values.size
        nan_percentage = (nan_count / total_count) * 100
        
        print(f"   📊 Cubic interpolation: {nan_percentage:.1f}% NaN-värden")
        
        # Om för många NaN-värden (>50%), använd nearest som fallback för de saknade områdena
        if nan_percentage > 50:
            print(f"   🔄 För många NaN-värden, använder nearest som fallback...")
            grid_values_nearest = griddata(
                (lons, lats), 
                values, 
                (lon_mesh, lat_mesh), 
                method='nearest',
                fill_value=np.nan
            )
            
            # Fyll bara de områden som är NaN i cubic interpolation
            nan_mask = np.isnan(grid_values)
            grid_values[nan_mask] = grid_values_nearest[nan_mask]
            
            final_nan_count = np.sum(np.isnan(grid_values))
            final_nan_percentage = (final_nan_count / total_count) * 100
            print(f"   ✅ Efter nearest fallback: {final_nan_percentage:.1f}% NaN-värden")
    
    except Exception as e:
        print(f"❌ Interpolation misslyckades för {param_name} {timestamp}: {e}")
        return False
    
    # Fixa negativa värden från cubic interpolation för vissa parametrar
    if parameter in ['current', 'salinity'] and np.any(grid_values < 0):
        negative_count = np.sum(grid_values < 0)
        print(f"   🔧 Fixar {negative_count} negativa värden från cubic interpolation...")
        grid_values = np.maximum(grid_values, 0)  # Klämma till >= 0
    
    # Använd förcachad vattenmask (mycket snabbare)
    print("🌊 Applicerar förcachad vattenmask...")
    
    # Applicera vattenmask (sätt land-områden till NaN för transparens)
    grid_values[~water_mask_grid] = np.nan
    
    # DEBUG: Analysera värdena som plottas
    valid_values = grid_values[~np.isnan(grid_values)]
    if len(valid_values) > 0:
        print(f"   📊 {param_name.title()}-statistik:")
        print(f"      Min: {np.min(valid_values):.3f} {unit}")
        print(f"      Max: {np.max(valid_values):.3f} {unit}") 
        print(f"      Medel: {np.mean(valid_values):.3f} {unit}")
        print(f"      Antal pixlar med data: {len(valid_values)}")
    
    # Skapa figur och plot
    cmap, vmin, vmax = create_colormap(parameter)
    print(f"   🎨 {param_name.title()} colormap range: {vmin:.2f} - {vmax:.2f} {unit}")
    
    fig, ax = plt.subplots(figsize=(12, 12), dpi=150)
    ax.set_xlim(lon_min, lon_max)
    ax.set_ylim(lat_min, lat_max)
    ax.axis('off')  # Ingen axlar för ren bildexport
    
    # Plotta interpolerad data
    im = ax.imshow(
        grid_values,
        extent=[lon_min, lon_max, lat_min, lat_max],
        origin='lower',
        cmap=cmap,
        vmin=vmin,
        vmax=vmax,
        alpha=0.8,  # Lätt transparens för overlay
        interpolation='bilinear'
    )
    
    # Spara som PNG med transparent bakgrund
    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
    plt.savefig(
        output_path,
        format='png',
        dpi=150,
        bbox_inches='tight',
        pad_inches=0,
        transparent=True,
        facecolor='none'
    )
    plt.close()
    
    print(f"✅ Sparade {output_path}")
    return True

def get_bbox_from_water_mask(water_polygons):
    """Beräkna bounding box från vattenmasken"""
    all_bounds = []
    for polygon in water_polygons:
        all_bounds.extend(polygon.bounds)
    
    if not all_bounds:
        # Fallback för Skandinaviska vatten
        return (7.5, 13.5, 54.5, 58.0)  # lon_min, lon_max, lat_min, lat_max
    
    lons = all_bounds[::4] + all_bounds[2::4]  # min_x och max_x
    lats = all_bounds[1::4] + all_bounds[3::4]  # min_y och max_y
    
    return (min(lons), max(lons), min(lats), max(lats))

def create_water_point_cache(area_data, water_polygons):
    """Skapa cache för vilka punkter som är i vatten - gör bara en gång"""
    print("🔄 Skapar cache för vattenpunkter...")
    cache = {}
    total_points = len(area_data['points'])
    
    for i, point in enumerate(area_data['points']):
        if i % 1000 == 0:
            print(f"   Processar punkt {i}/{total_points}")
        
        lat, lon = point['lat'], point['lon']
        point_key = f"{lat:.4f},{lon:.4f}"
        
        if point_in_water(lon, lat, water_polygons):
            cache[point_key] = True
    
    print(f"✅ Cache skapad: {len(cache)} vattenpunkter av {total_points} totalt")
    return cache

def create_water_mask_grid(water_polygons, bbox, grid_resolution):
    """Skapa en förcachad vattenmask-grid för snabb bildgeneration"""
    print(f"🌊 Skapar högruppläst vattenmask-grid ({grid_resolution}x{grid_resolution})...")
    
    lon_min, lon_max, lat_min, lat_max = bbox
    lon_grid = np.linspace(lon_min, lon_max, grid_resolution)
    lat_grid = np.linspace(lat_min, lat_max, grid_resolution)
    lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
    
    water_mask = np.zeros((grid_resolution, grid_resolution), dtype=bool)
    total_pixels = grid_resolution * grid_resolution
    
    for i in range(grid_resolution):
        if i % 100 == 0:
            print(f"   Rad {i}/{grid_resolution} ({100*i/grid_resolution:.1f}%)")
        
        for j in range(grid_resolution):
            lon_point = lon_mesh[i, j]
            lat_point = lat_mesh[i, j]
            
            if point_in_water(lon_point, lat_point, water_polygons):
                water_mask[i, j] = True
    
    water_pixels = np.sum(water_mask)
    print(f"✅ Vattenmask-grid skapad: {water_pixels}/{total_pixels} pixlar är vatten ({100*water_pixels/total_pixels:.1f}%)")
    return water_mask

def main():
    parser = argparse.ArgumentParser(description='Generera strömstyrka-bilder från area-parameters')
    parser.add_argument('--input', default='public/data/area-parameters-extended.json.gz', 
                       help='Sökväg till komprimerad area-parameters fil')
    parser.add_argument('--water-mask', default='public/data/scandinavian-waters.geojson',
                       help='Sökväg till vattenmask GeoJSON')
    parser.add_argument('--output-dir', default='public/data/current-magnitude-images',
                       help='Output-directory för PNG-bilder')
    parser.add_argument('--max-images', type=int, default=None,
                       help='Maximal antal bilder att generera (för testning)')
    parser.add_argument('--resolution', type=int, default=1200,
                       help='Grid-upplösning för interpolation (default: 1200x1200)')
    parser.add_argument('--force', action='store_true',
                       help='Skriv över befintliga bilder (standard: hoppa över befintliga)')
    
    args = parser.parse_args()
    
    # Skapa output-directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("📦 Laddar och förbearbetar data...")
    # Ladda data EN GÅNG
    water_polygons = load_water_mask(args.water_mask)
    area_data = load_area_parameters(args.input)
    
    # Beräkna bounding box
    bbox = get_bbox_from_water_mask(water_polygons)
    print(f"🗺️ Bounding box: {bbox}")
    
    # OPTIMERING: Skapa cachade strukturer EN GÅNG
    print("⚡ Förbearbetar för maximal prestanda...")
    water_point_cache = create_water_point_cache(area_data, water_polygons)
    water_mask_grid = create_water_mask_grid(water_polygons, bbox, args.resolution)
    
    # Frigör minne från vattenpolygoner (behövs inte längre)
    del water_polygons
    
    # Generera bilder för varje tidssteg
    timestamps = area_data['metadata']['timestamps']
    total_count = len(timestamps)
    
    if args.max_images:
        timestamps = timestamps[:args.max_images]
        print(f"🔬 Begränsar till {args.max_images} bilder för testning")
    
    print(f"\n🚀 Startar bildgeneration med {args.resolution}x{args.resolution} upplösning...")
    successful_count = 0
    
    for i, timestamp in enumerate(timestamps):
        print(f"\n📸 Bearbetar {i+1}/{len(timestamps)}: {timestamp}")
        
        # Extrahera tidsstämpel-prefix (första 13 tecken: YYYY-MM-DDTHH)
        timestamp_prefix = timestamp[:13]
        
        # Skapa säkert filnamn
        safe_timestamp = timestamp.replace(':', '-').replace('+', 'plus')
        output_path = output_dir / f"{timestamp_prefix}_{safe_timestamp}.png"
        
        # Hoppa över om filen redan existerar (såvida inte --force används)
        if output_path.exists() and not args.force:
            print(f"⏭️ Hoppar över befintlig fil: {output_path}")
            successful_count += 1
            continue
        elif output_path.exists() and args.force:
            print(f"🔄 Skriver över befintlig fil: {output_path}")
        
        # Extrahera strömdata för denna tidsstämpel (använd cache)
        lons, lats, values = extract_parameter_data_for_timestamp(
            area_data, timestamp_prefix, water_point_cache, 'current'
        )
        
        if len(lons) > 0:
            # Skapa interpolerad bild (använd förcachad mask)
            success = create_interpolated_image(
                lons, lats, values, water_mask_grid, 
                output_path, timestamp, bbox, 'current'
            )
            if success:
                successful_count += 1
        else:
            print(f"⚠️ Ingen strömdata för {timestamp}")
    
    print(f"\n🎉 Klar! Genererade {successful_count}/{total_count} bilder")
    print(f"📁 Bilder sparade i: {output_dir.absolute()}")
    
    # Skapa även en metadata-fil för frontend
    metadata = {
        "bbox": bbox,
        "total_images": successful_count,
        "timestamps": area_data['metadata']['timestamps'],
        "colormap": CURRENT_COLORMAP,
        "resolution": args.resolution,
        "generated_at": datetime.now().isoformat()
    }
    
    metadata_path = output_dir / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"📋 Metadata sparad i: {metadata_path}")

if __name__ == "__main__":
    main() 