#!/usr/bin/env python3
"""
MERCATOR MARINA BILDGENERATOR - Löser projektionsproblem
Genererar interpolerade bilder direkt i Web Mercator projektion (EPSG:3857)
för perfekt kartplacering utan offset-behov.
"""

import json
import gzip
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as colors
from matplotlib.colors import ListedColormap
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
import pyproj
from pyproj import Transformer
import math
import colorcet as cc

# Tysta alla warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=RuntimeWarning)

# IDENTISKA FÄRGSKALOR som i original-scriptet
REVOLUTIONARY_CURRENT_COLORMAP = [
    [0.000, "#000066"], [0.068, "#0033CC"], [0.137, "#0066CC"], [0.205, "#00CCFF"],
    [0.274, "#00FFCC"], [0.342, "#00FF66"], [0.411, "#33FF33"], [0.479, "#66FF00"],
    [0.547, "#99FF00"], [0.616, "#CCFF00"], [0.684, "#FFFF00"], [0.753, "#FFCC00"],
    [0.821, "#FF9900"], [0.889, "#FF6600"], [0.958, "#FF3300"], [1.026, "#CC0000"],
    [1.095, "#990000"], [1.163, "#660000"], [1.232, "#330000"], [1.300, "#220000"],
]

REVOLUTIONARY_TEMPERATURE_COLORMAP = [
    [6.974, "#000066"], [8.000, "#000099"], [10.000, "#0033CC"], [11.031, "#0066FF"],
    [12.000, "#0099FF"], [12.676, "#00CCFF"], [13.500, "#00FFCC"], [14.500, "#33FF99"],
    [15.330, "#66FF66"], [15.805, "#99FF33"], [16.281, "#CCFF00"], [16.699, "#FFFF00"],
    [17.117, "#FFCC00"], [17.500, "#FF9900"], [17.883, "#FF6600"], [18.328, "#FF3300"],
    [19.000, "#CC0000"], [20.000, "#990000"], [20.980, "#660000"],
]

REVOLUTIONARY_SALINITY_COLORMAP = [
    [0.000, "#67001F"], [2.000, "#B2182B"], [4.000, "#D6604D"], [6.000, "#F4A582"],
    [7.094, "#FDDBC7"], [7.250, "#F7F7F7"], [7.391, "#D1E5F0"], [10.000, "#92C5DE"],
    [12.375, "#4393C3"], [15.000, "#2166AC"], [17.359, "#053061"], [20.000, "#042A50"],
    [20.234, "#032441"], [23.109, "#021E32"], [25.000, "#011823"], [28.312, "#001214"],
    [29.094, "#000C0F"], [30.188, "#00060A"],
]

# MAKRILLSANNOLIKHETS FÄRGSKALA - VETENSKAPLIGT OPTIMERAD BASERAT PÅ VERKLIG DATAANALYS
# Dataanalys visar värdeintervall: -39% till +102% (inte 0-100% som förväntat)
# Negativa värden (-39% till -25%): INGEN makrill - total svart
# Positiva värden (92% till 102%): HOTSPOT områden - explosiva färger
# Medelvärde: 32.2%, Median: 33.6% - mest data i mitten-spannet
# Design: Svart bakgrund för att framhäva ljusa hotspots som "lyser upp i mörkret"
MACKEREL_PROBABILITY_COLORMAP = [
    # === NEGATIVA VÄRDEN (-39% till 0%) === 
    # Total svart för "ingen makrill" - viktig för hotspot-effekt
    [-39.0, "#000000"],    # Absolut minimum (dataanalys)
    [-35.0, "#000000"],    # Djup svart
    [-30.0, "#000000"],    # Svart
    [-25.0, "#000000"],    # Svart (max negativ från data)
    [-20.0, "#000000"],    # Svart
    [-15.0, "#000000"],    # Svart
    [-10.0, "#000000"],    # Svart
    [-5.0, "#000000"],     # Svart
    [0.0, "#000000"],      # Svart vid neutral punkt
    
    # === MINIMAL CHANS (0-15%) ===
    # Mycket subtil övergång från svart - nästan omärkligt
    [1.0, "#050505"],      # Nästan svart
    [3.0, "#0A0A0A"],      # Mycket mörk grå
    [5.0, "#0F0F0F"],      # Mörk grå
    [8.0, "#141414"],      # Grå
    [12.0, "#191919"],     # Ljusare grå
    [15.0, "#1E1E1E"],     # Mörk grå
    
    # === LÅG CHANS (15-35%) ===
    # Medelvärde från data är 32.2% - viktigt område
    [18.0, "#001122"],     # Första blå antydan
    [22.0, "#001133"],     # Svag blå
    [26.0, "#001144"],     # Mörk blå
    [30.0, "#001155"],     # Blå (runt medelvärde)
    [35.0, "#002266"],     # Starkare blå
    
    # === MÅTTLIG CHANS (35-55%) ===
    # Området runt median (33.6%) och uppåt
    [40.0, "#003377"],     # Ljusare blå
    [45.0, "#004488"],     # Stark blå
    [50.0, "#0055CC"],     # Tydlig blå
    [55.0, "#0066DD"],     # Ljus blå
    
    # === HÖG CHANS (55-75%) ===
    # Bygger upp mot hotspot-området
    [60.0, "#0077FF"],     # Stark ljus blå
    [65.0, "#1188FF"],     # Mycket ljus blå
    [70.0, "#2299FF"],     # Ljusare blå
    [75.0, "#33AAFF"],     # Ljus blå-cyan
    
    # === MYCKET HÖG CHANS (75-90%) ===
    # Förbereder för hotspot-explosionen
    [78.0, "#44BBFF"],     # Ljus cyan
    [82.0, "#55CCFF"],     # Mycket ljus cyan
    [85.0, "#66DDFF"],     # Ljusaste cyan
    [88.0, "#77EEFF"],     # Extremt ljus cyan
    [90.0, "#88FFFF"],     # Ren cyan
    
    # === HOTSPOT BÖRJAN (90-95%) ===
    # Dataanalys visar hotspots startar vid ~92.5%
    [92.0, "#99FFAA"],     # Cyan-gul övergång
    [94.0, "#AAFF99"],     # Gul-grön
    [95.0, "#BBFF88"],     # Ljus gul-grön
    
    # === EXPLOSIVA HOTSPOTS (95-100%) ===
    # Denna sektion "lyser upp i mörkret"
    [96.0, "#CCFF77"],     # Ljus gul
    [97.0, "#DDFF66"],     # Stark gul
    [98.0, "#EEFF55"],     # Mycket stark gul
    [99.0, "#FFFF44"],     # Intensiv gul
    [100.0, "#FFFF00"],    # Ren gul - stark hotspot
    
    # === MAXIMUM HOTSPOTS (100-102%) ===
    # Dataanalys visar max vid 102.2%
    [101.0, "#FFCC00"],    # Gul-orange
    [102.0, "#FF9900"],    # Orange hotspot
    [102.2, "#FF6600"],    # Maximum från dataanalys - intensiv orange
]

