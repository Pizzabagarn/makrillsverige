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

def run_command_with_timeout(cmd, description, cwd=None, shell=False, timeout_minutes=30):
    """
    Kör ett command med timeout och progress reporting
    """
    print(f"\n{'='*60}")
    print(f"🔧 {description}")
    print(f"💻 Kör: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    print(f"⏰ Timeout: {timeout_minutes} minuter")
    print('='*60)
    
    start_time = time.time()
    timeout_seconds = timeout_minutes * 60
    
    try:
        if shell:
            process = subprocess.Popen(cmd, shell=True, cwd=cwd, 
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, 
                                     text=True, bufsize=1, universal_newlines=True,
                                     encoding='utf-8', errors='replace')  # FIX: UTF-8 encoding
        else:
            process = subprocess.Popen(cmd, cwd=cwd,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, 
                                     text=True, bufsize=1, universal_newlines=True,
                                     encoding='utf-8', errors='replace')  # FIX: UTF-8 encoding
        
        # Live output med timeout check
        output_lines = []
        last_output_time = time.time()
        
        while True:
            # Check om process är klar
            poll = process.poll()
            if poll is not None:
                # Process färdig
                break
            
            # Check timeout
            current_time = time.time()
            elapsed = current_time - start_time
            
            if elapsed > timeout_seconds:
                print(f"\n⏰ TIMEOUT efter {timeout_minutes} minuter - terminerar process")
                process.terminate()
                try:
                    process.wait(timeout=5)  # Ge 5 sek för graceful shutdown
                except subprocess.TimeoutExpired:
                    print("💀 Forcerar termination...")
                    process.kill()
                return False
            
            # Läs output
            try:
                if process.stdout:
                    line = process.stdout.readline()
                    if line:
                        print(line.rstrip())
                        output_lines.append(line)
                        last_output_time = current_time
                    else:
                        # Ingen output, vänta lite
                        time.sleep(0.1)
                else:
                    time.sleep(0.1)
                    
                    # Check om det inte kommit output på länge
                    if current_time - last_output_time > 300:  # 5 min utan output
                        print(f"\n⚠️ Ingen output på 5 minuter - kanske hänger sig?")
                        print(f"💭 Fortfarande igång... ({elapsed/60:.1f} min av {timeout_minutes} min)")
                        last_output_time = current_time
                        
            except Exception as e:
                print(f"⚠️ Error reading output: {e}")
                break
        
        # Hämta resterande output
        remaining_output, _ = process.communicate()
        if remaining_output:
            print(remaining_output.rstrip())
        
        elapsed = time.time() - start_time
        
        if process.returncode == 0:
            print(f"✅ {description} slutfört på {elapsed:.1f}s")
            return True
        else:
            print(f"❌ {description} misslyckades (exit code {process.returncode})")
            return False
        
    except subprocess.TimeoutExpired:
        print(f"⏰ {description} timeout efter {timeout_minutes} minuter")
        return False
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ {description} fel efter {elapsed:.1f}s: {e}")
        return False

def cleanup_old_files():
    """
    Rensa gamla PNG-filer, .bak-filer och oanvända mappar
    """
    print("\n🗑️ Rensar gamla och oanvända filer...")
    
    # 1. Rensa gamla PNG-filer från aktiva mappar
    active_dirs = [
        'public/data/current-images-mercator',
        'public/data/temperature-images-mercator', 
        'public/data/salinity-images-mercator',
        'public/data/mackerel-probability-images-mercator'
    ]
    
    # 2. Oanvända mappar som ska tas bort helt
    unused_dirs = [
        'public/data/current-magnitude-images',  # Ersatt av current-images-mercator
        'public/data/temperature-images',        # Ersatt av temperature-images-mercator
        'public/data/salinity-images',          # Ersatt av salinity-images-mercator
        'public/data/current-magnitude-values', # Oanvänd
        'public/data/temperature-values'        # Oanvänd
    ]
    
    total_removed = 0
    
    # Rensa PNG från aktiva mappar
    for dir_path in active_dirs:
        path = Path(dir_path)
        if path.exists():
            png_files = list(path.glob('*.png'))
            bak_files = list(path.glob('*.bak'))
            
            for png_file in png_files:
                png_file.unlink()
                total_removed += 1
            
            for bak_file in bak_files:
                bak_file.unlink()
                total_removed += 1
            
            if png_files or bak_files:
                print(f"   🗑️ {len(png_files)} PNG + {len(bak_files)} .bak-filer från {dir_path}")
    
    # Ta bort hela oanvända mappar
    for unused_dir in unused_dirs:
        path = Path(unused_dir)
        if path.exists():
            import shutil
            shutil.rmtree(path)
            print(f"   🗑️ Oanvänd mapp borttagen: {unused_dir}")
            total_removed += 1
    
    # Rensa .bak-filer från rot-data-mappen
    data_path = Path('public/data')
    if data_path.exists():
        bak_files = list(data_path.glob('*.bak'))
        for bak_file in bak_files:
            bak_file.unlink()
            total_removed += 1
        if bak_files:
            print(f"   🗑️ {len(bak_files)} .bak-filer från huvudmappen")
    
    if total_removed > 0:
        print(f"✅ Totalt {total_removed} gamla/oanvända filer/mappar borttagna")
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
    
    # Check if node_modules exists
    node_modules_path = Path('node_modules')
    if not node_modules_path.exists():
        print("   ❌ node_modules saknas - kör 'npm install'")
        return False
    else:
        print("   ✅ node_modules installerade")
    
    # Check Python packages
    required_packages = [
        ('matplotlib', 'matplotlib'),
        ('numpy', 'numpy'), 
        ('scipy', 'scipy'),
        ('PIL', 'pillow'),  # Pillow importeras som PIL
        ('geojson', 'geojson'),
        ('shapely', 'shapely')
    ]
    missing_packages = []
    
    for import_name, package_name in required_packages:
        try:
            __import__(import_name)
            print(f"   ✅ Python paket: {package_name}")
        except ImportError:
            missing_packages.append(package_name)
            print(f"   ❌ Saknas: {package_name}")
    
    if missing_packages:
        print(f"\n❌ Installera saknade paket: pip install {' '.join(missing_packages)}")
        return False
    
    return True

def build_everything(parameter='all', resolution=1400, quality=85, quick_mode=None, force_mode=False):
    """
    Huvudfunktion som kör hela byggprocessen
    """
    start_time = time.time()
    
    print("🌊 MAKRILLSVERIGE - MASTER BYGGSCRIPT")
    print("="*60)
    print(f"📅 Startad: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🎯 Parameter: {parameter}")
    print(f"📐 Resolution: {resolution}x{resolution}")
    print(f"🎨 WebP Quality: {quality}/100 ({'Hög' if quality >= 85 else 'Måttlig' if quality >= 70 else 'Låg'} kvalitet)")
    print(f"⚡ Quick mode: {f'{quick_mode} senaste bilder' if quick_mode else 'Nej - alla bilder'}")
    print(f"💪 Force mode: {'Ja' if force_mode else 'Nej'}")
    
    # Steg 1: Kontrollera förutsättningar
    if not check_prerequisites():
        return False
    
    # Steg 2: Rensa gamla filer
    cleanup_old_files()
    
    # Steg 3: Hämta Area Parameters - INGEN GLOBAL TIMEOUT
    success = run_command(
        'npm run fetch:area-parameters',
        "Hämtar Area Parameters Data", 
        cwd=Path.cwd(),
        shell=True  # WINDOWS FIX - shell=True löser PATH-problem
    )
    if not success:
        print("❌ Area Parameters hämtning misslyckades - avbryter")
        return False
    
    
    # Steg 4: Generera Marina Bilder (WebP direkt)
    marine_cmd_parts = ['python', 'scripts/generate_marine_images_mercator.py']
    marine_cmd_parts.extend(['--parameter', parameter])
    marine_cmd_parts.extend(['--resolution', str(resolution)])
    marine_cmd_parts.extend(['--quality', str(quality)])
    
    if quick_mode:
        marine_cmd_parts.extend(['--quick', str(quick_mode)])
    if force_mode:
        marine_cmd_parts.append('--force')
    
    # Bygg shell-kommando för Windows-kompatibilitet
    marine_cmd = ' '.join(marine_cmd_parts)
    
    success = run_command(
        marine_cmd,
        "Genererar Marina Bilder (WebP)",
        cwd=Path.cwd(),
        shell=True  # WINDOWS FIX
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
    parser.add_argument('--parameter', choices=['current', 'temperature', 'salinity', 'mackerel', 'all'],
                        default='all', help='Vilket lager att generera (default: all)')
    parser.add_argument('--resolution', type=int, default=1400,
                        help='Grid-upplösning (default: 1400)')
    parser.add_argument('--quality', type=int, default=85,
                        help='WebP-kvalitet (default: 85)')
    parser.add_argument('--quick', type=int, default=None,
                        help='Snabbt läge - bara de senaste N bilderna (ex: --quick 24)')
    parser.add_argument('--force', action='store_true', 
                        help='Tvinga regenerering av alla filer')
    
    args = parser.parse_args()
    
    try:
        success = build_everything(
            parameter=args.parameter,
            resolution=args.resolution,
            quality=args.quality,
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