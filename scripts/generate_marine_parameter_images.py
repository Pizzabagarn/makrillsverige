#!/usr/bin/env python3
"""
Script för att generera interpolerade bilder för marina parametrar.
Baserat på generate_current_magnitude_images.py men stöder strömstyrka, vattentemperatur och salthalt.
Liknar FCOO Marine Forecast-systemet med färgade zoner för varje parameter.
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
from matplotlib.colors import LinearSegmentedColormap

# FÄRGSKALOR FÖR OLIKA PARAMETRAR

# Strömstyrka (0-1.3+ m/s, motsvarar 0-2.5+ knop)
CURRENT_COLORMAP = [
    (0.0, '#000080'),    # Mörk blå för 0.0 m/s
    (0.1, '#0080FF'),    # Ljusare blå för 0.1 m/s
    (0.2, '#00FF80'),    # Grön för 0.2 m/s  
    (0.4, '#80FF00'),    # Gul-grön för 0.4 m/s
    (0.6, '#FFFF00'),    # Gul för 0.6 m/s
    (0.8, '#FF8000'),    # Orange för 0.8 m/s
    (1.0, '#FF4000'),    # Röd-orange för 1.0 m/s
    (1.1, '#FF0000'),    # Röd för 1.1 m/s
    (1.2, '#800000'),    # Mörk röd för 1.2 m/s
    (1.3, '#400000'),    # Mycket mörk röd för 1.3+ m/s
]

# Vattentemperatur - Enklare färgschema: mörkblå → ljusblå → grön → gul → orange → röd
TEMPERATURE_COLORMAP = [
    (-1.0, '#000080'),   # Mörkblå
    (2.0,  '#0066FF'),   # Ljusblå  
    (8.0,  '#00AA00'),   # Grön
    (12.0, '#FFFF00'),   # Gul
    (16.0, '#FF8800'),   # Orange
    (24.0, '#FF0000'),   # Röd
]

# Salthalt - Enklare färgschema: mörkgrön → ljusgrön → gul → ljusblå → mörkblå
SALINITY_COLORMAP = [
    (0.0,  '#004400'),   # Mörkgrön
    (8.0,  '#00BB00'),   # Ljusgrön
    (16.0, '#FFFF00'),   # Gul (mittenvärdet)
    (24.0, '#66CCFF'),   # Ljusblå
    (36.0, '#000066'),   # Mörkblå
]

def get_parameter_config(parameter):
    """Hämta konfiguration för en specifik parameter"""
    if parameter == 'current':
        return {
            'colormap': CURRENT_COLORMAP,
            'unit': 'm/s',
            'name': 'strömstyrka',
            'name_en': 'current_magnitude',
            'output_dir': 'current-magnitude-images'
        }
    elif parameter == 'temperature':
        return {
            'colormap': TEMPERATURE_COLORMAP,
            'unit': '°C',
            'name': 'vattentemperatur',
            'name_en': 'temperature',
            'output_dir': 'temperature-images'
        }
    elif parameter == 'salinity':
        return {
            'colormap': SALINITY_COLORMAP,
            'unit': 'g/kg',
            'name': 'salthalt',
            'name_en': 'salinity',
            'output_dir': 'salinity-images'
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
    
    # Använd NORMAL grid (ingen margin - edge enhancement räcker!)
    lon_grid = np.linspace(lon_min, lon_max, grid_resolution)
    lat_grid = np.linspace(lat_min, lat_max, grid_resolution)
    lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
    
    # EDGE ENHANCEMENT: Lägg till extrapolerade punkter vid bbox-kanter
    print(f"🔧 Skapar edge-points för full bbox-täckning...")
    
    # Skapa edge points längs bbox-kanterna
    edge_lons = []
    edge_lats = []
    edge_values = []
    
    # Antal edge points per kant (mer för bättre täckning)
    n_edge_points = 25
    
    # Vänster kant (lon_min)
    for lat in np.linspace(lat_min, lat_max, n_edge_points):
        # Hitta närmaste punkt för extrapolation
        distances = np.sqrt((lons - lon_min)**2 + (lats - lat)**2)
        nearest_idx = np.argmin(distances)
        edge_lons.append(lon_min)
        edge_lats.append(lat)
        edge_values.append(values[nearest_idx])
    
    # Höger kant (lon_max)
    for lat in np.linspace(lat_min, lat_max, n_edge_points):
        distances = np.sqrt((lons - lon_max)**2 + (lats - lat)**2)
        nearest_idx = np.argmin(distances)
        edge_lons.append(lon_max)
        edge_lats.append(lat)
        edge_values.append(values[nearest_idx])
    
    # Botten kant (lat_min)
    for lon in np.linspace(lon_min, lon_max, n_edge_points):
        distances = np.sqrt((lons - lon)**2 + (lats - lat_min)**2)
        nearest_idx = np.argmin(distances)
        edge_lons.append(lon)
        edge_lats.append(lat_min)
        edge_values.append(values[nearest_idx])
    
    # Topp kant (lat_max)
    for lon in np.linspace(lon_min, lon_max, n_edge_points):
        distances = np.sqrt((lons - lon)**2 + (lats - lat_max)**2)
        nearest_idx = np.argmin(distances)
        edge_lons.append(lon)
        edge_lats.append(lat_max)
        edge_values.append(values[nearest_idx])
    
    # Kombinera original data med edge points
    enhanced_lons = np.concatenate([lons, edge_lons])
    enhanced_lats = np.concatenate([lats, edge_lats])
    enhanced_values = np.concatenate([values, edge_values])
    
    print(f"🔄 Interpolerar {len(enhanced_values)} punkter (inkl. {len(edge_values)} edge-points) till {grid_resolution}x{grid_resolution} grid...")
    
    # Interpolera med scipy.griddata (cubic för bästa kvalitet nu när vi inte har gigantisk grid)
    try:
        grid_values = griddata(
            (enhanced_lons, enhanced_lats), 
            enhanced_values, 
            (lon_mesh, lat_mesh), 
            method='cubic',  # Bästa kvalitet
            fill_value=np.nan
        )
        
        # För att nå längre ut till kanterna, fyll NaN-områden med nearest neighbor
        nan_mask = np.isnan(grid_values)
        if np.any(nan_mask):
            grid_values_nearest = griddata(
                (enhanced_lons, enhanced_lats), 
                enhanced_values, 
                (lon_mesh, lat_mesh), 
                method='nearest',
                fill_value=np.nan
            )
            # Fyll bara NaN-områden med nearest neighbor
            grid_values[nan_mask] = grid_values_nearest[nan_mask]
        
        # PADDING STEP: Fyll eventuella NaN-områden vid kanterna med extrapolation
        if np.any(np.isnan(grid_values)):
            print("🔧 Applicerar kant-padding för att fylla gap till bbox-kanter...")
            
            # Hitta alla NaN-positioner
            nan_mask = np.isnan(grid_values)
            
            # Använd nearest neighbor för att extrapolera till kanter
            from scipy.ndimage import binary_dilation
            
            # Iterativt fyll NaN-värden med grannvärden
            iterations = 0
            max_iterations = 20  # Säkerhetsgräns
            
            while np.any(nan_mask) and iterations < max_iterations:
                # Skapa en dilated mask för att hitta gränsen
                dilated = binary_dilation(~nan_mask)
                
                # Fyll NaN-värden vid gränsen med genomsnitt av grannar
                for i in range(grid_values.shape[0]):
                    for j in range(grid_values.shape[1]):
                        if nan_mask[i, j] and dilated[i, j]:
                            # Samla värden från grannar som inte är NaN
                            neighbors = []
                            for di in [-1, 0, 1]:
                                for dj in [-1, 0, 1]:
                                    ni, nj = i + di, j + dj
                                    if (0 <= ni < grid_values.shape[0] and 
                                        0 <= nj < grid_values.shape[1] and 
                                        not np.isnan(grid_values[ni, nj])):
                                        neighbors.append(grid_values[ni, nj])
                            
                            if neighbors:
                                grid_values[i, j] = np.mean(neighbors)
                                nan_mask[i, j] = False
                
                iterations += 1
            
            remaining_nan = np.sum(nan_mask)
            print(f"   ✅ Padding klar efter {iterations} iterationer. {remaining_nan} NaN kvar.")
            
            # Om det fortfarande finns NaN, använd global nearest neighbor som backup
            if remaining_nan > 0:
                print("   🔄 Final backup med nearest neighbor...")
                grid_values_backup = griddata(
                    (lons, lats), 
                    values, 
                    (lon_mesh, lat_mesh), 
                    method='nearest'
                )
                grid_values[nan_mask] = grid_values_backup[nan_mask]
        
        # Kolla slutresultat
        nan_count = np.sum(np.isnan(grid_values))
        total_count = grid_values.size
        nan_percentage = (nan_count / total_count) * 100
        print(f"   📊 Interpolation slutresultat: {nan_percentage:.1f}% NaN-värden")
    
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
    
    # Använd mindre figur och lägre DPI för att undvika memory-problem
    fig, ax = plt.subplots(figsize=(8, 8), dpi=100)
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
        interpolation='nearest'  # Använd nearest för mindre memory usage
    )
    
    # Spara som PNG med transparent bakgrund
    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
    plt.savefig(
        output_path,
        format='png',
        dpi=100,
        bbox_inches='tight',  # Återställ tight cropping
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

def clear_directory(directory_path):
    """Töm en mapp på alla PNG-filer"""
    if not os.path.exists(directory_path):
        os.makedirs(directory_path, exist_ok=True)
        return
        
    # Ta bort alla PNG-filer i mappen
    png_files = list(Path(directory_path).glob("*.png"))
    if png_files:
        print(f"   🗑️ Tömmer mapp: {len(png_files)} gamla bilder...")
        for file in png_files:
            try:
                file.unlink()
            except Exception as e:
                print(f"   ⚠️ Kunde inte radera {file.name}: {e}")
    else:
        print(f"   ✨ Mapp redan tom")

def generate_images_for_parameter(parameter, area_data, water_point_cache, water_mask_grid, bbox, output_base_dir, resolution, max_images, force):
    """Generera bilder för en specifik parameter"""
    config = get_parameter_config(parameter)
    param_name = config['name']
    output_dir_name = config['output_dir']
    
    # Skapa parameter-specifik output-directory
    output_dir = Path(output_base_dir) / output_dir_name
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Töm mappen på gamla bilder (alltid när force är aktiverat eller första gången)
    print(f"\n🚀 Genererar {param_name}-bilder i {output_dir}")
    clear_directory(output_dir)
    
    # Hämta tidsstämplar
    timestamps = area_data['metadata']['timestamps']
    if max_images:
        timestamps = timestamps[:max_images]
        print(f"🔬 Begränsar till {max_images} bilder för testning")
    
    successful_count = 0
    
    for i, timestamp in enumerate(timestamps):
        print(f"\n📸 {param_name.title()} {i+1}/{len(timestamps)}: {timestamp}")
        
        # Extrahera tidsstämpel-prefix (första 13 tecken: YYYY-MM-DDTHH)
        timestamp_prefix = timestamp[:13]
        
        # Skapa säkert filnamn med parameter-prefix
        safe_timestamp = timestamp.replace(':', '-').replace('+', 'plus')
        output_path = output_dir / f"{config['name_en']}_{safe_timestamp}.png"
        
        # Hoppa över om filen redan existerar (såvida inte --force används)
        if output_path.exists() and not force:
            print(f"⏭️ Hoppar över befintlig fil")
            successful_count += 1
            continue
        elif output_path.exists() and force:
            print(f"🔄 Skriver över befintlig fil")
        
        # Extrahera parameterdata för denna tidsstämpel
        lons, lats, values = extract_parameter_data_for_timestamp(
            area_data, timestamp_prefix, water_point_cache, parameter
        )
        
        if len(lons) > 0:
            # Skapa interpolerad bild
            success = create_interpolated_image(
                lons, lats, values, water_mask_grid, 
                output_path, timestamp, bbox, parameter
            )
            if success:
                successful_count += 1
        else:
            print(f"⚠️ Ingen {param_name}-data för {timestamp}")
    
    print(f"\n🎉 {param_name.title()}: Genererade {successful_count}/{len(timestamps)} bilder")
    
    # Skapa metadata-fil för denna parameter
    metadata = {
        "parameter": parameter,
        "parameter_name": param_name,
        "unit": config['unit'],
        "bbox": bbox,
        "total_images": successful_count,
        "timestamps": area_data['metadata']['timestamps'],
        "colormap": config['colormap'],
        "resolution": resolution,
        "generated_at": datetime.now().isoformat()
    }
    
    metadata_path = output_dir / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"📋 {param_name.title()} metadata sparad i: {metadata_path}")
    return successful_count, len(timestamps)

def main():
    parser = argparse.ArgumentParser(description='Generera bilder för marina parametrar')
    parser.add_argument('--parameter', choices=['current', 'temperature', 'salinity', 'all'], 
                       default='all', help='Parameter att generera bilder för (default: all)')
    parser.add_argument('--input', default='public/data/area-parameters-extended.json.gz', 
                       help='Sökväg till komprimerad area-parameters fil')
    parser.add_argument('--water-mask', default='public/data/scandinavian-waters.geojson',
                       help='Sökväg till vattenmask GeoJSON')
    parser.add_argument('--output-base-dir', default='public/data',
                       help='Bas-directory för output (parameter-specifika mappar skapas automatiskt)')
    parser.add_argument('--max-images', type=int, default=None,
                       help='Maximal antal bilder att generera per parameter (för testning)')
    parser.add_argument('--resolution', type=int, default=1200,
                       help='Grid-upplösning för interpolation (default: 1200x1200)')
    parser.add_argument('--force', action='store_true',
                       help='Skriv över befintliga bilder (standard: hoppa över befintliga)')
    
    args = parser.parse_args()
    
    print("🌊 MARINA PARAMETER BILDGENERATOR")
    print("=" * 50)
    
    # Bestäm vilka parametrar som ska bearbetas
    if args.parameter == 'all':
        parameters = ['current', 'temperature', 'salinity']
        print("🎯 Genererar bilder för ALLA parametrar")
    else:
        parameters = [args.parameter]
        config = get_parameter_config(args.parameter)
        print(f"🎯 Genererar bilder för {config['name']}")
    
    print(f"📦 Input: {args.input}")
    print(f"📁 Output bas-directory: {args.output_base_dir}")
    print(f"🔧 Upplösning: {args.resolution}x{args.resolution}")
    if args.max_images:
        print(f"🔬 Testläge: Max {args.max_images} bilder per parameter")
    
    # Ladda data EN GÅNG (delas mellan alla parametrar)
    print("\n📦 Laddar och förbearbetar data...")
    water_polygons = load_water_mask(args.water_mask)
    area_data = load_area_parameters(args.input)
    
    # Använd EXAKT samma bbox som frontend Map.tsx maxBounds för perfect alignment
    bbox = (10.3, 16.6, 54.9, 59.6)  # (lon_min, lon_max, lat_min, lat_max)
    print(f"🗺️ Bounding box (hårdkodad för frontend alignment): {bbox}")
    
    # OPTIMERING: Skapa cachade strukturer EN GÅNG
    print("⚡ Förbearbetar för maximal prestanda...")
    water_point_cache = create_water_point_cache(area_data, water_polygons)
    water_mask_grid = create_water_mask_grid(water_polygons, bbox, args.resolution)
    
    # Frigör minne från vattenpolygoner (behövs inte längre)
    del water_polygons
    
    # Generera bilder för varje parameter
    total_successful = 0
    total_images = 0
    
    for parameter in parameters:
        successful, total = generate_images_for_parameter(
            parameter, area_data, water_point_cache, water_mask_grid, bbox,
            args.output_base_dir, args.resolution, args.max_images, args.force
        )
        total_successful += successful
        total_images += total
    
    print("\n" + "=" * 50)
    print("🎉 ALLA PARAMETRAR KLARA!")
    print(f"📊 Totalt: {total_successful}/{total_images} bilder genererade")
    print(f"📁 Bilder sparade i: {Path(args.output_base_dir).absolute()}")
    
    for parameter in parameters:
        config = get_parameter_config(parameter)
        param_dir = Path(args.output_base_dir) / config['output_dir']
        print(f"   • {config['name'].title()}: {param_dir}")

if __name__ == "__main__":
    main() 