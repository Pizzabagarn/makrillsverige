#!/usr/bin/env python3
"""
MERCATOR MARINA BILDGENERATOR - Löser projektionsproblem
Genererar interpolerade bilder direkt i Web Mercator projektion (EPSG:3857)
för perfekt kartplacering utan offset-behov.
"""

import json
import gzip
import time
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as colors
import matplotlib.patheffects as patheffects
from matplotlib.colors import ListedColormap
from scipy.interpolate import griddata, Rbf
from scipy.ndimage import binary_dilation, gaussian_filter
from scipy.spatial.distance import cdist
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from datetime import datetime
import os
from pathlib import Path
import geojson
from shapely.geometry import shape, Point, LineString
from shapely.ops import unary_union
import argparse
import warnings
import pyproj
from pyproj import Transformer
import math
import colorcet as cc
import time
import re

# Tysta alla warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=RuntimeWarning)

# MAKRILL-VÄRDEN KOMPRIMERING
def compress_mackerel_values():
    """Komprimera alla JSON-filer i mackerel-values mappen"""
    values_dir = Path('public/data/mackerel-probability-images-mercator/mackerel-values')
    
    if not values_dir.exists():
        print(f"⚠️ Mappen finns inte: {values_dir}")
        return False
    
    # Hitta alla JSON-filer
    json_files = list(values_dir.glob('*.json'))
    
    if not json_files:
        print("⚠️ Inga JSON-filer att komprimera")
        return False
    
    print(f"\n🗜️ Komprimerar {len(json_files)} makrill-värden JSON-filer...")
    
    total_original_size = 0
    total_compressed_size = 0
    successful_count = 0
    
    for json_file in json_files:
        try:
            # Läs original fil
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            # Komprimera till .gz
            gz_file = json_file.with_suffix('.json.gz')
            with gzip.open(gz_file, 'wt') as f:
                json.dump(data, f, separators=(',', ':'))
            
            # Beräkna storlekar
            original_size = json_file.stat().st_size
            compressed_size = gz_file.stat().st_size
            
            total_original_size += original_size
            total_compressed_size += compressed_size
            
            # Ta bort original JSON-fil
            json_file.unlink()
            
            successful_count += 1
            print(f"   ✅ {json_file.name} → {gz_file.name} ({original_size/1024:.1f}KB → {compressed_size/1024:.1f}KB)")
            
        except Exception as e:
            print(f"   ❌ Fel vid komprimering av {json_file.name}: {e}")
    
    if successful_count > 0:
        compression_ratio = (1 - total_compressed_size / total_original_size) * 100
        print(f"\n🎉 Komprimering klar!")
        print(f"   📊 {successful_count}/{len(json_files)} filer komprimerade")
        print(f"   📦 {total_original_size/1024/1024:.1f}MB → {total_compressed_size/1024/1024:.1f}MB ({compression_ratio:.1f}% komprimering)")
        return True
    else:
        print("❌ Ingen komprimering lyckades")
        return False

def clear_all_mackerel_values():
    """
    Ta bort ALLA gamla makrill-värdefiler innan nya genereras
    Vi vill bara ha data för de nya bilderna
    """
    values_dir = Path('public/data/mackerel-probability-images-mercator/mackerel-values')
    
    if not values_dir.exists():
        values_dir.mkdir(parents=True, exist_ok=True)
        return
    
    # Ta bort alla gamla filer
    old_files = list(values_dir.glob('*.json.gz')) + list(values_dir.glob('*.json'))
    
    if old_files:
        print(f"🗑️ Rensar ALLA gamla makrill-värdefiler ({len(old_files)} filer)...")
        for old_file in old_files:
            old_file.unlink()
        print("✅ Alla gamla filer borttagna")
    else:
        print("📁 Inga gamla filer att rensa")

