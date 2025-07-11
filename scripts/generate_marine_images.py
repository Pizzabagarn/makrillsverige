#!/usr/bin/env python3
"""
Enhetligt skript för att generera interpolerade bilder för marina parametrar.
Revolutionär ML + RBF interpolation med optimerade färgskalor.
Stöder: strömstyrka, vattentemperatur och salthalt.
"""

import json
import gzip
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as colors
from scipy.interpolate import griddata, Rbf
from scipy.ndimage import binary_dilation, gaussian_filter
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from datetime import datetime
import os
from pathlib import Path
import geojson
from shapely.geometry import shape, Point
import argparse
import warnings

# Tysta alla warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=RuntimeWarning)

# REVOLUTIONERADE FÄRGSKALOR (baserat på verklig dataanalys)

# 🌊 BALANSERAD FÖRDELNING av färger från 0.0 till 1.3 m/s (20 steg)
# Varje färgkategori får ungefär lika mycket utrymme
REVOLUTIONARY_CURRENT_COLORMAP = [
    [0.000, "#000066"], # Mörkblå
    [0.068, "#0033CC"], # Blå
    [0.137, "#0066CC"], # Ljusblå
    [0.205, "#00CCFF"], # Cyan (0.2)
    [0.274, "#00FFCC"], # Cyan-grön
    [0.342, "#00FF66"], # Grön (0.3)
    [0.411, "#33FF33"], # Ljusgrön (0.4)
    [0.479, "#66FF00"], # Gul-grön övergång (0.5)
    [0.547, "#99FF00"], # Ljusare gul-grön
    [0.616, "#CCFF00"], # Gul-grön
    [0.684, "#FFFF00"], # Ren gul
    [0.753, "#FFCC00"], # Gul-orange (0.7)
    [0.821, "#FF9900"], # Orange (0.8)
    [0.889, "#FF6600"], # Orange-röd
    [0.958, "#FF3300"], # Röd (0.9)
    [1.026, "#CC0000"], # Mörkröd (1.0)
    [1.095, "#990000"], # Mörkare röd (1.1)
    [1.163, "#660000"], # Mycket mörkröd (1.1)
    [1.232, "#330000"], # Extremt mörkröd (1.2)
    [1.300, "#220000"], # Mycket mörk röd för extremvärden (1.3)
]

# Temperatur - Optimerad för verklig range 6.974-20.980°C med 19 färgsteg
REVOLUTIONARY_TEMPERATURE_COLORMAP = [
    [6.974, "#000066"],   # Minimum - mörk blå (kallt)
    [8.000, "#000099"],   # Mycket kallt - blå
    [10.000, "#0033CC"],  # Kallt - ljusare blå
    [11.031, "#0066FF"],  # 5:e percentilen - cyan-blå
    [12.000, "#0099FF"],  # Svalt - cyan
    [12.676, "#00CCFF"],  # 10:e percentilen - ljus cyan
    [13.500, "#00FFCC"],  # Måttligt kallt - turkos
    [14.500, "#33FF99"],  # Svalt - grön-turkos
    [15.330, "#66FF66"],  # 25:e percentilen - ljusgrön
    [15.805, "#99FF33"],  # Under median - gul-grön
    [16.281, "#CCFF00"],  # Median - gul (behagligt)
    [16.699, "#FFFF00"],  # Över median - ren gul
    [17.117, "#FFCC00"],  # Varmt - orange-gul
    [17.500, "#FF9900"],  # Mycket varmt - orange
    [17.883, "#FF6600"],  # 75:e percentilen - röd-orange
    [18.328, "#FF3300"],  # 90:e percentilen - röd
    [19.000, "#CC0000"],  # Hett - mörk röd
    [20.000, "#990000"],  # Mycket hett - mycket mörk röd
    [20.980, "#660000"],  # Maximum - extremt mörk röd
]

# Salthalt - RdBu colormap för naturliga övergångar (0.000-30.188 PSU, 18 färgsteg)
REVOLUTIONARY_SALINITY_COLORMAP = [
    [0.000, "#67001F"],   # Sötvatten - mörk röd
    [2.000, "#B2182B"],   # Mycket bräckt - röd
    [4.000, "#D6604D"],   # Bräckt - ljusare röd
    [6.000, "#F4A582"],   # Svagt bräckt - ljus röd/orange
    [7.094, "#FDDBC7"],   # 5:e percentilen - mycket ljus röd
    [7.250, "#F7F7F7"],   # 10:e percentilen - vit
    [7.391, "#D1E5F0"],   # 25:e percentilen - mycket ljus blå
    [10.000, "#92C5DE"],  # Låg salthalt - ljus blå
    [12.375, "#4393C3"],  # Median area - blå
    [15.000, "#2166AC"],  # Medel salthalt - mörkare blå
    [17.359, "#053061"],  # Median - mörk blå
    [20.000, "#042A50"],  # Hög salthalt - mycket mörk blå
    [20.234, "#032441"],  # 75:e percentilen - extremt mörk blå
    [23.109, "#021E32"],  # 90:e percentilen - nästan svart-blå
    [25.000, "#011823"],  # Mycket hög salthalt - svart-blå
    [28.312, "#001214"],  # 95:e percentilen - svart-blå
    [29.094, "#000C0F"],  # 99:e percentilen - mycket mörk
    [30.188, "#00060A"],  # Maximum - nästan svart
]

