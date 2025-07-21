#!/usr/bin/env python3
"""
Export marina data för WebGL shader-rendering.
Exporterar förinterpolarad data som Float32Array .bin-filer.
"""

import json
import gzip
import numpy as np
from pathlib import Path
import argparse
from datetime import datetime
import os

def load_area_parameters(input_path):
    """Ladda area-parameters data"""
    print(f"📦 Laddar data från {input_path}...")
    
    if input_path.endswith('.gz'):
        with gzip.open(input_path, 'rt', encoding='utf-8') as f:
            data = json.load(f)
    else:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    
    print(f"✅ Laddade {len(data['points'])} datapunkter")
    return data

def extract_parameter_grid(area_data, parameter='current', grid_size=1400):
    """
    Extrahera och interpolera parameterdata till ett regelbundet grid
    som kan användas direkt i WebGL shaders.
    """
    print(f"🌊 Extraherar {parameter}-data till {grid_size}x{grid_size} grid...")
    
    # Bbox för svenska vatten  
    lon_min, lon_max = 10.3, 16.6
    lat_min, lat_max = 54.9, 59.6
    
    # Skapa koordinat-grid
    lons = np.linspace(lon_min, lon_max, grid_size)
    lats = np.linspace(lat_min, lat_max, grid_size)
    
    # Hämta alla timestamps
    timestamps = area_data['metadata']['timestamps']
    print(f"📅 Exporterar {len(timestamps)} tidssteg")
    
    # Förbered data-container
    # Shape: (timesteps, height, width) - height först för textur-kompatibilitet
    all_data = np.zeros((len(timestamps), grid_size, grid_size), dtype=np.float32)
    
    for t_idx, timestamp in enumerate(timestamps):
        print(f"⏰ Bearbetar {timestamp} ({t_idx+1}/{len(timestamps)})...")
        
        # Extrahera punktdata för denna tidsstämpel
        lons_data, lats_data, values_data = extract_points_for_timestamp(
            area_data, timestamp, parameter
        )
        
        if len(lons_data) == 0:
            print(f"⚠️ Ingen data för {timestamp}")
            continue
        
        # Enkel nearest-neighbor för prototyp
        # (I produktionen skulle du använda scipy.griddata som i dina bildskript)
        grid_data = np.zeros((grid_size, grid_size), dtype=np.float32)
        
        for i, lat in enumerate(lats):
            for j, lon in enumerate(lons):
                # Hitta närmaste datapunkt
                distances = np.sqrt((lat - lats_data)**2 + (lon - lons_data)**2)
                nearest_idx = np.argmin(distances)
                
                # Använd värdet om det är nära nog (< 0.1 grader)
                if distances[nearest_idx] < 0.1:
                    grid_data[i, j] = values_data[nearest_idx]
                else:
                    grid_data[i, j] = np.nan  # Ingen data
        
        all_data[t_idx] = grid_data
    
    return all_data, timestamps, (lon_min, lon_max, lat_min, lat_max)

def extract_points_for_timestamp(area_data, timestamp, parameter):
    """Extrahera punktdata för en specifik tidsstämpel och parameter"""
    lons_data = []
    lats_data = []  
    values_data = []
    
    timestamp_prefix = timestamp[:13]
    
    for point in area_data['points']:
        lat, lon = point['lat'], point['lon']
        
        # Hitta data för rätt tidsstämpel
        for data_entry in point['data']:
            if data_entry['time'].startswith(timestamp_prefix):
                value = None
                
                if parameter == 'current':
                    if 'current' in data_entry and data_entry['current']:
                        u = data_entry['current'].get('u')
                        v = data_entry['current'].get('v') 
                        if u is not None and v is not None:
                            value = np.sqrt(u**2 + v**2)  # Magnitude
                
                elif parameter == 'temperature':
                    if 'temperature' in data_entry:
                        value = data_entry['temperature']
                        
                elif parameter == 'salinity':
                    if 'salinity' in data_entry:
                        value = data_entry['salinity']
                
                if value is not None:
                    lons_data.append(lon)
                    lats_data.append(lat)
                    values_data.append(value)
                break
    
    return np.array(lons_data), np.array(lats_data), np.array(values_data)

def create_colormap_texture(colormap_data, output_path):
    """Skapa 1D colormap textur för WebGL"""
    print(f"🎨 Skapar colormap-textur...")
    
    # Konvertera hex färger till RGBA float32
    colormap_array = np.zeros((len(colormap_data), 4), dtype=np.float32)
    
    for i, (value, hex_color) in enumerate(colormap_data):
        # Konvertera hex till RGB
        r = int(hex_color[1:3], 16) / 255.0
        g = int(hex_color[3:5], 16) / 255.0  
        b = int(hex_color[5:7], 16) / 255.0
        a = 1.0
        
        colormap_array[i] = [r, g, b, a]
    
    # Spara som .bin
    colormap_array.tobytes()
    with open(output_path, 'wb') as f:
        f.write(colormap_array.tobytes())
    
    print(f"✅ Colormap sparad: {output_path}")
    return colormap_array