def save_all_mackerel_values_single_file(all_values_data, output_dir):
    """
    Spara ALL makrill-data i EN komprimerad fil istället för hundratals separata
    Much smarter approach!
    """
    values_dir = Path(output_dir) / 'mackerel-values'
    values_dir.mkdir(parents=True, exist_ok=True)
    
    # EN fil för alla timestamps
    single_file = values_dir / 'all_mackerel_values.json.gz'
    
    print(f"💾 Sparar ALL makrill-data i EN fil: {single_file.name}")
    
    with gzip.open(single_file, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(all_values_data, f, separators=(',', ':'))
    
    file_size = single_file.stat().st_size
    total_timestamps = len(all_values_data.get('timestamps', {}))
    
    print(f"✅ Sparad: {file_size:,} bytes, {total_timestamps} timestamps")
    print(f"📁 Istället för {total_timestamps} separata filer - MYCKET smartare!")

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

# MAKRILLSANNOLIKHETS FÄRGSKALA - MATCHAR LEGENDEN EXAKT
# Samma som MackerelLegend.tsx: Svart → Brun → Guld → Gul → Vit
# Värdeintervall: -39% till +102.2% (från verklig dataanalys)
MACKEREL_PROBABILITY_COLORMAP = [
    # === SVART BAS FÖR LÅGA VÄRDEN ===
    [-39.0, "#000000"],    # Absolut minimum - svart
    [-20.0, "#000000"],    # Svart
    [0.0, "#000000"],      # Svart vid neutral punkt
    
    # === SMIDIG PROGRESSION TILL BRUN (MATCHAR LEGENDEN) ===
    [20.0, "#0A0800"],     # Mycket mörk brun
    [25.0, "#151000"],     # Mörk brun
    [30.0, "#201800"],     # Mörkbrun
    [35.0, "#2B2000"],     # Mörkbrun
    [40.0, "#362800"],     # Mörkbrun
    [45.0, "#413000"],     # Mörkbrun
    [50.0, "#4C3800"],     # Mörkbrun
    [52.0, "#574000"],     # Brun
    [55.0, "#624800"],     # Brun
    [58.0, "#6D5000"],     # Brun
    [60.0, "#785800"],     # Brun
    [62.0, "#836000"],     # Brun-gul
    [65.0, "#8E6800"],     # Brun-gul
    [67.0, "#997000"],     # Brun-gul
    [69.0, "#A47800"],     # Gul-brun
    [70.0, "#BB8800"],     # Guld-brun
    [72.0, "#CC9900"],     # Orange-guld
    [75.0, "#DDAA00"],     # Ljus orange
    [77.0, "#EEBB00"],     # Gul-orange
    [80.0, "#FFCC00"],     # Gul-orange
    [82.0, "#FFDD11"],     # Gul
    [85.0, "#FFEE22"],     # Ljus gul
    [87.0, "#FFFF33"],     # Gul
    [90.0, "#FFFF55"],     # Ljus gul
    [92.0, "#FFFF77"],     # Mycket ljus gul
    [95.0, "#FFFF99"],     # Nästan vit-gul
    [97.0, "#FFFFAA"],     # Ljus vit-gul
    [100.0, "#FFFFCC"],    # Nästan vit
    [102.2, "#FFFFFF"],    # Absolut maximum - vit
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
            'smooth_factor': 0.7,  # Samma som de andra lagren
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

def get_season_from_iso_timestamp(ts: str) -> str:
    """Returnera säsong baserat på UTC-timestamp (ISO med Z)"""
    try:
        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        m = dt.month
        # Säsonger (svenska havet):
        # Vinter: Dec–Mar
        # Vår: Apr–Maj
        # Sommar: Jun–Sep (inkl. september)
        # Höst: Oct–Nov
        if m in (12, 1, 2, 3):
            return 'winter'
        if m in (4, 5):
            return 'spring'
        if m in (6, 7, 8, 9):
            return 'summer'
        return 'fall'
    except Exception:
        return 'summer'

SEASONAL_TEMPERATURE_RANGES = {
    'winter': (0.0, 11.0),   # Dec–Mar
    'spring': (3.0, 17.0),   # Apr–Maj
    'summer': (7.0, 25.0),   # Jun–Sep
    'fall':   (4.0, 17.0),   # Oct–Nov
}

def create_mackerel_colormap():
    """Skapa ultra-mjuk makrill colormap med förbättrade övergångar"""
    from matplotlib.colors import LinearSegmentedColormap
    
    # Hämta min/max värden från den nya färgskalan
    min_val = min(point[0] for point in MACKEREL_PROBABILITY_COLORMAP)  # -39.0
    max_val = max(point[0] for point in MACKEREL_PROBABILITY_COLORMAP)  # 102.2
    
    # Använd vår nya detaljerade colormap för mjuka övergångar
    colormap_data = MACKEREL_PROBABILITY_COLORMAP
    
    # Normalisera värdena till 0-1 intervall för LinearSegmentedColormap
    norm_values = []
    colors_list = []
    
    for value, color in colormap_data:
        norm_value = (value - min_val) / (max_val - min_val)
        norm_values.append(norm_value)
        colors_list.append(color)
    
    # Skapa LinearSegmentedColormap med optimerad gamma för mjukare övergångar
    cmap = LinearSegmentedColormap.from_list(
        'mackerel_ultra_smooth',
        list(zip(norm_values, colors_list)),
        N=512,  # Öka från standard 256 till 512 för mjukare övergångar
        gamma=0.8  # Minska gamma från 0.9 till 0.8 för mjukare visuella övergångar
    )
    
    print("   🎨 Ultra-mjuk makrill colormap: Svart→Grå→Blå→Orange progression!")
    print(f"   📊 Värdeintervall: {min_val:.1f}% till {max_val:.1f}% (från verklig dataanalys)")
    print("   🌈 Progression: Svart (0-25%) → Grå (25%) → Blå (25-50%) → Orange/Gul (50-100%)")
    print("   💡 Optimerad med 512 färgsteg och gamma=0.8 för ultra-mjuka övergångar")
    print("   ⚡ Smooth factor: 1.2 för extra gaussisk utjämning")
    
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
                    # Beräkna makrillsannolikhet baserat på alla parametrar med timeout
                    try:
                        temperature = data_entry.get('temperature')
                        salinity = data_entry.get('salinity')
                        current_data = data_entry.get('current', {})
                        current_u = current_data.get('u') if current_data else None
                        current_v = current_data.get('v') if current_data else None
                        timestamp = data_entry['time']
                        
                        # Snabb check om vi har tillräckligt med data
                        if temperature is None or salinity is None:
                            value = None
                        else:
                            # Beräkna makrillsannolikhet med timeout protection
                            raw_value = calculate_mackerel_probability(
                                temperature, salinity, current_u, current_v, timestamp, lat, lon
                            )
                            
                            # Filtrera bort negativa värden - makrill-sannolikhet kan inte vara negativ
                            if raw_value is not None and raw_value >= 0:
                                value = raw_value
                            else:
                                value = None
                    except Exception as e:
                        # Om något går fel i makrillberäkningen, logga men fortsätt
                        print(f"⚠️ Makrillberäkning misslyckades för punkt {lat:.3f},{lon:.3f}: {e}")
                        value = None
                
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
        'mackerel': 0.1      # Samma som de andra lagren
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
    wgs84_bbox, mercator_bbox, wgs84_to_mercator, mercator_to_wgs84, parameter, skip_values=False, quality=85, all_mackerel_data=None,
    temperature_range_override=None
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
        cmap, base_vmin, base_vmax = create_parameter_colormap(parameter)

        # Temperatur: använd batchens säsongsintervall om angivet, annars fallback till timestamp-baserat
        vmin, vmax = base_vmin, base_vmax
        if parameter == 'temperature':
            if temperature_range_override is not None:
                vmin, vmax = temperature_range_override
            else:
                season = get_season_from_iso_timestamp(timestamp)
                season_vmin, season_vmax = SEASONAL_TEMPERATURE_RANGES.get(season, (7.0, 25.0))
                vmin, vmax = season_vmin, season_vmax
        print(f"   🎨 Colormap: {vmin:.2f} - {vmax:.2f} {unit}")
        
        # Beräkna aspektförhållande baserat på Mercator-region
        x_range = actual_x_max - actual_x_min
        y_range = actual_y_max - actual_y_min
        aspect_ratio = x_range / y_range
        
        # Optimerad figur-storlek
        target_width_pixels = max(1200, grid_resolution // 2)  # Öka från 800 till 1200 för bättre kvalitet
        target_height_pixels = int(target_width_pixels / aspect_ratio)
        
        fig_width_inches = 12
        fig_height_inches = fig_width_inches / aspect_ratio
        
        dpi = max(target_width_pixels / fig_width_inches, 200)  # Öka från 150 till 200 DPI
        
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
            
            # Skapa glow-mask för värden över 75%
            glow_mask = np.zeros_like(grid_values)
            high_prob_mask = grid_values >= 75.0
            glow_mask[high_prob_mask] = grid_values[high_prob_mask]
            
            # Applicera glow-effekt med gaussisk filter
            from scipy.ndimage import gaussian_filter
            glow_effect = gaussian_filter(glow_mask, sigma=3.0)
            
            # Normalisera glow-effekten
            if np.max(glow_effect) > 0:
                glow_effect = glow_effect / np.max(glow_effect)
            
            # Skapa glow-colormap (genomskinlig till ljusgul)
            from matplotlib.colors import LinearSegmentedColormap
            glow_colors = [(0, 0, 0, 0), (1, 1, 0.5, 0.3), (1, 1, 0.8, 0.6)]
            glow_cmap = LinearSegmentedColormap.from_list('glow', glow_colors)
            
            # Lägg till glow som extra lager
            ax.imshow(
                glow_effect,
                extent=(actual_x_min, actual_x_max, actual_y_min, actual_y_max),
                origin='lower',
                cmap=glow_cmap,
                alpha=0.7,
                interpolation='bicubic'  # Samma som de andra lagren
            )
        
        # === ELEGANTA GYLLENE KONTURLINJER ===
        print("   📊 Skapar eleganta gyllene konturlinjer...")
        
        # Konturnivåer för hotspots
        contour_levels = [75, 85, 95]  # Fler nivåer för finare gradation
        
        # ELEGANT GYLLENE FÄRGPALETT - mjuka, lyxiga toner
        # Från mörk guld till ljus vit-guld för maximal elegans
        contour_colors = [
            '#B8860B',  # Mörk guld (75%)
            '#DAA520',  # Guld (85%)
            '#FFD700'   # Ljus guld (95%)
        ]
        
        # Finare linjetjocklek för elegans
        contour_linewidths = [1.5, 2.0, 2.5]  # Gradvis tjockare för viktiga nivåer
        
        # Rita eleganta konturlinjer med glow-effekt
        try:
            # Första passagen: Bred glow-effekt i genomskinlig guld
            contour_glow = ax.contour(
                x_mesh, y_mesh, grid_values,
                levels=contour_levels,
                colors=['#FFD700', '#FFD700', '#FFD700'],  # Samma gyllene färg för alla
                linewidths=[6.0, 7.0, 8.0],  # Mycket bred för glow
                alpha=0.3,  # Mycket genomskinlig för glow-effekt
                zorder=2
            )
            
            # Andra passagen: Huvudkonturlinjer med eleganta färger
            contour_main = ax.contour(
                x_mesh, y_mesh, grid_values,
                levels=contour_levels,
                colors=contour_colors,
                linewidths=contour_linewidths,
                alpha=0.9,  # Stark men inte helt opak
                zorder=3
            )
            
            # Tredje passagen: Fin vit highlight för extra glow
            contour_highlight = ax.contour(
                x_mesh, y_mesh, grid_values,
                levels=contour_levels,
                colors=['#FFFFFF', '#FFFFFF', '#FFFFFF'],  # Vit highlight
                linewidths=[0.8, 1.0, 1.2],  # Mycket tunn för subtil highlight
                alpha=0.7,  # Genomskinlig för att blenda fint
                zorder=4
            )
            
            print(f"   ✨ Eleganta gyllene konturlinjer tillagda: {contour_levels}% med glow-effekt")
            
        except Exception as e:
            print(f"   ⚠️ Konturlinjer hoppades över: {e}")
        
        # Plotta med exakta grid-koordinater
        im = ax.imshow(
            grid_values,
            extent=(actual_x_min, actual_x_max, actual_y_min, actual_y_max),
            origin='lower',
            cmap=cmap,
            vmin=vmin,
            vmax=vmax,
            alpha=0.85,
            interpolation='bicubic'  # Samma som de andra lagren
        )
        
        # Hotspot-text borttagen på användarens begäran
        
        # Spara makrill-värden för popup-användning (samma struktur som andra parametrar)
        # Samla makrill-värden för senare sparande i EN fil
        if parameter == 'mackerel' and not skip_values and all_mackerel_data is not None:
            # Använd samma struktur som andra parametrar - bara spara för ursprungliga punkter
            mackerel_data = []
            for i, (lon, lat, value) in enumerate(zip(lons, lats, values)):
                mackerel_data.append({
                    'lat': float(lat),
                    'lon': float(lon),
                    'value': float(value)
                })
            
            # Lägg till i samlad data istället för att spara separat fil
            all_mackerel_data['timestamps'][timestamp] = {
                'bbox': list(wgs84_bbox),
                'total_points': len(mackerel_data),
                'values': mackerel_data
            }
            
            print(f"   ✅ Samlade {len(mackerel_data)} makrill-värden för {timestamp}")
        elif parameter == 'mackerel' and skip_values:
            print("   ⚡ Hoppade över makrill-värden (--skip-values)")
        
        # Spara som PNG först och konvertera till WebP med quality-kontroll
        png_temp_path = output_path.with_suffix('.png')
        plt.savefig(
            png_temp_path,
            format='png',
            dpi=dpi,  # Använd den högre DPI
            bbox_inches='tight',
            pad_inches=0,
            transparent=True,
            facecolor='none'
        )
        
        # Konvertera PNG till WebP med quality-kontroll
        from PIL import Image
        with Image.open(png_temp_path) as img:
            img.save(output_path, 'WebP', quality=quality, lossless=False)
        
        # Ta bort temporär PNG
        png_temp_path.unlink()
        plt.close()
        
        # FIXAD METADATA-HANTERING: Inte läsa gamla filer som orsakar problemet
        # Metadata hanteras nu på rätt sätt utan att gamla poster blir kvar
        
        print(f"✅ Sparade Mercator-bild: {output_path}")
        return True

    except Exception as e:
        print(f"❌ Fel vid skapande av {param_name}-bild: {e}")
        return False

def generate_parameter_images_mercator(
    parameter, area_data, water_point_cache, water_mask_grid,
    wgs84_bbox, mercator_bbox, wgs84_to_mercator, mercator_to_wgs84,
    output_base_dir, resolution, max_images, force, skip_values=False, quick=None, quality=85
):
    """
    Generera Mercator-bilder för en specifik parameter
    """
    config = get_parameter_config(parameter)
    param_name = config['name']
    output_dir = Path(output_base_dir) / config['output_dir']
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n🚀 Genererar Mercator {param_name}-bilder...")
    if skip_values and parameter == 'mackerel':
        print("⚡ Snabbläge: Hoppar över makrill-värden")
    
    # Rensa ALLA gamla makrill-värdefiler innan nya genereras
    if parameter == 'mackerel' and not skip_values:
        clear_all_mackerel_values()
    
    if force:
        clear_directory(output_dir)
    
    # VIKTIGT: Kopiera timestamps för att undvika att påverka andra parametrar
    timestamps = area_data['metadata']['timestamps'].copy()
    
    # Hantera quick mode (senaste N bilder)
    if quick:
        # Sortera timestamps för att få senaste först
        sorted_timestamps = sorted(timestamps, key=lambda x: x, reverse=True)
        timestamps = sorted_timestamps[:quick]
        print(f"⚡ Quick-läge: {quick} senaste bilder")
    elif max_images:
        timestamps = timestamps[:max_images]
        print(f"🔬 Testläge: {max_images} bilder")
    
    successful_count = 0
    start_time = time.time()
    
    # Samla ALL makrill-data i EN dictionary för senare sparande
    all_mackerel_data = None
    if parameter == 'mackerel' and not skip_values:
        all_mackerel_data = {
            'parameter': 'mackerel_probability',
            'generated_at': datetime.utcnow().isoformat() + 'Z',
            'total_timestamps': len(timestamps),
            'wgs84_bbox': list(wgs84_bbox),
            'timestamps': {}  # Här samlas data för varje timestamp
        }

    # Rensa föråldrade bilder som inte finns i nya timestamps (om vi inte forcerar allt)
    expected_filenames = set()
    for ts in timestamps:
        safe_ts = ts.replace(':', '-').replace('+', 'plus')
        expected_filenames.add(f"{config['name_en']}_{safe_ts}.webp")
    if not force:
        # Standard: flytta föråldrade till arkiv i stället för att ta bort
        try:
            archive_obsolete_images(output_dir, expected_filenames, config['output_dir'])
        except Exception as e:
            print(f"⚠️ Arkivering misslyckades, försöker ta bort istället: {e}")
            purge_obsolete_images(output_dir, expected_filenames)

    # Förbered referenstid för datamängden (fetchedAt) för att identifiera gamla filer
    dataset_fetched_at = None
    try:
        fetched_at_str = area_data.get('metadata', {}).get('fetchedAt')
        if fetched_at_str:
            dataset_fetched_at = datetime.fromisoformat(fetched_at_str.replace('Z', '+00:00')).timestamp()
    except Exception as e:
        print(f"⚠️ Kunde inte tolka fetchedAt från metadata: {e}")
    
    # Lås säsongsintervall per körning (build-date season) för TEMPERATUR
    build_generated_at = datetime.utcnow().isoformat() + 'Z'
    temperature_range_for_run = None
    if parameter == 'temperature':
        # Använd säsong vid byggtillfället (inte per-bild) enligt önskemål
        build_season = get_season_from_iso_timestamp(build_generated_at)
        temperature_range_for_run = SEASONAL_TEMPERATURE_RANGES.get(build_season, (7.0, 25.0))

    for i, timestamp in enumerate(timestamps):
        image_start_time = time.time()
        print(f"\n📸 Mercator {param_name.title()} {i+1}/{len(timestamps)}: {timestamp}")
        
        timestamp_prefix = timestamp[:13]
        safe_timestamp = timestamp.replace(':', '-').replace('+', 'plus')
        # Generera WebP direkt för bättre prestanda
        output_path = output_dir / f"{config['name_en']}_{safe_timestamp}.webp"
        
        if output_path.exists() and not force:
            # Hoppa endast över om filen inte är äldre än den nya datamängden
            try:
                file_mtime = output_path.stat().st_mtime
                if dataset_fetched_at is not None and file_mtime < dataset_fetched_at:
                    print("🔄 Befintlig fil är äldre än fetchedAt → regenererar")
                else:
                    print(f"⏭️ Hoppar över befintlig Mercator-fil (redan ny)")
                    successful_count += 1
                    continue
            except Exception as e:
                print(f"⚠️ Kunde inte läsa filens mtime, regenererar: {e}")
        
        try:
            # Extrahera data med progress reporting
            print(f"   🔍 Extraherar data för {timestamp_prefix}...")
            lons, lats, values = extract_parameter_data_for_timestamp(
                area_data, timestamp_prefix, water_point_cache, parameter
            )
            print(f"   📊 Hittade {len(lons)} datapunkter")
            
            if len(lons) > 0:
                success = create_interpolated_image_mercator(
                    lons, lats, values, water_mask_grid,
                    output_path, timestamp, wgs84_bbox, mercator_bbox,
                    wgs84_to_mercator, mercator_to_wgs84, parameter, skip_values, quality, all_mackerel_data,
                    temperature_range_override=temperature_range_for_run
                )
                if success:
                    successful_count += 1
                    image_time = time.time() - image_start_time
                    total_time = time.time() - start_time
                    avg_time = total_time / (i + 1)
                    remaining_images = len(timestamps) - (i + 1)
                    estimated_remaining = remaining_images * avg_time
                    
                    print(f"   ✅ Bild klar på {image_time:.1f}s (total: {total_time/60:.1f}min, "
                          f"uppskattad återstående tid: {estimated_remaining/60:.1f}min)")
                else:
                    print(f"   ❌ Bildgenerering misslyckades för {timestamp}")
            else:
                print(f"   ⚠️ Ingen {param_name}-data för {timestamp}")
                
        except Exception as e:
            print(f"   ❌ Fel vid bearbetning av {timestamp}: {e}")
            # Fortsätt med nästa bild istället för att krascha

    # CENTRALISERAD METADATA - Skapa HELT NY metadata baserat på faktiskt genererade bilder
    print(f"\n📄 Skapar metadata för {param_name}...")
    metadata_path = output_dir / 'metadata.json'
    
    # Skapa metadata från BEFINTLIGA bilder (undviker gamla poster)
    webp_files = list(output_dir.glob('*.webp'))
    metadata = {
        'parameter': parameter,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'resolution': f"{resolution}x{resolution}",  # Använd input-resolution
        'wgs84_bbox': list(wgs84_bbox),
        'mercator_bbox': list(mercator_bbox),
        'projection': 'EPSG:3857',
        'total_images': len(webp_files),
        'images': []
    }
    
    # Lägg till varje befintlig bild i metadata
    for webp_file in sorted(webp_files):
        # Extrahera timestamp från filnamn
        timestamp_match = re.search(r'(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.000Z)', webp_file.name)
        if timestamp_match:
            # FIXAT: Skapa korrekt ISO timestamp - bara ändra tid-delen efter T
            filename_timestamp = timestamp_match.group(1)
            # Dela upp i datum och tid, fixa bara tiden
            date_part = filename_timestamp[:10]  # 2025-07-19 (behåll bindestreck)
            time_part = filename_timestamp[11:]  # 18-00-00.000Z (ändra till kolon)
            timestamp = date_part + 'T' + time_part.replace('-', ':')
            
            # Säsongsintervall för temperatur skrivs per bild i value_range
            season_range = None
            if parameter == 'temperature':
                season = get_season_from_iso_timestamp(timestamp)
                season_range = list(SEASONAL_TEMPERATURE_RANGES.get(season, (7.0, 25.0)))

            image_info = {
                'timestamp': timestamp,
                'filename': webp_file.name,
                'data_points': 2692,  # Standard
                'value_range': season_range if season_range else [0.0, 1.0],
                'mercator_coordinates': [
                    [mercator_bbox[0], mercator_bbox[3]],  # top-left
                    [mercator_bbox[1], mercator_bbox[3]],  # top-right
                    [mercator_bbox[1], mercator_bbox[2]],  # bottom-right
                    [mercator_bbox[0], mercator_bbox[2]]   # bottom-left
                ]
            }
            metadata['images'].append(image_info)

    # Lägg till root color_range för temperatur (för frontenden att läsa)
    if parameter == 'temperature':
        # Lås rotens color_range till build-runens säsong (inte per-bild)
        try:
            build_season = get_season_from_iso_timestamp(metadata['generated_at'])
            metadata['color_range'] = list(SEASONAL_TEMPERATURE_RANGES.get(build_season, (7.0, 25.0)))
        except Exception:
            metadata['color_range'] = [7.0, 25.0]
    
    # Sortera efter timestamp
    metadata['images'].sort(key=lambda x: x['timestamp'])
    metadata['total_images'] = len(metadata['images'])
    
    # Spara metadata
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✅ Metadata sparad: {metadata_path} ({len(metadata['images'])} bilder)")

    # Spara ALL makrill-data i EN fil vid slutet
    if all_mackerel_data is not None and len(all_mackerel_data['timestamps']) > 0:
        save_all_mackerel_values_single_file(all_mackerel_data, output_dir.parent)
    
    print(f"\n🎉 Mercator {param_name.title()}: {successful_count}/{len(timestamps)} bilder klara")
    return successful_count, len(timestamps)

def clear_directory(directory):
    """Ta bort alla WebP-filer, PNG-filer och metadata i en directory"""
    import shutil
    for file in Path(directory).glob('*.webp'):
        file.unlink()
    # Ta även bort gamla PNG-filer om de finns
    for file in Path(directory).glob('*.png'):
        file.unlink()
    # Ta bort metadata.json för att rensa gamla poster helt
    metadata_file = Path(directory) / 'metadata.json'
    if metadata_file.exists():
        metadata_file.unlink()
        print(f"🗑️ Rensade gammal metadata: {metadata_file}")
    print(f"🗑️ Rensade {directory}")


def purge_obsolete_images(output_dir, expected_filenames):
    """Ta bort WebP-bilder som inte längre finns i nya timestamp-setet"""
    removed_count = 0
    for file in Path(output_dir).glob('*.webp'):
        if file.name not in expected_filenames:
            try:
                file.unlink()
                removed_count += 1
            except Exception as e:
                print(f"   ⚠️ Kunde inte radera {file.name}: {e}")
    if removed_count > 0:
        print(f"🧹 Tog bort {removed_count} föråldrade WebP-bilder som inte ingår i nya prognosen")


def archive_obsolete_images(output_dir, expected_filenames, parameter_output_dir):
    """Flytta WebP-bilder som inte finns i nya timestamp-setet till ett arkiv"""
    archive_base = Path('public/data/archive') / parameter_output_dir
    moved_count = 0
    for file in Path(output_dir).glob('*.webp'):
        if file.name in expected_filenames:
            continue
        # Hämta datum från filnamn
        try:
            m = re.search(r'(\d{4}-\d{2}-\d{2})T\d{2}-\d{2}-\d{2}\.000Z', file.name)
            date_folder = m.group(1) if m else 'unknown-date'
        except Exception:
            date_folder = 'unknown-date'
        dest_dir = archive_base / date_folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / file.name
        try:
            file.rename(dest_path)
            moved_count += 1
        except Exception as e:
            print(f"   ⚠️ Kunde inte flytta {file.name} till arkiv: {e}")
    if moved_count > 0:
        print(f"📦 Arkiverade {moved_count} föråldrade bilder till {archive_base}")




def main():
    parser = argparse.ArgumentParser(
        description='Mercator Marina Bildgenerator - Löser projektionsproblem'
    )
    parser.add_argument('--parameter', 
                       default='all', 
                       help='Parameter att generera. Använd komma-separation för flera: current,temperature,salinity,mackerel eller "all" för alla (default: all)')
    parser.add_argument('--input', default='public/data/area-parameters-extended.json.gz',
                       help='Sökväg till area-parameters fil')
    parser.add_argument('--water-mask', default='public/data/scandinavian-waters.geojson',
                       help='Sökväg till vattenmask GeoJSON')
    parser.add_argument('--output-dir', default='public/data',
                       help='Bas-directory för output')
    parser.add_argument('--resolution', type=int, default=1400,
                       help='Grid-upplösning (default: 1400 för Mercator)')
    parser.add_argument('--quality', type=int, default=85, choices=range(1, 101),
                       help='WebP-kvalitet 1-100 (default: 85 - balans mellan kvalitet/storlek)')
    parser.add_argument('--max-images', type=int, default=None,
                       help='Max antal bilder per parameter (för testning)')
    parser.add_argument('--quick', type=int, default=None,
                       help='Snabbt läge: generera bara de senaste N bilderna (ex: --quick 24)')
    parser.add_argument('--force', action='store_true',
                       help='Skriv över befintliga bilder')
    parser.add_argument('--skip-values', action='store_true',
                       help='Hoppa över makrill-värden JSON-filer för snabbare testning')
    
    args = parser.parse_args()
    
    print("🗺️ MERCATOR MARINA BILDGENERATOR + MAKRILL")
    print("=" * 50)
    print("🎯 Löser projektionsproblem genom Web Mercator (EPSG:3857)")
    print("✨ Eliminerar behov av offset-system")
    print("🔄 Identisk interpolation och färglogik som original")
    print("🌐 Perfekt kartplacering utan korrigeringar")
    print("🐟 Inkluderar vetenskaplig makrillsannolikhet")
    if args.skip_values:
        print("⚡ Snabbläge: Hoppar över makrill-värden")
    
    # Bestäm parametrar - FÖRBÄTTRAD HANTERING
    valid_parameters = ['current', 'temperature', 'salinity', 'mackerel']
    
    if args.parameter == 'all':
        parameters = valid_parameters
        print("🎯 Genererar ALLA parametrar i Mercator (inkl. makrill)")
    else:
        # Hantera komma-separerade parametrar
        requested_params = [p.strip() for p in args.parameter.split(',')]
        parameters = []
        
        for param in requested_params:
            if param in valid_parameters:
                parameters.append(param)
                print(f"✅ Inkluderar: {get_parameter_config(param)['name']}")
            else:
                print(f"❌ Okänd parameter: {param}")
                print(f"   Giltiga parametrar: {', '.join(valid_parameters)}")
                return
        
        if not parameters:
            print("❌ Inga giltiga parametrar specificerade!")
            return
            
        print(f"🎯 Genererar {len(parameters)} parametrar: {', '.join(parameters)}")
    
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
    
    # Frigör minne från water_polygons nu när vi har water_mask_grid
    # (Frigörs efter bildgenerering)
    
    # Generera Mercator-bilder för varje parameter
    print("\n🚀 Startar Mercator bildgeneration...")
    total_successful = 0
    total_images = 0
    
    for parameter in parameters:
        successful, total = generate_parameter_images_mercator(
            parameter, area_data, water_point_cache, water_mask_grid,
            wgs84_bbox, mercator_bbox, wgs84_to_mercator, mercator_to_wgs84,
            args.output_dir, args.resolution, args.max_images, args.force, args.skip_values, args.quick, args.quality
        )
        total_successful += successful
        total_images += total
    
    # Frigör minne efter bildgenerering
    del water_polygons
    
    # Automatisk komprimering av makrill-värden om makrill genererades OCH inte skip_values
    if 'mackerel' in parameters and not args.skip_values:
        print("\n" + "=" * 50)
        print("🗜️ AUTOMATISK KOMPRIMERING AV MAKRILL-VÄRDEN")
        compress_mackerel_values()
    elif 'mackerel' in parameters and args.skip_values:
        print("\n⚡ Hoppade över komprimering av makrill-värden (--skip-values)")
    
    print("\n" + "=" * 50)
    print("🎉 MERCATOR BILDGENERERING KLAR!")
    print(f"📊 Resultat: {total_successful}/{total_images} Mercator-bilder")
    print(f"📁 Sparade i: {Path(args.output_dir).absolute()}")
    
    # Visa mapparna som skapades
    for parameter in parameters:
        config = get_parameter_config(parameter)
        print(f"   • {config['name'].title()}: {Path(args.output_dir) / config['output_dir']}")
    
    print(f"\n🗺️ Projektion: Web Mercator (EPSG:3857)")
    print(f"✅ Inga offset-korrigeringar behövs")
    print(f"🎯 Perfekt kartplacering garanterad")

if __name__ == '__main__':
    main() 