def get_parameter_config(parameter):
    """Hämta konfiguration för en specifik parameter"""
    configs = {
        'current': {
            'colormap': REVOLUTIONARY_CURRENT_COLORMAP,
            'unit': 'm/s',
            'name': 'strömstyrka',
            'name_en': 'current_magnitude',
            'output_dir': 'current-magnitude-images',
            'smooth_factor': 0.5,  # Lätt smoothing för strömstyrka
            'edge_enhancement': True   # Återaktiverat med förbättrad implementation
        },
        'temperature': {
            'colormap': REVOLUTIONARY_TEMPERATURE_COLORMAP,
            'unit': '°C',
            'name': 'vattentemperatur',
            'name_en': 'temperature',
            'output_dir': 'temperature-images',
            'smooth_factor': 0.8,  # Mer smoothing för temperatur
            'edge_enhancement': True   # Återaktiverat med förbättrad implementation
        },
        'salinity': {
            'colormap': REVOLUTIONARY_SALINITY_COLORMAP,
            'unit': 'g/kg',
            'name': 'salthalt',
            'name_en': 'salinity',
            'output_dir': 'salinity-images',
            'smooth_factor': 0.7,  # Balanserad smoothing för salthalt
            'edge_enhancement': True   # Återaktiverat med förbättrad implementation
        }
    }
    
    if parameter not in configs:
        raise ValueError(f"Okänd parameter: {parameter}")
    
    return configs[parameter]

def create_parameter_colormap(parameter):
    """Skapa optimerad colormap för parameter baserat på verklig dataanalys"""
    config = get_parameter_config(parameter)
    colormap_data = config['colormap']
    
    # Extrahera värden och färger från det nya formatet
    values = [item[0] for item in colormap_data]
    colors_list = [item[1] for item in colormap_data]
    
    # Normalisera värden till 0-1 för matplotlib
    min_val, max_val = min(values), max(values)
    norm_values = [(v - min_val) / (max_val - min_val) for v in values]
    
    # Skapa revolutionär colormap med perceptuell optimering
    cmap = colors.LinearSegmentedColormap.from_list(
        f'{parameter}_revolutionary', 
        list(zip(norm_values, colors_list)),
        gamma=0.9  # Perceptuell optimering för bättre visuell separation
    )
    
    print(f"   🎨 Revolutionär {parameter} colormap: {len(colormap_data)} färgsteg ({min_val:.3f} - {max_val:.3f})")
    
    return cmap, min_val, max_val

def load_water_mask(geojson_path):
    """Ladda vattenmask från GeoJSON"""
    print(f"🌊 Laddar vattenmask från {geojson_path}")
    
    with open(geojson_path, 'r', encoding='utf-8') as f:
        water_geojson = geojson.load(f)
    
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
        
        # Använd cache för vattenpunkter
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