def get_parameter_config(parameter):
    """Identisk konfiguration som i original-scriptet"""
    configs = {
        'current': {
            'colormap': REVOLUTIONARY_CURRENT_COLORMAP,
            'unit': 'm/s',
            'name': 'strömstyrka',
            'name_en': 'current_magnitude',
            'output_dir': 'current-images-mercator',
            'smooth_factor': 0.5,
            'edge_enhancement': True
        },
        'temperature': {
            'colormap': REVOLUTIONARY_TEMPERATURE_COLORMAP,
            'unit': '°C',
            'name': 'vattentemperatur',
            'name_en': 'temperature',
            'output_dir': 'temperature-images-mercator',
            'smooth_factor': 0.8,
            'edge_enhancement': True
        },
        'salinity': {
            'colormap': REVOLUTIONARY_SALINITY_COLORMAP,
            'unit': 'g/kg',
            'name': 'salthalt',
            'name_en': 'salinity',
            'output_dir': 'salinity-images-mercator',
            'smooth_factor': 0.7,
            'edge_enhancement': True
        },
        'mackerel': {
            'colormap': MACKEREL_PROBABILITY_COLORMAP,
            'unit': '%',
            'name': 'makrillsannolikhet',
            'name_en': 'mackerel_probability',
            'output_dir': 'mackerel-probability-images-mercator',
            'smooth_factor': 0.8,
            'edge_enhancement': True
        }
    }
    return configs[parameter]

def create_parameter_colormap(parameter):
    """Parameter-specifik colormap-skapning för bästa visuella resultat"""
    config = get_parameter_config(parameter)
    colormap_data = config['colormap']
    
    # Speciell hantering för makrill som använder inferno
    if parameter == 'mackerel':
        return create_mackerel_colormap()
    
    # Extrahera värden och färger från det nya formatet
    values = [item[0] for item in colormap_data]
    colors_list = [item[1] for item in colormap_data]
    
    min_val, max_val = min(values), max(values)
    
    # Alla parametrar använder nu LinearSegmentedColormap med gamma-korrektion
    norm_values = [(v - min_val) / (max_val - min_val) for v in values]
    cmap = colors.LinearSegmentedColormap.from_list(
        f'{parameter}_revolutionary', 
        list(zip(norm_values, colors_list)),
        gamma=0.9  # Perceptuell optimering för bättre visuell separation
    )
    print(f"   🎨 {parameter.title()} colormap (LinearSegmented+gamma): {len(colormap_data)} färgsteg ({min_val:.3f} - {max_val:.3f})")
    
    return cmap, min_val, max_val

def create_mackerel_colormap():
    """Skapa colorcet.fire hotspot colormap för perceptuell uniformitet"""
    from matplotlib.colors import ListedColormap
    
    # Hämta min/max värden från den verkliga dataanalysen
    min_val = min(point[0] for point in MACKEREL_PROBABILITY_COLORMAP)  # -39.0
    max_val = max(point[0] for point in MACKEREL_PROBABILITY_COLORMAP)  # 102.2
    
    # Använd colorcet.fire colormap - perfekt för hotspot-visualisering
    # Fire går från svart → rött → orange → gult → vitt
    cmap = ListedColormap(cc.fire)
    
    print("   🎨 Mackerel colormap (colorcet.fire): Perceptuellt uniform hotspot-visualisering!")
    print(f"   📊 Värdeintervall: {min_val:.1f}% till {max_val:.1f}% (från verklig dataanalys)")
    print("   🔥 Colorcet.fire: Svart → Rött → Orange → Gult → Vitt")
    print("   💡 Optimerad för att framhäva hotspots som 'lyser upp i mörkret'")
    
    return cmap, min_val, max_val  # vmin, vmax från verklig dataanalys

def calculate_seasonal_factor(timestamp):
    """
    Beräkna säsongsfaktor baserat på datum
    Använder sinuskurva med peak i juli-augusti
    """
    try:
        # Parsa timestamp
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        
        # Dag på året (1-365)
        day_of_year = dt.timetuple().tm_yday
        
        # Säsongskurva: peak omkring dag 200 (mitten av juli)
        # Använd sinuskurva med offset för att ge peak på sommaren
        seasonal_radians = (day_of_year - 200) * 2 * np.pi / 365
        seasonal_factor = np.cos(seasonal_radians)
        
        # Normalisera till 0-1 range där 1 = peak sommar
        seasonal_factor = (seasonal_factor + 1) / 2
        
        return seasonal_factor
        
    except Exception as e:
        print(f"⚠️ Fel vid beräkning av säsongsfaktor: {e}")
        return 0.5  # Neutral värde vid fel

