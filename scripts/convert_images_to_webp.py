#!/usr/bin/env python3
"""
🖼️ PNG → WebP Conversion Script for Mobile Performance
Converts all PNG images to WebP format for 25-35% smaller file sizes

This script optimizes marine visualization images for mobile devices.
"""

import os
import sys
import argparse
from pathlib import Path
from PIL import Image
import json
import shutil

def convert_png_to_webp(png_path: Path, webp_path: Path, quality: int = 85) -> bool:
    """
    Konvertera PNG till WebP med optimal kvalitet
    
    Args:
        png_path: Sökväg till PNG-fil
        webp_path: Sökväg till WebP-fil
        quality: WebP-kvalitet (1-100, standard 85 för bra balans)
        
    Returns:
        bool: True om konvertering lyckades
    """
    try:
        with Image.open(png_path) as img:
            # Bevara transparens om det finns
            if img.mode in ('RGBA', 'LA'):
                img.save(webp_path, 'WebP', quality=quality, lossless=False)
            else:
                img.save(webp_path, 'WebP', quality=quality, optimize=True)
        return True
    except Exception as e:
        print(f"❌ Fel vid konvertering av {png_path}: {e}")
        return False

def update_metadata_for_webp(metadata_path: Path) -> bool:
    """
    Uppdaterar metadata.json för att använda WebP-filer
    """
    try:
        if not metadata_path.exists():
            print(f"⚠️ Metadata-fil hittades inte: {metadata_path}")
            return False
            
        # Läs befintlig metadata
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        
        # Uppdatera image-URLs från .png till .webp
        if 'images' in metadata:
            for img in metadata['images']:
                if 'filename' in img and img['filename'].endswith('.png'):
                    img['filename'] = img['filename'].replace('.png', '.webp')
        
        # Uppdatera timestamps (för legacy-format)
        # Metadata behöver inte ändras för timestamps eftersom filnamnen genereras i koden
        
        # Lägg till WebP-flagga
        metadata['format'] = 'webp'
        metadata['optimized'] = True
        metadata['compression'] = 'lossy'
        
        # Skriv uppdaterad metadata direkt (ingen backup behövs)
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"✅ Metadata uppdaterad: {metadata_path}")
        return True
        
    except Exception as e:
        print(f"❌ Fel vid uppdatering av metadata {metadata_path}: {e}")
        return False

def convert_directory(input_dir: Path, quality: int = 85, remove_png: bool = False) -> dict:
    """
    Konvertera alla PNG-filer i en katalog till WebP
    
    Args:
        input_dir: Katalog med PNG-filer
        quality: WebP-kvalitet
        remove_png: Ta bort PNG-filer efter konvertering
        
    Returns:
        dict: Statistik över konvertering
    """
    stats = {
        'total_files': 0,
        'converted': 0,
        'failed': 0,
        'original_size': 0,
        'webp_size': 0,
        'savings': 0
    }
    
    png_files = list(input_dir.glob('*.png'))
    stats['total_files'] = len(png_files)
    
    print(f"📁 Konverterar {len(png_files)} PNG-filer i {input_dir}")
    
    for png_file in png_files:
        webp_file = png_file.with_suffix('.webp')
        
        # Skippa om WebP redan finns och är nyare
        if webp_file.exists() and webp_file.stat().st_mtime > png_file.stat().st_mtime:
            print(f"⏭️ Skippar konvertering av {png_file.name} (WebP finns redan)")
            
            # Men ta bort PNG om begärt, även när vi skippar konvertering
            if remove_png:
                png_file.unlink()
                print(f"🗑️ Tog bort {png_file.name} (behöll WebP)")
                stats['converted'] += 1  # Räkna som "hanterad"
            
            continue
        
        # Konvertera
        print(f"🔄 Konverterar {png_file.name}...")
        
        original_size = png_file.stat().st_size
        
        if convert_png_to_webp(png_file, webp_file, quality):
            webp_size = webp_file.stat().st_size
            savings = original_size - webp_size
            savings_percent = (savings / original_size) * 100
            
            stats['converted'] += 1
            stats['original_size'] += original_size
            stats['webp_size'] += webp_size
            stats['savings'] += savings
            
            print(f"✅ {png_file.name} → {webp_file.name} "
                  f"({original_size//1024}KB → {webp_size//1024}KB, -{savings_percent:.1f}%)")
            
            # Ta bort PNG om begärt
            if remove_png:
                png_file.unlink()
                print(f"🗑️ Tog bort {png_file.name}")
        else:
            stats['failed'] += 1
    
    return stats