def main():
    parser = argparse.ArgumentParser(description='Export shader data for WebGL rendering')
    parser.add_argument('--input', '-i', 
                        default='public/data/area-parameters-extended.json.gz',
                        help='Input area-parameters file')
    parser.add_argument('--parameter', '-p', 
                        choices=['current', 'temperature', 'salinity'],
                        default='current',
                        help='Parameter to export')
    parser.add_argument('--grid-size', '-s', type=int, default=512,
                        help='Grid resolution (512, 1024, 1400, etc)')
    parser.add_argument('--output-dir', '-o',
                        default='public/data/shader-data',
                        help='Output directory')
    
    args = parser.parse_args()
    
    # Skapa output-directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("🚀 SHADER DATA EXPORT")
    print(f"📂 Input: {args.input}")
    print(f"🎯 Parameter: {args.parameter}")
    print(f"📐 Grid size: {args.grid_size}x{args.grid_size}")
    print(f"📁 Output: {args.output_dir}")
    
    # Ladda data
    area_data = load_area_parameters(args.input)
    
    # Extrahera grid-data
    grid_data, timestamps, bbox = extract_parameter_grid(
        area_data, args.parameter, args.grid_size
    )
    
    # Spara grid-data som .bin
    data_output = output_dir / f"{args.parameter}_data.bin"
    print(f"💾 Sparar grid-data till {data_output}...")
    
    with open(data_output, 'wb') as f:
        f.write(grid_data.tobytes())
    
    # Spara metadata som JSON
    metadata = {
        'parameter': args.parameter,
        'grid_size': args.grid_size,
        'timestamps': timestamps,
        'bbox': bbox,  # [lon_min, lon_max, lat_min, lat_max]
        'shape': list(grid_data.shape),  # [timesteps, height, width]
        'data_range': [float(np.nanmin(grid_data)), float(np.nanmax(grid_data))],
        'exported_at': datetime.now().isoformat(),
        'file_size_mb': os.path.getsize(data_output) / (1024 * 1024)
    }
    
    metadata_output = output_dir / f"{args.parameter}_metadata.json"
    with open(metadata_output, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    # Skapa colormap för denna parameter
    colormap_data = get_parameter_colormap(args.parameter)
    colormap_output = output_dir / f"{args.parameter}_colormap.bin"
    create_colormap_texture(colormap_data, colormap_output)
    
    print("\n" + "="*50)
    print("🎉 EXPORT SLUTFÖRD!")
    print(f"📊 Data: {data_output} ({metadata['file_size_mb']:.1f} MB)")
    print(f"📋 Metadata: {metadata_output}")  
    print(f"🎨 Colormap: {colormap_output}")
    print(f"📈 Värdeintervall: {metadata['data_range'][0]:.3f} - {metadata['data_range'][1]:.3f}")

def get_parameter_colormap(parameter):
    """Hämta färgskala för parameter"""
    if parameter == 'current':
        return [
            [0.000, "#000066"], [0.068, "#0033CC"], [0.137, "#0066CC"], [0.205, "#00CCFF"],
            [0.274, "#00FFCC"], [0.342, "#00FF66"], [0.411, "#33FF33"], [0.479, "#66FF00"],
            [0.547, "#99FF00"], [0.616, "#CCFF00"], [0.684, "#FFFF00"], [0.753, "#FFCC00"],
            [0.821, "#FF9900"], [0.889, "#FF6600"], [0.958, "#FF3300"], [1.026, "#CC0000"],
            [1.095, "#990000"], [1.163, "#660000"], [1.232, "#330000"], [1.300, "#220000"]
        ]
    elif parameter == 'temperature':
        return [
            [-2.0, "#000080"], [-1.0, "#0000FF"], [0.0, "#0080FF"], [2.0, "#00FFFF"],
            [4.0, "#00FF80"], [6.0, "#00FF00"], [8.0, "#80FF00"], [10.0, "#FFFF00"],
            [12.0, "#FF8000"], [14.0, "#FF4000"], [16.0, "#FF0000"], [18.0, "#800000"],
            [20.0, "#400000"], [22.0, "#200000"], [25.0, "#100000"]
        ]
    elif parameter == 'salinity':
        return [
            [0.0, "#800080"], [5.0, "#0000FF"], [10.0, "#0080FF"], [15.0, "#00FFFF"],
            [20.0, "#00FF80"], [25.0, "#00FF00"], [30.0, "#80FF00"], [35.0, "#FFFF00"]
        ]
    
    return []

if __name__ == "__main__":
    main() 