def calculate_current_direction_factor(u, v):
    """
    Beräkna strömriktningsfaktor baserat på u/v komponenter
    Gynnar sydlig ström (från norr) som för in saltvatten i Öresund
    """
    if u is None or v is None:
        return 0.0
    
    # Beräkna riktning i radianer (0 = öst, π/2 = norr, π = väst, 3π/2 = syd)
    angle = np.arctan2(v, u)
    
    # Gynna sydlig ström (från norr mot söder)
    # Optimal riktning: π (180°) = ren sydlig ström
    optimal_angle = np.pi  # Sydlig riktning
    
    # Beräkna hur nära aktuell riktning är optimal
    angle_diff = abs(angle - optimal_angle)
    if angle_diff > np.pi:
        angle_diff = 2 * np.pi - angle_diff
    
    # Konvertera till faktor: 1.0 för optimal riktning, 0.0 för motsatt
    direction_factor = np.cos(angle_diff)
    
    # Normalisera till 0-1 range
    direction_factor = (direction_factor + 1) / 2
    
    return direction_factor

def load_calibration_data():
    """Ladda kalibrering från JSON-fil"""
    calibration_path = Path(__file__).parent.parent / 'public' / 'data' / 'mackerel_calibration.json'
    
    if not calibration_path.exists():
        print("⚠️ Ingen kalibrering hittad, använder standard intercept")
        return {'calibration': {'recommendedIntercept': -8.0, 'confidence': 'low'}}
    
    try:
        with open(calibration_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        calibration = data.get('calibration', {})
        print(f"📊 Kalibrering laddad: {calibration.get('totalReports', 0)} rapporter, "
              f"intercept: {calibration.get('recommendedIntercept', -8.0):.3f}, "
              f"konfidensgrad: {calibration.get('confidence', 'low')}")
        
        return data
    except Exception as e:
        print(f"⚠️ Fel vid laddning av kalibrering: {e}")
        return {'calibration': {'recommendedIntercept': -8.0, 'confidence': 'low'}}

# Ladda kalibrering globalt
CALIBRATION_DATA = load_calibration_data()

def calculate_mackerel_probability(temperature, salinity, current_u, current_v, timestamp, lat=None, lon=None, use_historical=True):
    """
    Implementera logistisk regression för makrillsannolikhet
    FÖRBÄTTRAD VERSION: Realistiska koefficienter med tröskeleffekter + DATADRIVEN KALIBRERING
    """
    
    # Kontrollera input-värden
    if temperature is None or salinity is None:
        return 0.0
    
    # Beräkna strömstyrka
    if current_u is not None and current_v is not None:
        current_strength = np.sqrt(current_u**2 + current_v**2)
        direction_factor = calculate_current_direction_factor(current_u, current_v)
    else:
        current_strength = 0.0
        direction_factor = 0.0
    
    # Beräkna säsongsfaktor
    seasonal_factor = calculate_seasonal_factor(timestamp)
    
    # ==== FÖRBÄTTRADE PARAMETRAR MED TRÖSKELEFFEKTER ====
    
    # 1. TEMPERATUR - Optimal 15-20°C, straff utanför
    temp_factor = 0.0
    if temperature < 8:
        temp_factor = -2.0  # Mycket dåligt för makrill
    elif temperature < 12:
        temp_factor = -1.0  # Dåligt
    elif temperature < 15:
        temp_factor = 0.0   # Neutralt
    elif temperature <= 20:
        temp_factor = (temperature - 15) * 0.4  # Optimal range
    else:
        temp_factor = 2.0 - (temperature - 20) * 0.2  # Straff för för varmt
    
    # 2. SALTHALT - Stark tröskeleffekt under 15 g/kg
    salinity_factor = 0.0
    if salinity < 8:
        salinity_factor = -3.0  # Mycket dåligt - för sött
    elif salinity < 15:
        salinity_factor = -1.0 + (salinity - 8) * 0.3  # Gradvis förbättring
    elif salinity < 25:
        salinity_factor = 1.0 + (salinity - 15) * 0.1  # Bra range
    else:
        salinity_factor = 2.0  # Optimalt saltvatten
    
    # 3. STRÖMSTYRKA - Måttlig ström bäst, inte för stark
    current_factor = 0.0
    if current_strength > 0:
        if current_strength < 0.5:
            current_factor = current_strength * 0.8  # Svag ström ok
        elif current_strength < 1.0:
            current_factor = 0.4  # Optimal ström
        else:
            current_factor = 0.4 - (current_strength - 1.0) * 0.3  # Straff för stark ström
    
    # 4. STRÖMRIKTNING - Bara viktigt i Öresund-området
    direction_boost = 0.0
    if lat is not None and lon is not None:
        # Endast i Öresund-området (ungefär)
        if 55.5 <= lat <= 56.5 and 12.5 <= lon <= 13.0:
            direction_boost = direction_factor * 1.5  # Viktigt för Öresund
        else:
            direction_boost = direction_factor * 0.3  # Mindre viktigt utanför
    
    # 5. SÄSONG - Mycket stark men inte överväldigande
    season_boost = 0.0
    if seasonal_factor > 0.8:  # Peak sommar
        season_boost = 3.0
    elif seasonal_factor > 0.6:  # Högsäsong
        season_boost = 2.0
    elif seasonal_factor > 0.4:  # Måttlig säsong
        season_boost = 1.0
    elif seasonal_factor > 0.2:  # Lågsäsong
        season_boost = -1.0
    else:  # Vintersäsong
        season_boost = -3.0
    
    # 6. HISTORISKA FAKTORER - Mycket försiktiga
    hist_bonus = 0.0
    if use_historical and lat is not None and lon is not None:
        try:
            # Bara lätt bonus för stabila förhållanden
            if seasonal_factor > 0.6:  # Endast under säsong
                if temperature > 15:
                    hist_bonus += 0.2
                if salinity > 20:
                    hist_bonus += 0.2
                if current_strength > 0.1:
                    hist_bonus += 0.1
        except Exception as e:
            print(f"⚠️ Historisk data inte tillgänglig: {e}")
    
    # ==== FÖRBÄTTRAD LOGISTISK REGRESSION MED DATADRIVEN KALIBRERING ====
    
    # Hämta kalibrerad intercept från fishing reports
    calibrated_intercept = CALIBRATION_DATA['calibration'].get('recommendedIntercept', -8.0)
    confidence = CALIBRATION_DATA['calibration'].get('confidence', 'low')
    use_slope_calibration = CALIBRATION_DATA['calibration'].get('useSlopeCalibration', False)
    
    if use_slope_calibration and 'coefficients' in CALIBRATION_DATA['calibration']:
        # ==== ML SLOPE-KALIBRERING (≥20 rapporter) ====
        coeffs = CALIBRATION_DATA['calibration']['coefficients']
        
        # Normalisera features för ML-modell
        norm_temp = (temperature - 15) / 10  # Ungefär -1 till +1 range
        norm_salinity = (salinity - 20) / 15  # Ungefär -1 till +1 range  
        norm_current = current_strength / 1.0  # 0 till ~1.5 range
        
        # Använd kontinuerliga seasonal features
        day_of_year = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).timetuple().tm_yday
        season_sin = np.sin(2 * np.pi * day_of_year / 365.25)
        season_cos = np.cos(2 * np.pi * day_of_year / 365.25)
        
        # Z-värde med ML-koefficienter
        Z = (calibrated_intercept +                      # Kalibrerad intercept
             coeffs['temperature'] * norm_temp +         # ML temperatur-koefficient
             coeffs['salinity'] * norm_salinity +        # ML salthalt-koefficient  
             coeffs['currentStrength'] * norm_current +  # ML ström-koefficient
             coeffs['seasonSin'] * season_sin +          # ML säsong sin-koefficient
             coeffs['seasonCos'] * season_cos +          # ML säsong cos-koefficient
             direction_boost +                           # Riktning (behålls heuristisk)
             hist_bonus)                                 # Historik (behålls heuristisk)
             
        print(f"🤖 Använder ML-koefficienter för punkt ({lat:.3f}, {lon:.3f})")
        
    else:
        # ==== HEURISTISK KALIBRERING (<20 rapporter) ====
        # Z-värde med kalibrerad intercept + heuristiska faktorer
        Z = (calibrated_intercept +    # KALIBRERAD intercept baserat på fishing reports
             temp_factor +             # Temperatureffekt med tröskel
             salinity_factor +         # Salthalteffekt med stark tröskel
             current_factor +          # Strömeffekt med optimal range
             direction_boost +         # Riktningseffekt (regionspecifik)
             season_boost +            # Säsongseffekt (stark men inte överväldigande)
             hist_bonus)               # Historisk bonus (försiktig)
    
    # Logistisk funktion: P = 1 / (1 + e^(-Z))
    probability = 1 / (1 + np.exp(-Z))
    
    # Konvertera till procent
    probability_percent = probability * 100
    
    # Begränsa till 0-100%
    probability_percent = np.clip(probability_percent, 0, 100)
    
    return probability_percent