def convert_marine_images(data_dir: Path, quality: int = 85, remove_png: bool = False):
    """
    Konvertera alla marina bilder till WebP
    """
    print(f"🌊 Startar marina bildkonvertering...")
    print(f"📁 Data-katalog: {data_dir}")
    print(f"🎯 WebP-kvalitet: {quality}")
    
    # Kataloger att konvertera
    image_dirs = [
        'current-images-mercator',
        'current-magnitude-images', 
        'mackerel-probability-images-mercator',
        'temperature-images-mercator',
        'salinity-images-mercator',
        'temperature-images',
        'salinity-images'
    ]
    
    total_stats = {
        'total_files': 0,
        'converted': 0,
        'failed': 0,
        'original_size': 0,
        'webp_size': 0,
        'savings': 0
    }
    
    for dir_name in image_dirs:
        dir_path = data_dir / dir_name
        
        if not dir_path.exists():
            print(f"⚠️ Katalog hittades inte: {dir_path}")
            continue
        
        print(f"\n📂 Bearbetar {dir_name}...")
        
        # Konvertera bilder
        dir_stats = convert_directory(dir_path, quality, remove_png)
        
        # Uppdatera metadata
        metadata_path = dir_path / 'metadata.json'
        if metadata_path.exists():
            update_metadata_for_webp(metadata_path)
        
        # Sammanställ statistik
        for key in total_stats:
            total_stats[key] += dir_stats[key]
        
        if dir_stats['converted'] > 0:
            if dir_stats['original_size'] > 0:
                dir_savings_percent = (dir_stats['savings'] / dir_stats['original_size']) * 100
                print(f"📊 {dir_name}: {dir_stats['converted']} filer konverterade, "
                      f"{dir_stats['savings']//1024//1024}MB sparade ({dir_savings_percent:.1f}%)")
            else:
                print(f"📊 {dir_name}: {dir_stats['converted']} PNG-filer borttagna (WebP fanns redan)")
    
    # Slutstatistik
    print(f"\n" + "="*60)
    print(f"🎉 MARINA BILDKONVERTERING SLUTFÖRD!")
    print(f"📊 Totalt: {total_stats['converted']}/{total_stats['total_files']} filer konverterade")
    
    if total_stats['original_size'] > 0:
        total_savings_percent = (total_stats['savings'] / total_stats['original_size']) * 100
        original_mb = total_stats['original_size'] / 1024 / 1024
        webp_mb = total_stats['webp_size'] / 1024 / 1024
        savings_mb = total_stats['savings'] / 1024 / 1024
        
        print(f"💾 Storlek: {original_mb:.1f}MB → {webp_mb:.1f}MB")
        print(f"💰 Sparade: {savings_mb:.1f}MB ({total_savings_percent:.1f}%)")
        print(f"🚀 Mobilprestanda förbättrad med ~{total_savings_percent:.0f}%!")
    
    elif total_stats['converted'] > 0 and total_stats['original_size'] == 0:
        print(f"🗑️ {total_stats['converted']} PNG-filer borttagna - WebP-filer behölls")
        print(f"🚀 Diskutrymme frigjort genom att ta bort PNG-dubbletter!")
    
    if total_stats['failed'] > 0:
        print(f"⚠️ {total_stats['failed']} filer misslyckades")

def main():
    parser = argparse.ArgumentParser(description='Konvertera marina PNG-bilder till WebP för bättre mobilprestanda')
    parser.add_argument('--data-dir', type=Path, default=Path('public/data'),
                        help='Katalog med marindata (standard: public/data)')
    parser.add_argument('--quality', type=int, default=85, choices=range(1, 101),
                        help='WebP-kvalitet 1-100 (standard: 85)')
    parser.add_argument('--remove-png', action='store_true',
                        help='Ta bort PNG-filer efter konvertering')
    parser.add_argument('--directory', type=Path,
                        help='Konvertera specifik katalog istället för alla')
    
    args = parser.parse_args()
    
    if args.directory:
        # Konvertera specifik katalog
        if not args.directory.exists():
            print(f"❌ Katalog hittades inte: {args.directory}")
            sys.exit(1)
        
        stats = convert_directory(args.directory, args.quality, args.remove_png)
        
        if stats['original_size'] > 0:
            savings_percent = (stats['savings'] / stats['original_size']) * 100
            print(f"\n🎉 Konvertering slutförd!")
            print(f"📊 {stats['converted']} filer, {stats['savings']//1024//1024}MB sparade ({savings_percent:.1f}%)")
        
    else:
        # Konvertera alla marina bilder
        if not args.data_dir.exists():
            print(f"❌ Data-katalog hittades inte: {args.data_dir}")
            sys.exit(1)
        
        convert_marine_images(args.data_dir, args.quality, args.remove_png)

if __name__ == '__main__':
    main() 