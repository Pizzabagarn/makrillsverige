#!/usr/bin/env python3
"""
Debug vattenmask för att se om Drogden Lt felaktigt filtreras bort
"""

import json
import geojson
from shapely.geometry import shape, Point
from pathlib import Path

def debug_watermask_for_point(target_lat, target_lon):
    """Kontrollera om en punkt är i vattenmask"""
    
    print(f"🔍 Debugging vattenmask för ({target_lat}, {target_lon})")
    
    # Ladda vattenmask
    geojson_path = Path('public/data/scandinavian-waters.geojson')
    if not geojson_path.exists():
        print(f"❌ Hittar inte GeoJSON: {geojson_path}")
        return
    
    with open(geojson_path, 'r', encoding='utf-8') as f:
        water_geojson = geojson.load(f)
    
    print(f"🌊 Laddade vattenmask med {len(water_geojson['features'])} features")
    
    # Skapa Shapely-geometrier
    water_polygons = []
    for feature in water_geojson['features']:
        if feature['geometry']['type'] in ['Polygon', 'MultiPolygon']:
            water_polygons.append(shape(feature['geometry']))
    
    print(f"🗺️ Totalt {len(water_polygons)} vattenpolygoner")
    
    # Testa punkt
    target_point = Point(target_lon, target_lat)  # Lon, Lat för Shapely
    
    is_in_water = False
    matching_polygons = []
    
    for i, polygon in enumerate(water_polygons):
        if polygon.contains(target_point):
            is_in_water = True
            matching_polygons.append(i)
            
            # Visa info om polygonen
            bounds = polygon.bounds
            print(f"   ✅ Polygon {i}: bounds = {bounds}")
    
    print(f"\n🎯 Resultat:")
    print(f"   Target punkt: POINT({target_lon} {target_lat})")
    print(f"   I vatten: {'JA' if is_in_water else 'NEJ'}")
    print(f"   Matchande polygoner: {len(matching_polygons)}")
    
    if not is_in_water:
        print(f"❌ PROBLEM: Punkt klassas som LAND, inte vatten!")
        print(f"   Detta betyder att den filtreras bort från bildgenereringen")
        
        # Hitta närmaste vattenområde
        min_distance = float('inf')
        nearest_polygon = None
        
        for i, polygon in enumerate(water_polygons[:10]):  # Kolla bara första 10 för prestanda
            distance = target_point.distance(polygon)
            if distance < min_distance:
                min_distance = distance
                nearest_polygon = i
        
        if nearest_polygon is not None:
            print(f"📍 Närmaste vattenområde: Polygon {nearest_polygon}")
            print(f"📏 Avstånd: {min_distance:.6f}° (~{min_distance*111:.1f}km)")
    else:
        print(f"✅ Punkt är korrekt klassad som vatten")
    
    return is_in_water

def main():
    # Drogden Lt koordinater
    target_lat = 55.5344
    target_lon = 12.7036
    
    print("🚢 Debug av vattenmask för Drogden Lt")
    print("=" * 50)
    
    is_water = debug_watermask_for_point(target_lat, target_lon)
    
    if not is_water:
        print(f"\n💡 LÖSNING:")
        print(f"   Problem är att Drogden Lt-området filtreras bort av vattenmask")
        print(f"   Även om interpolation fungerar korrekt, syns det inte i final bild")
        print(f"   Behöver uppdatera vattenmask eller minska filtrering")

if __name__ == "__main__":
    main() 