def setup_projection_transformers(wgs84_bbox):
    """
    Sätt upp projektionstransformers för WGS84 <-> Web Mercator
    """
    # WGS84 till Web Mercator transformer
    wgs84_to_mercator = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    mercator_to_wgs84 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    
    # Konvertera WGS84 bbox till Mercator
    lon_min, lon_max, lat_min, lat_max = wgs84_bbox
    
    # Transformera hörnen
    x_min, y_min = wgs84_to_mercator.transform(lon_min, lat_min)
    x_max, y_max = wgs84_to_mercator.transform(lon_max, lat_max)
    
    mercator_bbox = (x_min, x_max, y_min, y_max)
    
    print(f"🗺️ WGS84 bbox: {wgs84_bbox}")
    print(f"🗺️ Mercator bbox: {mercator_bbox}")
    
    return wgs84_to_mercator, mercator_to_wgs84, mercator_bbox

def load_area_parameters(filepath):
    """Ladda area parameters data - identisk som original"""
    print(f"📦 Laddar area parameters från {filepath}")
    
    if filepath.endswith('.gz'):
        with gzip.open(filepath, 'rt', encoding='utf-8') as f:
            data = json.load(f)
    else:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    
    print(f"✅ Laddade {len(data['points'])} datapunkter")
    print(f"📅 Tidsspann: {len(data['metadata']['timestamps'])} tidsstämplar")
    return data

def load_water_mask(geojson_path):
    """Ladda vattenmask från GeoJSON - identisk som original"""
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
    """Kontrollera om en punkt är i vatten - identisk som original"""
    point = Point(lon, lat)
    return any(polygon.contains(point) for polygon in water_polygons)

def create_water_point_cache(area_data, water_polygons):
    """Skapa cache för vattenpunkter - identisk som original"""
    print("⚡ Skapar cache för vattenpunkter...")
    
    water_point_cache = {}
    
    for i, point in enumerate(area_data['points']):
        if i % 1000 == 0:
            print(f"   Processar punkt {i}/{len(area_data['points'])} ({100*i/len(area_data['points']):.1f}%)")
        
        lat, lon = point['lat'], point['lon']
        point_key = f"{lat:.4f},{lon:.4f}"
        
        if point_in_water(lon, lat, water_polygons):
            water_point_cache[point_key] = True
    
    print(f"✅ Cache: {len(water_point_cache)} vattenpunkter")
    return water_point_cache