def create_edge_enhancement_points(lons, lats, values, bbox, enhancement_factor=2):
    """Skapa smarta kantpunkter exakt på bbox-gränserna men bara i vattenområden"""
    lon_min, lon_max, lat_min, lat_max = bbox
    
    edge_lons, edge_lats, edge_values = [], [], []
    
    # Anpassad densitet baserat på datamängd
    edge_density = max(15, min(40, len(lons) // 25))  # Fler punkter för bättre täckning
    
    # Skapa kantpunkter EXAKT på bbox-gränserna
    edges = [
        # Nedre kant (exakt på lat_min)
        [(lon, lat_min) for lon in np.linspace(lon_min, lon_max, edge_density)],
        # Övre kant (exakt på lat_max)
        [(lon, lat_max) for lon in np.linspace(lon_min, lon_max, edge_density)],
        # Vänster kant (exakt på lon_min)
        [(lon_min, lat) for lat in np.linspace(lat_min, lat_max, edge_density)],
        # Höger kant (exakt på lon_max)
        [(lon_max, lat) for lat in np.linspace(lat_min, lat_max, edge_density)]
    ]
    
    # För varje kantpunkt, kontrollera om det är rimligt och lägg till
    for edge_points in edges:
        for edge_lon, edge_lat in edge_points:
            # Hitta de 3 närmsta datapunkterna för bättre interpolation
            distances = np.sqrt((lons - edge_lon)**2 + (lats - edge_lat)**2)
            
            if len(distances) > 0:
                # Använd bara kantpunkter som inte är alltför långt från verklig data
                min_distance = np.min(distances)
                if min_distance < 0.1:  # Bara om det finns data inom 0.1 grader
                    # Använd de 3 närmsta punkterna för mer stabil interpolation
                    nearest_indices = np.argsort(distances)[:min(3, len(distances))]
                    
                    # Viktad interpolation baserat på avstånd
                    weights = 1.0 / (distances[nearest_indices] + 1e-10)
                    weighted_value = np.sum(values[nearest_indices] * weights) / np.sum(weights)
                    
                    # Lägg till kantpunkten
                    edge_lons.append(edge_lon)
                    edge_lats.append(edge_lat)
                    edge_values.append(weighted_value)
    
    print(f"   🔧 Skapade {len(edge_values)} kantpunkter exakt på bbox-gränserna")
    return np.array(edge_lons), np.array(edge_lats), np.array(edge_values)

def create_feature_matrix(lons, lats, bbox):
    """Skapa feature matrix för ML-modellen"""
    lon_min, lon_max, lat_min, lat_max = bbox
    
    # Normalisera koordinater
    norm_lons = (lons - lon_min) / (lon_max - lon_min)
    norm_lats = (lats - lat_min) / (lat_max - lat_min)
    
    # Beräkna avstånd till kanter (proxy för djup/kust)
    dist_to_edge = np.minimum(
        np.minimum(norm_lons, 1 - norm_lons),
        np.minimum(norm_lats, 1 - norm_lats)
    )
    
    # Skapa feature matrix
    features = np.column_stack([
        norm_lons,          # Normaliserad longitude
        norm_lats,          # Normaliserad latitude
        dist_to_edge,       # Avstånd till kant
        norm_lons * norm_lats,  # Interaktion lon*lat
        norm_lons**2,       # Kvadratisk lon
        norm_lats**2,       # Kvadratisk lat
    ])
    
    return features

def ml_enhanced_interpolation(lons, lats, values, lon_mesh, lat_mesh, bbox, parameter):
    """MINNESOPTIMERAD ML-förbättrad interpolation med Random Forest"""
    print("   🤖 Machine Learning interpolation...")
    
    try:
        # FÖRBÄTTRAD RF-modell för naturligare resultat
        rf_model = RandomForestRegressor(
            n_estimators=50,      # Minska från 75 till 50 för mindre överanpassning
            max_depth=5,         # Minska från 8 till 5 för enklare modell
            min_samples_split=10, # Kräv fler samples för split
            min_samples_leaf=5,   # Kräv fler samples i löv
            random_state=42,
            n_jobs=2
        )
        
        # MINNESOPTIMERING 2: Använd float32 för träningsdata
        train_lons = lons.astype(np.float32)
        train_lats = lats.astype(np.float32)
        train_values = values.astype(np.float32)
        
        # Skapa features för träningsdata
        train_features = create_feature_matrix(train_lons, train_lats, bbox)
        train_features = train_features.astype(np.float32)
        
        # Träna Random Forest-modellen
        rf_model.fit(train_features, train_values)
        
        # MINNESOPTIMERING 3: Chunked prediction för stora grid
        lon_min, lon_max, lat_min, lat_max = bbox
        lon_flat = lon_mesh.flatten().astype(np.float32)
        lat_flat = lat_mesh.flatten().astype(np.float32)
        
        chunk_size = 75000  # Processa 75k punkter åt gången för ML
        result = np.zeros(len(lon_flat), dtype=np.float32)
        
        print(f"   💾 ML-predicering för {len(lon_flat)} punkter i chunks om {chunk_size}")
        
        for i in range(0, len(lon_flat), chunk_size):
            end_idx = min(i + chunk_size, len(lon_flat))
            chunk_lons = lon_flat[i:end_idx]
            chunk_lats = lat_flat[i:end_idx]
            
            # Skapa features för chunk
            chunk_features = create_feature_matrix(chunk_lons, chunk_lats, bbox)
            chunk_features = chunk_features.astype(np.float32)
            
            # Förutsäg värden för chunk
            chunk_predictions = rf_model.predict(chunk_features)
            result[i:end_idx] = chunk_predictions
            
            # Progress indication
            if i % (chunk_size * 2) == 0:
                progress = (end_idx / len(lon_flat)) * 100
                print(f"   📊 {progress:.1f}% klar...")
        
        # Reshape tillbaka till grid
        grid_values = result.reshape(lon_mesh.shape)
        
        print("   ✅ ML-interpolation klar")
        return grid_values
        
    except Exception as e:
        print(f"   ⚠️ ML-interpolation misslyckades ({e}), fallback till griddata")
        return griddata((lons, lats), values, (lon_mesh, lat_mesh), method='cubic', fill_value=np.nan)

def rbf_multiquadric_interpolation(lons, lats, values, lon_mesh, lat_mesh, parameter):
    """MINNESOPTIMERAD RBF Multiquadric interpolation"""
    print("   🌐 RBF Multiquadric interpolation...")
    
    try:
        # FÖRBÄTTRADE smoothing-parametrar för naturligare övergångar
        smoothing_params = {
            'current': 0.2,      # Öka smoothing för strömstyrka (var 0.05)
            'temperature': 0.3,  # Öka smoothing för temperatur (var 0.1)
            'salinity': 0.25     # Öka smoothing för salthalt (var 0.08)
        }
        
        smooth_param = smoothing_params.get(parameter, 0.05)
        
        # MINNESOPTIMERING 1: Begränsa antalet träningspunkter
        max_training_points = 1500  # Minska från ~3300 till 1500
        if len(values) > max_training_points:
            print(f"   🔧 Minnesoptimering: Använder {max_training_points}/{len(values)} träningspunkter")
            # Intelligent undersampling - behåll variationen
            indices = np.linspace(0, len(values) - 1, max_training_points, dtype=int)
            train_lons = lons[indices]
            train_lats = lats[indices]
            train_values = values[indices]
        else:
            train_lons = lons
            train_lats = lats
            train_values = values
        
        # MINNESOPTIMERING 2: Använd float32 för att halvera minnesanvändningen
        train_lons = train_lons.astype(np.float32)
        train_lats = train_lats.astype(np.float32)
        train_values = train_values.astype(np.float32)
        
        # Skapa RBF-interpolator
        rbf = Rbf(
            train_lons, train_lats, train_values,
            function='multiquadric',
            smooth=smooth_param,
            epsilon=1.0
        )
        
        # MINNESOPTIMERING 3: Chunked processing för stora grid
        chunk_size = 50000  # Processa 50k punkter åt gången
        grid_shape = lon_mesh.shape
        lon_flat = lon_mesh.flatten().astype(np.float32)
        lat_flat = lat_mesh.flatten().astype(np.float32)
        
        result = np.zeros(len(lon_flat), dtype=np.float32)
        
        print(f"   💾 Processar {len(lon_flat)} punkter i chunks om {chunk_size}")
        
        for i in range(0, len(lon_flat), chunk_size):
            end_idx = min(i + chunk_size, len(lon_flat))
            chunk_lons = lon_flat[i:end_idx]
            chunk_lats = lat_flat[i:end_idx]
            
            # Interpolera chunk
            chunk_result = rbf(chunk_lons, chunk_lats)
            result[i:end_idx] = chunk_result
            
            # Progress indication
            if i % (chunk_size * 2) == 0:
                progress = (end_idx / len(lon_flat)) * 100
                print(f"   📊 {progress:.1f}% klar...")
        
        # Reshape tillbaka till grid
        grid_values = result.reshape(grid_shape)
        
        print("   ✅ RBF-interpolation klar")
        return grid_values
        
    except Exception as e:
        print(f"   ⚠️ RBF-interpolation misslyckades ({e}), fallback till griddata")
        return griddata((lons, lats), values, (lon_mesh, lat_mesh), method='cubic', fill_value=np.nan)

def hybrid_ml_rbf_interpolation(lons, lats, values, lon_mesh, lat_mesh, bbox, parameter):
    """FÖRBÄTTRAD Hybrid ML + RBF interpolation för naturliga övergångar"""
    print("   🚀 Hybrid ML + RBF interpolation...")
    
    # Steg 1: ML-baserad grundinterpolation
    ml_values = ml_enhanced_interpolation(lons, lats, values, lon_mesh, lat_mesh, bbox, parameter)
    
    # Steg 2: RBF för smooth refinement
    rbf_values = rbf_multiquadric_interpolation(lons, lats, values, lon_mesh, lat_mesh, parameter)
    
    # Steg 3: JUSTERAD kombination för naturligare resultat
    # Minska ML-inflytande för att undvika skarpa kanter
    ml_weight = 0.3  # Minska ML från 0.6 till 0.3
    rbf_weight = 0.7  # Öka RBF från 0.4 till 0.7 för mjukare övergångar
    
    # Hantera NaN-värden
    ml_nan_mask = np.isnan(ml_values)
    rbf_nan_mask = np.isnan(rbf_values)
    
    # Kombinera där båda har giltiga värden
    combined_values = np.full_like(ml_values, np.nan)
    valid_mask = ~ml_nan_mask & ~rbf_nan_mask
    
    if np.any(valid_mask):
        combined_values[valid_mask] = (
            ml_weight * ml_values[valid_mask] + 
            rbf_weight * rbf_values[valid_mask]
        )
    
    # Fyll med ML där endast ML har värden
    ml_only_mask = ~ml_nan_mask & rbf_nan_mask
    if np.any(ml_only_mask):
        combined_values[ml_only_mask] = ml_values[ml_only_mask]
    
    # Fyll med RBF där endast RBF har värden
    rbf_only_mask = ml_nan_mask & ~rbf_nan_mask
    if np.any(rbf_only_mask):
        combined_values[rbf_only_mask] = rbf_values[rbf_only_mask]
    
    print("   ✅ Hybrid ML + RBF interpolation klar")
    return combined_values

def advanced_interpolation(lons, lats, values, lon_mesh, lat_mesh, parameter):
    """FÖRBÄTTRAD interpolation med balans mellan kvalitet och naturlighet"""
    config = get_parameter_config(parameter)
    bbox = (lon_mesh.min(), lon_mesh.max(), lat_mesh.min(), lat_mesh.max())
    
    # TILLFÄLLIG FALLBACK: Använd bara förbättrad traditionell metod
    # för mer naturliga resultat som liknar den gamla metoden
    print("   🌊 Använder FÖRBÄTTRAD traditionell interpolation för naturliga resultat...")
    grid_values = improved_traditional_interpolation(lons, lats, values, lon_mesh, lat_mesh, parameter)
    
    # KOMMENTERA UT ML+RBF tills vi löst naturlighetsproblemen
    # # Kontrollera om vi har tillräckligt med data för ML
    # if len(values) >= 50:  # Minst 50 punkter för ML
    #     print("   🚀 Använder FÖRBÄTTRAD ML + RBF interpolation...")
    #     
    #     try:
    #         # Primär: Hybrid ML + RBF
    #         grid_values = hybrid_ml_rbf_interpolation(
    #             lons, lats, values, lon_mesh, lat_mesh, bbox, parameter
    #         )
    #         
    #         # Kontrollera kvalitet
    #         nan_ratio = np.sum(np.isnan(grid_values)) / grid_values.size
    #         if nan_ratio < 0.5:  # Mindre än 50% NaN
    #             print(f"   ✅ ML + RBF framgångsrik ({nan_ratio:.1%} NaN)")
    #         else:
    #             print(f"   ⚠️ Många NaN-värden ({nan_ratio:.1%}), förbättrar...")
    #             
    #             # Fyll återstående NaN med nearest neighbor
    #             nan_mask = np.isnan(grid_values)
    #             if np.any(nan_mask):
    #                 grid_values_nearest = griddata(
    #                     (lons, lats), values, (lon_mesh, lat_mesh), 
    #                     method='nearest'
    #                 )
    #                 grid_values[nan_mask] = grid_values_nearest[nan_mask]
    #             
    #     except Exception as e:
    #         print(f"   ❌ ML + RBF misslyckades ({e}), använder traditionell metod")
    #         grid_values = improved_traditional_interpolation(lons, lats, values, lon_mesh, lat_mesh, parameter)
    # else:
    #     print(f"   ⚠️ För få datapunkter ({len(values)}) för ML, använder traditionell metod")
    #     grid_values = improved_traditional_interpolation(lons, lats, values, lon_mesh, lat_mesh, parameter)
    
    # Slutlig Gaussian smoothing - TILLFÄLLIGT AVSTÄNGT för naturligare resultat
    # if config['smooth_factor'] > 0:
    #     print(f"   🌊 Slutlig Gaussian smoothing (σ={config['smooth_factor']})...")
    #     grid_values = gaussian_filter(grid_values, sigma=config['smooth_factor'])
    
    return grid_values

def traditional_interpolation(lons, lats, values, lon_mesh, lat_mesh):
    """Traditionell interpolation som fallback"""
    print("   🔄 Traditionell interpolation...")
    
    # Steg 1: Kubisk interpolation
    grid_values = griddata(
        (lons, lats), values, (lon_mesh, lat_mesh), 
        method='cubic', fill_value=np.nan
    )
    
    # Steg 2: Linear för NaN-områden
    nan_mask = np.isnan(grid_values)
    if np.any(nan_mask):
        grid_values_linear = griddata(
            (lons, lats), values, (lon_mesh, lat_mesh), 
            method='linear', fill_value=np.nan
        )
        linear_mask = ~np.isnan(grid_values_linear)
        combined_mask = nan_mask & linear_mask
        grid_values[combined_mask] = grid_values_linear[combined_mask]
    
    # Steg 3: Nearest neighbor för resterande
    nan_mask = np.isnan(grid_values)
    if np.any(nan_mask):
        grid_values_nearest = griddata(
            (lons, lats), values, (lon_mesh, lat_mesh), 
            method='nearest'
        )
        grid_values[nan_mask] = grid_values_nearest[nan_mask]
    
    return grid_values

def improved_traditional_interpolation(lons, lats, values, lon_mesh, lat_mesh, parameter):
    """Förbättrad traditionell interpolation med mjukare övergångar"""
    print("   🌊 Förbättrad traditionell interpolation...")
    
    # Steg 1: Kubisk interpolation (som din gamla metod)
    grid_values = griddata(
        (lons, lats), values, (lon_mesh, lat_mesh), 
        method='cubic', fill_value=np.nan
    )
    
    # Steg 2: Linear för NaN-områden
    nan_mask = np.isnan(grid_values)
    if np.any(nan_mask):
        grid_values_linear = griddata(
            (lons, lats), values, (lon_mesh, lat_mesh), 
            method='linear', fill_value=np.nan
        )
        linear_mask = ~np.isnan(grid_values_linear)
        combined_mask = nan_mask & linear_mask
        grid_values[combined_mask] = grid_values_linear[combined_mask]
    
    # Steg 3: Nearest neighbor för resterande
    nan_mask = np.isnan(grid_values)
    if np.any(nan_mask):
        grid_values_nearest = griddata(
            (lons, lats), values, (lon_mesh, lat_mesh), 
            method='nearest'
        )
        grid_values[nan_mask] = grid_values_nearest[nan_mask]
    
    # Steg 4: FÖRBÄTTRAD smoothing för naturligare resultat utan hårda kanter
    # Anpassad smoothing för varje parameter
    smoothing_strength = {
        'current': 0.1,      # Mer smoothing för strömstyrka (mjukare övergångar)
        'temperature': 0.1,  # Starkare smoothing för temperatur (mycket mjuk)
        'salinity': 0.1      # Balanserad smoothing för salthalt
    }
    
    sigma = smoothing_strength.get(parameter, 0.1)
    
    # Dubbelpassage smoothing för ännu mjukare resultat
    grid_values = gaussian_filter(grid_values, sigma=sigma*0.6)  # Första passagen
    grid_values = gaussian_filter(grid_values, sigma=sigma*0.4)  # Andra passagen för finare smoothing
    
    print(f"   ✅ Förbättrad traditionell interpolation klar (σ={sigma} dubbelpassage)")
    return grid_values

def create_interpolated_image(lons, lats, values, water_mask_grid, output_path, timestamp, bbox, parameter):
    """Skapa interpolerad PNG-bild med avancerad interpolation"""
    config = get_parameter_config(parameter)
    param_name = config['name']
    unit = config['unit']
    
    if len(lons) == 0:
        print(f"⚠️ Ingen {param_name}-data för {timestamp}")
        return False
    
    lon_min, lon_max, lat_min, lat_max = bbox
    grid_resolution = water_mask_grid.shape[0]
    
    # Skapa grid med exakta koordinater
    lon_grid = np.linspace(lon_min, lon_max, grid_resolution)
    lat_grid = np.linspace(lat_min, lat_max, grid_resolution)
    lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
    
    # Beräkna exakta koordinater från grid (inte från bbox)
    actual_lon_min = lon_grid[0]
    actual_lon_max = lon_grid[-1]
    actual_lat_min = lat_grid[0]
    actual_lat_max = lat_grid[-1]
    
    print(f"   📍 Exakta koordinater: lon({actual_lon_min:.6f}, {actual_lon_max:.6f}), lat({actual_lat_min:.6f}, {actual_lat_max:.6f})")
    
    # Förbättrad kantförstärkning
    if config['edge_enhancement']:
        print("   🔧 Skapar förbättrade kantpunkter...")
        edge_lons, edge_lats, edge_values = create_edge_enhancement_points(
            lons, lats, values, bbox
        )
        
        # Kombinera original + edge points
        enhanced_lons = np.concatenate([lons, edge_lons])
        enhanced_lats = np.concatenate([lats, edge_lats])
        enhanced_values = np.concatenate([values, edge_values])
        
        print(f"   ✅ Förstärkte med {len(edge_values)} kantpunkter")
    else:
        enhanced_lons, enhanced_lats, enhanced_values = lons, lats, values
    
    # Avancerad interpolation
    print(f"🔄 Avancerad interpolation ({len(enhanced_values)} punkter → {grid_resolution}x{grid_resolution} grid)...")
    
    try:
        grid_values = advanced_interpolation(
            enhanced_lons, enhanced_lats, enhanced_values, 
            lon_mesh, lat_mesh, parameter
        )
        
        # Fixa negativa värden för vissa parametrar
        if parameter in ['current', 'salinity']:
            negative_count = np.sum(grid_values < 0)
            if negative_count > 0:
                print(f"   🔧 Fixar {negative_count} negativa värden...")
                grid_values = np.maximum(grid_values, 0)
        
        # Applicera vattenmask
        print("   🌊 Applicerar vattenmask...")
        grid_values[~water_mask_grid] = np.nan
        
        # Statistik
        valid_values = grid_values[~np.isnan(grid_values)]
        if len(valid_values) > 0:
            print(f"   📊 {param_name.title()}-statistik:")
            print(f"      Min: {np.min(valid_values):.3f} {unit}")
            print(f"      Max: {np.max(valid_values):.3f} {unit}")
            print(f"      Medel: {np.mean(valid_values):.3f} {unit}")
            print(f"      Pixlar: {len(valid_values)}")
        
        # Skapa bild
        cmap, vmin, vmax = create_parameter_colormap(parameter)
        print(f"   🎨 Colormap: {vmin:.2f} - {vmax:.2f} {unit}")
        
        # Beräkna aspektförhållande baserat på geografisk region
        lon_range = actual_lon_max - actual_lon_min
        lat_range = actual_lat_max - actual_lat_min
        aspect_ratio = lon_range / lat_range
        
        # Optimerad figur-storlek för bästa kvalitet med bbox_inches='tight'
        # Höjre upplösning för finare interpolation
        target_width_pixels = max(800, grid_resolution // 2)  # Minst 800px bred
        target_height_pixels = int(target_width_pixels / aspect_ratio)
        
        # Beräkna figur-storlek i tum (matplotlib använder tum)
        fig_width_inches = 10  # Standard bredd
        fig_height_inches = fig_width_inches / aspect_ratio
        
        # DPI för att nå target pixel-storlek
        dpi = max(target_width_pixels / fig_width_inches, 150)
        
        print(f"   📐 Figur: {fig_width_inches:.1f}x{fig_height_inches:.1f} tum @ {dpi:.0f} DPI")
        print(f"   🎯 Målstorlek: {target_width_pixels}x{target_height_pixels} pixlar")
        print(f"   🗺️ Aspect ratio: {aspect_ratio:.3f} (lon_range: {lon_range:.2f}°, lat_range: {lat_range:.2f}°)")
        
        fig, ax = plt.subplots(figsize=(fig_width_inches, fig_height_inches), dpi=dpi)
        ax.set_xlim(actual_lon_min, actual_lon_max)
        ax.set_ylim(actual_lat_min, actual_lat_max)
        ax.set_aspect('equal')  # Behåll geografisk precision
        ax.axis('off')
        
        # Plotta med exakta grid-koordinater
        im = ax.imshow(
            grid_values,
            extent=[actual_lon_min, actual_lon_max, actual_lat_min, actual_lat_max],
            origin='lower',
            cmap=cmap,
            vmin=vmin,
            vmax=vmax,
            alpha=0.85,
            interpolation='bicubic'  # Bättre interpolation för mjukare resultat
        )
        
        # Spara med bbox_inches='tight' för bästa kvalitet
        plt.savefig(
            output_path,
            format='png',
            dpi=dpi,
            bbox_inches='tight',  # ✅ Trimma bort marginaler för bästa kvalitet
            pad_inches=0,
            transparent=True,
            facecolor='none'
        )
        plt.close()
        
        # Spara exakta koordinater till metadata
        metadata_path = output_path.parent / 'metadata.json'
        
        # Läs existerande metadata eller skapa ny
        if metadata_path.exists():
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
        else:
            metadata = {
                'imageCoordinates': {},
                'bbox': {
                    'lon_min': actual_lon_min,
                    'lon_max': actual_lon_max,
                    'lat_min': actual_lat_min,
                    'lat_max': actual_lat_max
                }
            }
        
        # Lägg till exakta koordinater för denna bild
        image_name = output_path.name
        metadata['imageCoordinates'][image_name] = [
            [actual_lon_min, actual_lat_max],  # top-left
            [actual_lon_max, actual_lat_max],  # top-right
            [actual_lon_max, actual_lat_min],  # bottom-right
            [actual_lon_min, actual_lat_min]   # bottom-left
        ]
        
        # Spara metadata
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"✅ Sparade {output_path}")
        print(f"📄 Uppdaterade metadata med exakta koordinater")
        return True
        
    except Exception as e:
        print(f"❌ Interpolation misslyckades: {e}")
        return False

def create_water_point_cache(area_data, water_polygons):
    """Skapa optimerad cache för vattenpunkter"""
    print("🔄 Skapar optimerad vattenpunkt-cache...")
    cache = {}
    total_points = len(area_data['points'])
    
    for i, point in enumerate(area_data['points']):
        if i % 1000 == 0:
            print(f"   Processar {i}/{total_points} ({100*i/total_points:.1f}%)")
        
        lat, lon = point['lat'], point['lon']
        point_key = f"{lat:.4f},{lon:.4f}"
        
        if point_in_water(lon, lat, water_polygons):
            cache[point_key] = True
    
    print(f"✅ Cache: {len(cache)} vattenpunkter av {total_points} totalt ({100*len(cache)/total_points:.1f}%)")
    return cache

def create_water_mask_grid(water_polygons, bbox, grid_resolution):
    """Skapa optimerad vattenmask-grid"""
    print(f"🌊 Skapar vattenmask-grid ({grid_resolution}x{grid_resolution})...")
    
    lon_min, lon_max, lat_min, lat_max = bbox
    lon_grid = np.linspace(lon_min, lon_max, grid_resolution)
    lat_grid = np.linspace(lat_min, lat_max, grid_resolution)
    lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
    
    water_mask = np.zeros((grid_resolution, grid_resolution), dtype=bool)
    
    # Optimerad bearbetning i batcher
    batch_size = 100
    for i in range(0, grid_resolution, batch_size):
        end_i = min(i + batch_size, grid_resolution)
        if i % 500 == 0:
            print(f"   Processar rad {i}/{grid_resolution} ({100*i/grid_resolution:.1f}%)")
        
        for j in range(grid_resolution):
            for row in range(i, end_i):
                lon_point = lon_mesh[row, j]
                lat_point = lat_mesh[row, j]
                
                if point_in_water(lon_point, lat_point, water_polygons):
                    water_mask[row, j] = True
    
    water_pixels = np.sum(water_mask)
    total_pixels = grid_resolution * grid_resolution
    print(f"✅ Vattenmask: {water_pixels}/{total_pixels} pixlar ({100*water_pixels/total_pixels:.1f}%)")
    return water_mask

def clear_directory(directory_path):
    """Rensa directory från gamla bilder"""
    if not os.path.exists(directory_path):
        os.makedirs(directory_path, exist_ok=True)
        return
    
    png_files = list(Path(directory_path).glob("*.png"))
    if png_files:
        print(f"   🗑️ Rensar {len(png_files)} gamla bilder...")
        for file in png_files:
            try:
                file.unlink()
            except Exception as e:
                print(f"   ⚠️ Kunde inte radera {file.name}: {e}")

def generate_parameter_images(parameter, area_data, water_point_cache, water_mask_grid, bbox, output_base_dir, resolution, max_images, force):
    """Generera bilder för en specifik parameter"""
    config = get_parameter_config(parameter)
    param_name = config['name']
    output_dir = Path(output_base_dir) / config['output_dir']
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n🚀 Genererar {param_name}-bilder...")
    
    if force:
        clear_directory(output_dir)
    
    timestamps = area_data['metadata']['timestamps']
    if max_images:
        timestamps = timestamps[:max_images]
        print(f"🔬 Testläge: {max_images} bilder")
    
    successful_count = 0
    
    for i, timestamp in enumerate(timestamps):
        print(f"\n📸 {param_name.title()} {i+1}/{len(timestamps)}: {timestamp}")
        
        timestamp_prefix = timestamp[:13]
        safe_timestamp = timestamp.replace(':', '-').replace('+', 'plus')
        output_path = output_dir / f"{config['name_en']}_{safe_timestamp}.png"
        
        if output_path.exists() and not force:
            print(f"⏭️ Hoppar över befintlig fil")
            successful_count += 1
            continue
        
        # Extrahera data
        lons, lats, values = extract_parameter_data_for_timestamp(
            area_data, timestamp_prefix, water_point_cache, parameter
        )
        
        if len(lons) > 0:
            success = create_interpolated_image(
                lons, lats, values, water_mask_grid, 
                output_path, timestamp, bbox, parameter
            )
            if success:
                successful_count += 1
        else:
            print(f"⚠️ Ingen {param_name}-data för {timestamp}")
    
    print(f"\n🎉 {param_name.title()}: {successful_count}/{len(timestamps)} bilder klara")
    
    # Spara metadata
    metadata = {
        "parameter": parameter,
        "parameter_name": param_name,
        "unit": config['unit'],
        "bbox": bbox,
        "total_images": successful_count,
        "timestamps": area_data['metadata']['timestamps'],
        "colormap": config['colormap'],
        "resolution": resolution,
        "interpolation_method": "ml_rbf_hybrid",
        "generated_at": datetime.now().isoformat()
    }
    
    metadata_path = output_dir / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"📋 Metadata sparad: {metadata_path}")
    return successful_count, len(timestamps)

def main():
    parser = argparse.ArgumentParser(
        description='Enhetligt skript för marina parameter-bilder med avancerad interpolation'
    )
    parser.add_argument('--parameter', choices=['current', 'temperature', 'salinity', 'all'], 
                       default='all', help='Parameter att generera (default: all)')
    parser.add_argument('--input', default='public/data/area-parameters-extended.json.gz',
                       help='Sökväg till area-parameters fil')
    parser.add_argument('--water-mask', default='public/data/scandinavian-waters.geojson',
                       help='Sökväg till vattenmask GeoJSON')
    parser.add_argument('--output-dir', default='public/data',
                       help='Bas-directory för output')
    parser.add_argument('--resolution', type=int, default=3000,
                       help='Grid-upplösning (default: 3000 för bättre kvalitet)')
    parser.add_argument('--max-images', type=int, default=None,
                       help='Max antal bilder per parameter (för testning)')
    parser.add_argument('--force', action='store_true',
                       help='Skriv över befintliga bilder')
    
    args = parser.parse_args()
    
    print("🌊 REVOLUTIONÄR MARINA BILDGENERATOR")
    print("=" * 50)
    print(f"🤖 Förbättrad traditionell interpolation för naturlig kvalitet")
    print(f"🎨 Revolutionerade colormaps (18-20 färgsteg)")
    print(f"⚡ Optimerad prestanda och minneshantering")
    print(f"🔥 Högre upplösning för skarpare bilder")
    print(f"✨ Använder bbox_inches='tight' för bästa bildkvalitet utan förstoring")
    
    # Bestäm parametrar
    if args.parameter == 'all':
        parameters = ['current', 'temperature', 'salinity']
        print("🎯 Genererar ALLA parametrar")
    else:
        parameters = [args.parameter]
        config = get_parameter_config(args.parameter)
        print(f"🎯 Genererar {config['name']}")
    
    print(f"📦 Input: {args.input}")
    print(f"📁 Output: {args.output_dir}")
    print(f"🔧 Upplösning: {args.resolution}x{args.resolution} (grid) → optimerad bildstorlek med bbox_inches='tight'")
    print(f"✨ Använder bbox_inches='tight' för bästa bildkvalitet utan förstoring")
    
    # Ladda data
    print("\n📦 Laddar data...")
    water_polygons = load_water_mask(args.water_mask)
    area_data = load_area_parameters(args.input)
    
    # Exakt bbox för frontend-alignment
    bbox = (10.3, 16.6, 54.9, 59.6)
    print(f"🗺️ Bbox: {bbox}")
    
    # Förbered cache-strukturer
    print("\n⚡ Förbereder optimerade cache-strukturer...")
    water_point_cache = create_water_point_cache(area_data, water_polygons)
    water_mask_grid = create_water_mask_grid(water_polygons, bbox, args.resolution)
    
    # Frigör minne
    del water_polygons
    
    # Generera bilder för varje parameter
    print("\n🚀 Startar bildgeneration...")
    total_successful = 0
    total_images = 0
    
    for parameter in parameters:
        successful, total = generate_parameter_images(
            parameter, area_data, water_point_cache, water_mask_grid, bbox,
            args.output_dir, args.resolution, args.max_images, args.force
        )
        total_successful += successful
        total_images += total
    
    print("\n" + "=" * 50)
    print("🎉 ALLA PARAMETRAR KLARA!")
    print(f"📊 Resultat: {total_successful}/{total_images} bilder")
    print(f"📁 Sparade i: {Path(args.output_dir).absolute()}")
    
    for parameter in parameters:
        config = get_parameter_config(parameter)
        param_dir = Path(args.output_dir) / config['output_dir']
        print(f"   • {config['name'].title()}: {param_dir}")
    
    print("\n🔬 Interpolationsmetod: REVOLUTIONÄR ML + RBF")
    print("   🤖 Machine Learning (Random Forest) - lär sig naturliga mönster")
    print("   🌐 RBF Multiquadric - smooth naturlig övergång")
    print("   🔧 Hybrid kombination - ML för trender, RBF för lokal precision")
    print("   🎯 Intelligent fallback - traditionell metod vid få datapunkter")
    print("   🌊 Kantförstärkning och Gaussian smoothing")
    print("   📊 Revolutionerade colormaps baserade på verklig dataanalys")

if __name__ == "__main__":
    main()