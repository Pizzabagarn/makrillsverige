#!/usr/bin/env python3
"""
Script för att generera interpolerade strömstyrka-bilder från area-parameters data.
Liknar FCOO Marine Forecast-systemet med färgade zoner för strömstyrka.
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

# Färgskala som matchar FCOO (0-2.5 knop)
CURRENT_COLORMAP = [
    (0.0, '#000080'),    # Mörk blå för 0 knop
    (0.25, '#0080FF'),   # Ljusare blå för 0.25 knop
    (0.5, '#00FF80'),    # Grön för 0.5 knop  
    (0.75, '#80FF00'),   # Gul-grön för 0.75 knop
    (1.0, '#FFFF00'),    # Gul för 1.0 knop
    (1.25, '#FF8000'),   # Orange för 1.25 knop
    (1.5, '#FF4000'),    # Röd-orange för 1.5 knop
    (1.75, '#FF0000'),   # Röd för 1.75 knop
    (2.0, '#800000'),    # Mörk röd för 2.0 knop
    (2.5, '#400000'),    # Mycket mörk röd för 2.5+ knop
]

def create_colormap():
    """Skapa en colormap som matchar FCOO:s färgschema"""
    values = [item[0] for item in CURRENT_COLORMAP]
    colors_list = [item[1] for item in CURRENT_COLORMAP]
    
    # Normalisera värden till 0-1 för matplotlib
    norm_values = [(v - min(values)) / (max(values) - min(values)) for v in values]
    
    # Skapa colormap
    cmap = colors.LinearSegmentedColormap.from_list(
        'current_speed', 
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

def extract_current_data_for_timestamp(area_data, timestamp_prefix, water_point_cache):
    """Extrahera strömstyrka-data för en specifik tidsstämpel"""
    lons, lats, magnitudes = [], [], []
    
    for point in area_data['points']:
        lat, lon = point['lat'], point['lon']
        
        # Använd cache för att snabbt kolla om punkten är i vatten
        point_key = f"{lat:.4f},{lon:.4f}"
        if point_key not in water_point_cache:
            continue
            
        # Hitta data för rätt tidsstämpel
        for data_entry in point['data']:
            if data_entry['time'].startswith(timestamp_prefix):
                if 'current' in data_entry and data_entry['current']:
                    u = data_entry['current'].get('u')
                    v = data_entry['current'].get('v')
                    
                    if u is not None and v is not None:
                        # Beräkna strömstyrka (magnitude)
                        magnitude = np.sqrt(u**2 + v**2)
                        
                        lons.append(lon)
                        lats.append(lat)
                        magnitudes.append(magnitude)
                break
    
    return np.array(lons), np.array(lats), np.array(magnitudes)

def create_interpolated_image(lons, lats, magnitudes, water_mask_grid, output_path, timestamp, bbox):
    """Skapa interpolerad PNG-bild av strömstyrka"""
    
    if len(lons) == 0:
        print(f"⚠️ Ingen strömdata för {timestamp}")
        return False
    
    # Använd samma upplösning som förcachad mask
    lon_min, lon_max, lat_min, lat_max = bbox
    grid_resolution = water_mask_grid.shape[0]  # Matcha cachad mask-storlek
    
    lon_grid = np.linspace(lon_min, lon_max, grid_resolution)
    lat_grid = np.linspace(lat_min, lat_max, grid_resolution)
    lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
    
    print(f"🔄 Interpolerar {len(magnitudes)} punkter till {grid_resolution}x{grid_resolution} grid...")
    
    # Interpolera med scipy.griddata (linear metod för smidiga övergångar)
    try:
        grid_magnitudes = griddata(
            (lons, lats), 
            magnitudes, 
            (lon_mesh, lat_mesh), 
            method='linear',
            fill_value=0
        )
    except Exception as e:
        print(f"❌ Interpolation misslyckades för {timestamp}: {e}")
        return False
    
    # Använd förcachad vattenmask (mycket snabbare)
    print("🌊 Applicerar förcachad vattenmask...")
    
    # Applicera vattenmask (sätt land-områden till NaN för transparens)
    grid_magnitudes[~water_mask_grid] = np.nan
    
    # Skapa figur och plot
    cmap, vmin, vmax = create_colormap()
    
    fig, ax = plt.subplots(figsize=(12, 12), dpi=150)
    ax.set_xlim(lon_min, lon_max)
    ax.set_ylim(lat_min, lat_max)
    ax.axis('off')  # Ingen axlar för ren bildexport
    
    # Plotta interpolerad data
    im = ax.imshow(
        grid_magnitudes,
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
        output_path = output_dir / f"current_magnitude_{safe_timestamp}.png"
        
        # Hoppa över om filen redan existerar
        if output_path.exists():
            print(f"⏭️ Hoppar över befintlig fil: {output_path}")
            successful_count += 1
            continue
        
        # Extrahera strömdata för denna tidsstämpel (använd cache)
        lons, lats, magnitudes = extract_current_data_for_timestamp(
            area_data, timestamp_prefix, water_point_cache
        )
        
        if len(lons) > 0:
            # Skapa interpolerad bild (använd förcachad mask)
            success = create_interpolated_image(
                lons, lats, magnitudes, water_mask_grid, 
                output_path, timestamp, bbox
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