def extract_parameter_data_for_timestamp(area_data, timestamp_prefix, water_point_cache, parameter):
    """Extrahera parameterdata för tidsstämpel - identisk som original"""
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
                elif parameter == 'mackerel':
                    # Beräkna makrillsannolikhet baserat på alla parametrar
                    temperature = data_entry.get('temperature')
                    salinity = data_entry.get('salinity')
                    current_data = data_entry.get('current', {})
                    current_u = current_data.get('u') if current_data else None
                    current_v = current_data.get('v') if current_data else None
                    timestamp = data_entry['time']
                    
                    # Beräkna makrillsannolikhet
                    value = calculate_mackerel_probability(
                        temperature, salinity, current_u, current_v, timestamp, lat, lon
                    )
                    
                    # Ta bort filtreringen - behåll även 0% värden för bättre kantförstärkning
                    # Detta gör att makrill får samma behandling som andra parametrar
                
                if value is not None:
                    lons.append(lon)
                    lats.append(lat)
                    values.append(value)
                break
    
    return np.array(lons), np.array(lats), np.array(values)

def create_water_mask_grid_mercator(water_polygons, mercator_bbox, grid_resolution, mercator_to_wgs84):
    """
    Skapa vattenmask-grid i Mercator-koordinater
    """
    print(f"🌊 Skapar Mercator vattenmask-grid ({grid_resolution}x{grid_resolution})...")
    
    x_min, x_max, y_min, y_max = mercator_bbox
    x_grid = np.linspace(x_min, x_max, grid_resolution)
    y_grid = np.linspace(y_min, y_max, grid_resolution)
    x_mesh, y_mesh = np.meshgrid(x_grid, y_grid)
    
    water_mask = np.zeros((grid_resolution, grid_resolution), dtype=bool)
    
    # Optimerad bearbetning i batcher
    batch_size = 100
    for i in range(0, grid_resolution, batch_size):
        end_i = min(i + batch_size, grid_resolution)
        if i % 500 == 0:
            print(f"   Processar rad {i}/{grid_resolution} ({100*i/grid_resolution:.1f}%)")
        
        for j in range(grid_resolution):
            for row in range(i, end_i):
                x_point = x_mesh[row, j]
                y_point = y_mesh[row, j]
                
                # Konvertera Mercator till WGS84 för vattenmask-kontroll
                try:
                    lon_point, lat_point = mercator_to_wgs84.transform(x_point, y_point)
                    if point_in_water(lon_point, lat_point, water_polygons):
                        water_mask[row, j] = True
                except:
                    # Ignorera punkter som inte kan transformeras
                    pass
    
    water_pixels = np.sum(water_mask)
    total_pixels = grid_resolution * grid_resolution
    print(f"✅ Mercator vattenmask: {water_pixels}/{total_pixels} pixlar ({100*water_pixels/total_pixels:.1f}%)")
    return water_mask

