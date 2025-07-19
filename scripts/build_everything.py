#!/usr/bin/env python3
"""
🌊 MASTER MARINA BYGGSCRIPT - Gör Allt på en gång!

Detta script gör ALLT som behövs för att bygga hela marina systemet:
1. Hämtar area-parameters data
2. Genererar alla marina bilder direkt i WebP
3. Optimerar metadata
4. Rensar upp gamla filer
5. Redo att köra!

Användning:
    python scripts/build_everything.py                    # Standard build
    python scripts/build_everything.py --quick            # Bara senaste bilder
    python scripts/build_everything.py --force            # Tvinga regenerering
"""

import subprocess
import sys
import time
from pathlib import Path
import argparse
import json
import shutil
from datetime import datetime

def run_command(cmd, description, cwd=None, shell=False):
    """
    Kör ett command och hantera errors
    """
    print(f"\n{'='*60}")
    print(f"🔧 {description}")
    print(f"💻 Kör: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    print('='*60)
    
    start_time = time.time()
    
    try:
        if shell:
            result = subprocess.run(cmd, shell=True, check=True, cwd=cwd, 
                                  capture_output=False, text=True)
        else:
            result = subprocess.run(cmd, check=True, cwd=cwd,
                                  capture_output=False, text=True)
        
        elapsed = time.time() - start_time
        print(f"✅ {description} slutfört på {elapsed:.1f}s")
        return True
        
    except subprocess.CalledProcessError as e:
        elapsed = time.time() - start_time
        print(f"❌ {description} misslyckades efter {elapsed:.1f}s")
        print(f"Error: {e}")
        return False
    except FileNotFoundError as e:
        print(f"❌ Kommando hittades inte: {e}")
        return False

def cleanup_old_files():
    """
    Rensa gamla PNG-filer och inkonsekvent state
    """
    print("\n🗑️ Rensar gamla filer...")
    
    data_dirs = [
        'public/data/current-images-mercator',
        'public/data/temperature-images-mercator', 
        'public/data/salinity-images-mercator',
        'public/data/mackerel-probability-images-mercator'
    ]
    
    total_removed = 0
    
    for dir_path in data_dirs:
        path = Path(dir_path)
        if path.exists():
            # Ta bort alla PNG-filer
            png_files = list(path.glob('*.png'))
            for png_file in png_files:
                png_file.unlink()
                total_removed += 1
            
            if png_files:
                print(f"   🗑️ {len(png_files)} PNG-filer borttagna från {dir_path}")
    
    if total_removed > 0:
        print(f"✅ Totalt {total_removed} gamla PNG-filer borttagna")
    else:
        print("✅ Inga gamla filer att rensa")

def check_prerequisites():
    """
    Kontrollera att alla nödvändiga verktyg finns
    """
    print("🔍 Kontrollerar förutsättningar...")
    
    # Check Node.js/npm
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True, check=True)
        print(f"   ✅ Node.js: {result.stdout.strip()}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("   ❌ Node.js hittades inte - installera Node.js")
        return False
    
    # Check Python packages
    required_packages = ['matplotlib', 'numpy', 'scipy', 'pillow', 'geojson', 'shapely']
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package)
            print(f"   ✅ Python paket: {package}")
        except ImportError:
            missing_packages.append(package)
            print(f"   ❌ Saknas: {package}")
    
    if missing_packages:
        print(f"\n❌ Installera saknade paket: pip install {' '.join(missing_packages)}")
        return False
    
    return True

def build_everything(quick_mode=False, force_mode=False):
    """
    Huvudfunktion som kör hela byggprocessen
    """
    start_time = time.time()
    
    print("🌊 MAKRILLSVERIGE - MASTER BYGGSCRIPT")
    print("="*60)
    print(f"📅 Startad: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"⚡ Quick mode: {'Ja' if quick_mode else 'Nej'}")
    print(f"💪 Force mode: {'Ja' if force_mode else 'Nej'}")
    
    # Steg 1: Kontrollera förutsättningar
    if not check_prerequisites():
        return False
    
    # Steg 2: Rensa gamla filer
    cleanup_old_files()
    
    # Steg 3: Hämta Area Parameters
    success = run_command(
        ['npx', 'tsx', 'scripts/fetchAreaParametersExtended.ts'],
        "Hämtar Area Parameters Data",
        cwd=Path.cwd()
    )
    if not success:
        print("❌ Area Parameters hämtning misslyckades - avbryter")
        return False
    
    # Steg 4: Generera Marina Bilder (WebP direkt)
    marine_cmd = ['python', 'scripts/generate_marine_images_mercator.py']
    
    if quick_mode:
        marine_cmd.append('--quick')
    if force_mode:
        marine_cmd.append('--force')
    
    success = run_command(
        marine_cmd,
        "Genererar Marina Bilder (WebP)",
        cwd=Path.cwd()
    )
    if not success:
        print("❌ Marina bildgenerering misslyckades - avbryter")
        return False
    
    # Steg 5: Optimera metadata för WebP
    print("\n🔧 Uppdaterar metadata för WebP...")
    update_metadata_for_webp()
    
    # Slutstatistik
    total_time = time.time() - start_time
    
    print(f"\n" + "="*60)
    print("🎉 MARINA BYGGPROCESS SLUTFÖRD!")
    print(f"⏱️ Total tid: {total_time/60:.1f} minuter")
    print(f"🚀 System redo - starta med: npm run dev")
    print("="*60)
    
    return True

def update_metadata_for_webp():
    """
    Uppdatera alla metadata.json filer för att använda WebP-filer
    """
    metadata_files = [
        'public/data/current-images-mercator/metadata.json',
        'public/data/temperature-images-mercator/metadata.json',
        'public/data/salinity-images-mercator/metadata.json',
        'public/data/mackerel-probability-images-mercator/metadata.json'
    ]
    
    for metadata_file in metadata_files:
        path = Path(metadata_file)
        if path.exists():
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                
                # Uppdatera filenames från .png till .webp i images array
                if 'images' in metadata:
                    for image in metadata['images']:
                        if 'filename' in image and image['filename'].endswith('.png'):
                            image['filename'] = image['filename'].replace('.png', '.webp')
                
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2)
                
                print(f"   ✅ Uppdaterad: {metadata_file}")
                
            except Exception as e:
                print(f"   ⚠️ Kunde inte uppdatera {metadata_file}: {e}")

def main():
    parser = argparse.ArgumentParser(description='Master script för att bygga hela marina systemet')
    parser.add_argument('--quick', action='store_true',
                        help='Snabbt läge - bara senaste bilder')
    parser.add_argument('--force', action='store_true', 
                        help='Tvinga regenerering av alla filer')
    
    args = parser.parse_args()
    
    try:
        success = build_everything(
            quick_mode=args.quick,
            force_mode=args.force
        )
        
        if success:
            print("\n🎊 KLART! Kör 'npm run dev' för att starta appen.")
            sys.exit(0)
        else:
            print("\n💥 Byggprocessen misslyckades - kolla errors ovan")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n\n⏹️ Byggprocess avbruten av användare")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Oväntat fel: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main() 