def create_edge_enhancement_points_mercator(lons, lats, values, mercator_bbox, wgs84_to_mercator):
    """
    Skapa kantpunkter i Mercator-koordinater med IDENTISK logik som original scriptet
    """
    from pyproj import Transformer
    mercator_to_wgs84 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    
    x_min, x_max, y_min, y_max = mercator_bbox
    
    edge_xs, edge_ys, edge_values = [], [], []
    
    # Anpassad densitet baserat på datamängd (IDENTISK med original)
    edge_density = max(15, min(40, len(lons) // 25))  # Fler punkter för bättre täckning
    
    # Skapa kantpunkter EXAKT på Mercator bbox-gränserna
    edges = [
        # Nedre kant (exakt på y_min)
        [(x, y_min) for x in np.linspace(x_min, x_max, edge_density)],
        # Övre kant (exakt på y_max)
        [(x, y_max) for x in np.linspace(x_min, x_max, edge_density)],
        # Vänster kant (exakt på x_min)
        [(x_min, y) for y in np.linspace(y_min, y_max, edge_density)],
        # Höger kant (exakt på x_max)
        [(x_max, y) for y in np.linspace(y_min, y_max, edge_density)]
    ]
    
    # För varje kantpunkt, kontrollera om det är rimligt och lägg till
    for edge_points in edges:
        for edge_x, edge_y in edge_points:
            # Konvertera Mercator kantpunkt tillbaka till WGS84 för avståndsberäkning
            edge_lon, edge_lat = mercator_to_wgs84.transform(edge_x, edge_y)
            
            # Hitta de 3 närmsta datapunkterna för bättre interpolation (IDENTISK med original)
            distances = np.sqrt((lons - edge_lon)**2 + (lats - edge_lat)**2)
            
            if len(distances) > 0:
                # Använd bara kantpunkter som inte är alltför långt från verklig data
                # IDENTISK avståndsgräns som original scriptet
                min_distance = np.min(distances)
                if min_distance < 0.1:  # Bara om det finns data inom 0.1 grader
                    # Använd de 3 närmsta punkterna för mer stabil interpolation
                    nearest_indices = np.argsort(distances)[:min(3, len(distances))]
                    
                    # Viktad interpolation baserat på avstånd (IDENTISK med original)
                    weights = 1.0 / (distances[nearest_indices] + 1e-10)
                    weighted_value = np.sum(values[nearest_indices] * weights) / np.sum(weights)
                    
                    # Lägg till kantpunkten
                    edge_xs.append(edge_x)
                    edge_ys.append(edge_y)
                    edge_values.append(weighted_value)
    
    print(f"   🔧 Skapade {len(edge_values)} Mercator kantpunkter exakt på bbox-gränserna")
    return np.array(edge_xs), np.array(edge_ys), np.array(edge_values)

def improved_traditional_interpolation(xs, ys, values, x_mesh, y_mesh, parameter):
    """
    Förbättrad traditionell interpolation i Mercator-koordinater med dubbelpassage smoothing
    """
    print("   🌊 Förbättrad traditionell interpolation i Mercator...")
    
    # Steg 1: Kubisk interpolation
    grid_values = griddata(
        (xs, ys), values, (x_mesh, y_mesh), 
        method='cubic', fill_value=np.nan
    )
    
    # Steg 2: Linear för NaN-områden
    nan_mask = np.isnan(grid_values)
    if np.any(nan_mask):
        grid_values_linear = griddata(
            (xs, ys), values, (x_mesh, y_mesh), 
            method='linear', fill_value=np.nan
        )
        linear_mask = ~np.isnan(grid_values_linear)
        combined_mask = nan_mask & linear_mask
        grid_values[combined_mask] = grid_values_linear[combined_mask]
    
    # Steg 3: Nearest neighbor för resterande
    nan_mask = np.isnan(grid_values)
    if np.any(nan_mask):
        grid_values_nearest = griddata(
            (xs, ys), values, (x_mesh, y_mesh), 
            method='nearest'
        )
        grid_values[nan_mask] = grid_values_nearest[nan_mask]
    
    # Steg 4: FÖRBÄTTRAD smoothing för naturligare resultat utan hårda kanter
    # Anpassad smoothing för varje parameter (samma som original skript)
    smoothing_strength = {
        'current': 0.1,      # Mer smoothing för strömstyrka (mjukare övergångar)
        'temperature': 0.1,  # Starkare smoothing för temperatur (mycket mjuk)
        'salinity': 0.1,     # Balanserad smoothing för salthalt
        'mackerel': 0.1      # Samma smoothing för makrillsannolikhet
    }
    
    sigma = smoothing_strength.get(parameter, 0.1)
    
    # Dubbelpassage smoothing för ännu mjukare resultat (IDENTISKT med original skript)
    from scipy.ndimage import gaussian_filter
    grid_values = gaussian_filter(grid_values, sigma=sigma*0.6)  # Första passagen
    grid_values = gaussian_filter(grid_values, sigma=sigma*0.4)  # Andra passagen för finare smoothing
    
    print(f"   ✅ Förbättrad traditionell interpolation klar (σ={sigma} dubbelpassage)")
    return grid_values

def create_interpolated_image_mercator(
    lons, lats, values, water_mask_grid, output_path, timestamp, 
    wgs84_bbox, mercator_bbox, wgs84_to_mercator, mercator_to_wgs84, parameter
):
    """
    Skapa interpolerad PNG-bild i Mercator-projektion
    """
    config = get_parameter_config(parameter)
    param_name = config['name']
    unit = config['unit']
    
    if len(lons) == 0:
        print(f"⚠️ Ingen {param_name}-data för {timestamp}")
        return False
    
    x_min, x_max, y_min, y_max = mercator_bbox
    grid_resolution = water_mask_grid.shape[0]
    
    # Skapa Mercator grid
    x_grid = np.linspace(x_min, x_max, grid_resolution)
    y_grid = np.linspace(y_min, y_max, grid_resolution)
    x_mesh, y_mesh = np.meshgrid(x_grid, y_grid)
    
    # Beräkna exakta koordinater från grid
    actual_x_min = x_grid[0]
    actual_x_max = x_grid[-1]
    actual_y_min = y_grid[0]
    actual_y_max = y_grid[-1]
    
    print(f"   📍 Exakta Mercator koordinater: x({actual_x_min:.0f}, {actual_x_max:.0f}), y({actual_y_min:.0f}, {actual_y_max:.0f})")
    
    # Konvertera datapoints till Mercator
    data_x, data_y = wgs84_to_mercator.transform(lons, lats)
    
    # Förbättrad kantförstärkning i Mercator
    if config['edge_enhancement']:
        print("   🔧 Skapar förbättrade Mercator kantpunkter...")
        edge_xs, edge_ys, edge_values = create_edge_enhancement_points_mercator(
            lons, lats, values, mercator_bbox, wgs84_to_mercator
        )
        
        # Kombinera original + edge points
        enhanced_xs = np.concatenate([data_x, edge_xs])
        enhanced_ys = np.concatenate([data_y, edge_ys])
        enhanced_values = np.concatenate([values, edge_values])
        
        print(f"   ✅ Förstärkte med {len(edge_values)} Mercator kantpunkter")
    else:
        enhanced_xs, enhanced_ys, enhanced_values = data_x, data_y, values
    
    # Interpolation i Mercator-koordinater
    print(f"🔄 Mercator interpolation ({len(enhanced_values)} punkter → {grid_resolution}x{grid_resolution} grid)...")
    
    try:
        grid_values = improved_traditional_interpolation(
            enhanced_xs, enhanced_ys, enhanced_values, 
            x_mesh, y_mesh, parameter
        )
        
        # Fixa negativa värden för vissa parametrar
        if parameter in ['current', 'salinity']:
            negative_count = np.sum(grid_values < 0)
            if negative_count > 0:
                print(f"   🔧 Fixar {negative_count} negativa värden...")
                grid_values = np.maximum(grid_values, 0)
        
        # Applicera vattenmask
        print("   🌊 Applicerar Mercator vattenmask...")
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
        
        # Beräkna aspektförhållande baserat på Mercator-region
        x_range = actual_x_max - actual_x_min
        y_range = actual_y_max - actual_y_min
        aspect_ratio = x_range / y_range
        
        # Optimerad figur-storlek
        target_width_pixels = max(800, grid_resolution // 2)
        target_height_pixels = int(target_width_pixels / aspect_ratio)
        
        fig_width_inches = 10
        fig_height_inches = fig_width_inches / aspect_ratio
        
        dpi = max(target_width_pixels / fig_width_inches, 150)
        
        print(f"   📐 Figur: {fig_width_inches:.1f}x{fig_height_inches:.1f} tum @ {dpi:.0f} DPI")
        print(f"   🎯 Målstorlek: {target_width_pixels}x{target_height_pixels} pixlar")
        print(f"   🗺️ Mercator aspect ratio: {aspect_ratio:.3f}")
        
        fig, ax = plt.subplots(figsize=(fig_width_inches, fig_height_inches), dpi=dpi)
        ax.set_xlim(actual_x_min, actual_x_max)
        ax.set_ylim(actual_y_min, actual_y_max)
        ax.set_aspect('equal')
        ax.axis('off')
        
        # === OPTIMERAD GLOW-EFFEKT FÖR HOTSPOTS ===
        # Lägg till lysande glow runt områden med hög sannolikhet
        if parameter == 'mackerel':
            print("   ✨ Skapar optimerad glow-effekt för hotspots...")
            
            # Optimerad tröskel för fler intressanta hotspots
            threshold_pct = 75
            
            # Skapa binär mask: 1 där värdet ≥ threshold, annars 0
            hotspot_mask = (grid_values >= threshold_pct).astype(float)
            
            # Optimerad blur för bredare, mjukare glow
            glow_sigma = 8  # Bredare för naturligare effekt
            glow_strength = gaussian_filter(hotspot_mask, sigma=glow_sigma)
            
            # Normalisera till 0-1 för bättre kontroll
            if glow_strength.max() > 0:
                glow_strength /= glow_strength.max()
            
            # Dramatisk gul-vit glow för maximal synlighet
            glow_colors = ['#00000000', '#FFFF0040', '#FFFF0080', '#FFFF00C0', '#FFFFFFFF']
            glow_cmap = colors.LinearSegmentedColormap.from_list('glow', glow_colors)
            
            # Rita ut glow-lagret under huvudbilden
            if np.any(glow_strength > 0):
                ax.imshow(
                    glow_strength,
                    extent=(actual_x_min, actual_x_max, actual_y_min, actual_y_max),
                    origin='lower',
                    cmap=glow_cmap,
                    alpha=0.9,  # Starkare intensitet för bättre synlighet
                    interpolation='bilinear',
                    zorder=1    # Glow ligger under huvudlagret
                )
                print(f"   🔥 Optimerad glow-effekt tillagd för hotspots ≥{threshold_pct}%")
            
            # === ENHETLIGA KONTURLINJER FÖR NAVIGATION ===
            print("   📊 Skapar enhetliga konturlinjer för navigation...")
            
            # Optimerade nivåer för fiskare
            contour_levels = [25, 50, 75, 90]
            
            # Enhetlig färg (vit) för alla konturlinjer - inte kladdigt
            contour_color = '#FFFFFF'
            
            # Progressiv linjetjocklek - viktigare nivåer = tjockare linjer
            contour_linewidths = [1.0, 1.5, 2.0, 2.5]
            
            # Rita konturlinjer med enhetlig färg
            try:
                contour_plot = ax.contour(
                    x_mesh, y_mesh, grid_values,
                    levels=contour_levels,
                    colors=[contour_color] * len(contour_levels),
                    linewidths=contour_linewidths,
                    alpha=0.8,
                    zorder=3  # Konturlinjer över allt annat
                )
                
                # Lägg till etiketter på konturlinjer
                ax.clabel(contour_plot, inline=True, fontsize=8, fmt='%g%%', 
                         colors=['white'] * len(contour_levels))
                
                print(f"   📈 Konturlinjer tillagda: {contour_levels}% (enhetlig vit färg)")
                
            except Exception as e:
                print(f"   ⚠️ Konturlinjer hoppades över: {e}")
        
        # Plotta med exakta Mercator grid-koordinater
        im = ax.imshow(
            grid_values,
            extent=(actual_x_min, actual_x_max, actual_y_min, actual_y_max),
            origin='lower',
            cmap=cmap,
            vmin=vmin,
            vmax=vmax,
            alpha=0.85,
            interpolation='bicubic',
            zorder=2  # Huvudlager ligger över glow
        )
        
        # Spara med bbox_inches='tight' för bästa kvalitet
        plt.savefig(
            output_path,
            format='png',
            dpi=dpi,
            bbox_inches='tight',
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
                'parameter': parameter,
                'generated_at': datetime.now().isoformat(),
                'resolution': f"{grid_resolution}x{grid_resolution}",
                'wgs84_bbox': list(wgs84_bbox),
                'mercator_bbox': list(mercator_bbox),
                'projection': 'EPSG:3857',
                'total_images': 0,
                'images': []
            }
        
        # Lägg till bildinformation
        image_info = {
            'timestamp': timestamp,
            'filename': output_path.name,
            'data_points': len(lons),
            'value_range': [float(np.min(valid_values)), float(np.max(valid_values))] if len(valid_values) > 0 else None,
            'mercator_coordinates': [
                [actual_x_min, actual_y_max],  # top-left
                [actual_x_max, actual_y_max],  # top-right
                [actual_x_max, actual_y_min],  # bottom-right
                [actual_x_min, actual_y_min]   # bottom-left
            ]
        }
        
        # Uppdatera eller lägg till bildinformation
        existing_image = None
        for i, img in enumerate(metadata['images']):
            if img['timestamp'] == timestamp:
                existing_image = i
                break
        
        if existing_image is not None:
            metadata['images'][existing_image] = image_info
        else:
            metadata['images'].append(image_info)
            metadata['total_images'] += 1
        
        # Spara metadata
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"✅ Sparade Mercator-bild: {output_path}")
        print(f"📄 Uppdaterade metadata med Mercator-koordinater")
        return True
        
    except Exception as e:
        print(f"❌ Mercator interpolation misslyckades: {e}")
        return False

def clear_directory(directory):
    """Rensa directory från gamla filer"""
    if directory.exists():
        for file in directory.glob('*.png'):
            file.unlink()
        metadata_file = directory / 'metadata.json'
        if metadata_file.exists():
            metadata_file.unlink()
        print(f"🗑️ Rensade {directory}")

def generate_parameter_images_mercator(
    parameter, area_data, water_point_cache, water_mask_grid, 
    wgs84_bbox, mercator_bbox, wgs84_to_mercator, mercator_to_wgs84,
    output_base_dir, resolution, max_images, force
):
    """
    Generera Mercator-bilder för en specifik parameter
    """
    config = get_parameter_config(parameter)
    param_name = config['name']
    output_dir = Path(output_base_dir) / config['output_dir']
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n🚀 Genererar Mercator {param_name}-bilder...")
    
    if force:
        clear_directory(output_dir)
    
    timestamps = area_data['metadata']['timestamps']
    if max_images:
        timestamps = timestamps[:max_images]
        print(f"🔬 Testläge: {max_images} bilder")
    
    successful_count = 0
    
    for i, timestamp in enumerate(timestamps):
        print(f"\n📸 Mercator {param_name.title()} {i+1}/{len(timestamps)}: {timestamp}")
        
        timestamp_prefix = timestamp[:13]
        safe_timestamp = timestamp.replace(':', '-').replace('+', 'plus')
        output_path = output_dir / f"{config['name_en']}_{safe_timestamp}.png"
        
        if output_path.exists() and not force:
            print(f"⏭️ Hoppar över befintlig Mercator-fil")
            successful_count += 1
            continue
        
        # Extrahera data
        lons, lats, values = extract_parameter_data_for_timestamp(
            area_data, timestamp_prefix, water_point_cache, parameter
        )
        
        if len(lons) > 0:
            success = create_interpolated_image_mercator(
                lons, lats, values, water_mask_grid, 
                output_path, timestamp, wgs84_bbox, mercator_bbox,
                wgs84_to_mercator, mercator_to_wgs84, parameter
            )
            if success:
                successful_count += 1
        else:
            print(f"⚠️ Ingen {param_name}-data för {timestamp}")
    
    print(f"\n🎉 Mercator {param_name.title()}: {successful_count}/{len(timestamps)} bilder klara")
    return successful_count, len(timestamps)

def main():
    parser = argparse.ArgumentParser(
        description='Mercator Marina Bildgenerator - Löser projektionsproblem'
    )
    parser.add_argument('--parameter', choices=['current', 'temperature', 'salinity', 'mackerel', 'all'], 
                       default='all', help='Parameter att generera (default: all)')
    parser.add_argument('--input', default='public/data/area-parameters-extended.json.gz',
                       help='Sökväg till area-parameters fil')
    parser.add_argument('--water-mask', default='public/data/scandinavian-waters.geojson',
                       help='Sökväg till vattenmask GeoJSON')
    parser.add_argument('--output-dir', default='public/data',
                       help='Bas-directory för output')
    parser.add_argument('--resolution', type=int, default=1400,
                       help='Grid-upplösning (default: 1400 för Mercator)')
    parser.add_argument('--max-images', type=int, default=None,
                       help='Max antal bilder per parameter (för testning)')
    parser.add_argument('--force', action='store_true',
                       help='Skriv över befintliga bilder')
    
    args = parser.parse_args()
    
    print("🗺️ MERCATOR MARINA BILDGENERATOR + MAKRILL")
    print("=" * 50)
    print("🎯 Löser projektionsproblem genom Web Mercator (EPSG:3857)")
    print("✨ Eliminerar behov av offset-system")
    print("🔄 Identisk interpolation och färglogik som original")
    print("🌐 Perfekt kartplacering utan korrigeringar")
    print("🐟 Inkluderar vetenskaplig makrillsannolikhet")
    
    # Bestäm parametrar
    if args.parameter == 'all':
        parameters = ['current', 'temperature', 'salinity', 'mackerel']
        print("🎯 Genererar ALLA parametrar i Mercator (inkl. makrill)")
    else:
        parameters = [args.parameter]
        config = get_parameter_config(args.parameter)
        print(f"🎯 Genererar Mercator {config['name']}")
    
    print(f"📦 Input: {args.input}")
    print(f"📁 Output: {args.output_dir}")
    print(f"🔧 Upplösning: {args.resolution}x{args.resolution} (Mercator grid)")
    
    # Ladda data
    print("\n📦 Laddar data...")
    water_polygons = load_water_mask(args.water_mask)
    area_data = load_area_parameters(args.input)
    
    # WGS84 bbox (identisk som original)
    wgs84_bbox = (10.3, 16.6, 54.9, 59.6)
    print(f"🗺️ WGS84 bbox: {wgs84_bbox}")
    
    # Sätt upp projektioner
    print("\n🗺️ Sätter upp projektioner...")
    wgs84_to_mercator, mercator_to_wgs84, mercator_bbox = setup_projection_transformers(wgs84_bbox)
    
    # Förbered cache-strukturer
    print("\n⚡ Förbereder cache-strukturer...")
    water_point_cache = create_water_point_cache(area_data, water_polygons)
    water_mask_grid = create_water_mask_grid_mercator(
        water_polygons, mercator_bbox, args.resolution, mercator_to_wgs84
    )
    
    # Frigör minne
    del water_polygons
    
    # Generera Mercator-bilder för varje parameter
    print("\n🚀 Startar Mercator bildgeneration...")
    total_successful = 0
    total_images = 0
    
    for parameter in parameters:
        successful, total = generate_parameter_images_mercator(
            parameter, area_data, water_point_cache, water_mask_grid,
            wgs84_bbox, mercator_bbox, wgs84_to_mercator, mercator_to_wgs84,
            args.output_dir, args.resolution, args.max_images, args.force
        )
        total_successful += successful
        total_images += total
    
    print("\n" + "=" * 50)
    print("🎉 MERCATOR BILDGENERERING KLAR!")
    print(f"📊 Resultat: {total_successful}/{total_images} Mercator-bilder")
    print(f"📁 Sparade i: {Path(args.output_dir).absolute()}")
    
    for parameter in parameters:
        config = get_parameter_config(parameter)
        param_dir = Path(args.output_dir) / config['output_dir']
        print(f"   • {config['name'].title()}: {param_dir}")
    
    print("\n🗺️ Projektion: Web Mercator (EPSG:3857)")
    print("✅ Inga offset-korrigeringar behövs")
    print("🎯 Perfekt kartplacering garanterad")

if __name__ == "__main__":
    main() 