#!/usr/bin/env python3
"""
Komprimerar alla makrill-värden JSON-filer till .gz format för GitHub deployment
Följer samma mönster som area-parameters-extended.json.gz
"""

import json
import gzip
import os
from pathlib import Path
import shutil

def compress_mackerel_values():
    """Komprimera alla JSON-filer i mackerel-values mappen"""
    
    # Sökväg till mackerel-values mappen
    values_dir = Path('public/data/mackerel-probability-images-mercator/mackerel-values')
    
    if not values_dir.exists():
        print(f"❌ Mappen finns inte: {values_dir}")
        return
    
    # Hitta alla JSON-filer
    json_files = list(values_dir.glob('*.json'))
    
    if not json_files:
        print("❌ Inga JSON-filer hittade")
        return
    
    print(f"🗜️ Komprimerar {len(json_files)} JSON-filer...")
    
    compressed_count = 0
    total_original_size = 0
    total_compressed_size = 0
    
    for json_file in json_files:
        try:
            # Läs JSON-filen
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Skapa komprimerad fil
            gz_file = json_file.with_suffix('.json.gz')
            
            # Komprimera med hög kompressionsnivå
            with gzip.open(gz_file, 'wt', encoding='utf-8', compresslevel=9) as f:
                json.dump(data, f, separators=(',', ':'))  # Kompakt JSON
            
            # Beräkna storlekar
            original_size = json_file.stat().st_size
            compressed_size = gz_file.stat().st_size
            compression_ratio = (1 - compressed_size / original_size) * 100
            
            total_original_size += original_size
            total_compressed_size += compressed_size
            
            print(f"  ✅ {json_file.name} → {gz_file.name}")
            print(f"      {original_size:,} → {compressed_size:,} bytes ({compression_ratio:.1f}% komprimering)")
            
            compressed_count += 1
            
        except Exception as e:
            print(f"  ❌ Fel vid komprimering av {json_file.name}: {e}")
    
    # Sammanfattning
    if compressed_count > 0:
        total_compression_ratio = (1 - total_compressed_size / total_original_size) * 100
        print(f"\n📊 Sammanfattning:")
        print(f"   📁 Filer komprimerade: {compressed_count}/{len(json_files)}")
        print(f"   📏 Total storlek: {total_original_size:,} → {total_compressed_size:,} bytes")
        print(f"   🗜️ Total komprimering: {total_compression_ratio:.1f}%")
        print(f"   💾 Sparade: {total_original_size - total_compressed_size:,} bytes")
        
        # Kontrollera om vi är under GitHub gränsen
        if total_compressed_size < 50 * 1024 * 1024:  # 50MB säkerhetsmarginal
            print(f"   ✅ Under GitHub gränsen (50MB säkerhetsmarginal)")
        else:
            print(f"   ⚠️ Fortfarande över 50MB - kan behöva ytterligare optimering")
    
    return compressed_count

def cleanup_original_files():
    """Ta bort original JSON-filer efter komprimering"""
    values_dir = Path('public/data/mackerel-probability-images-mercator/mackerel-values')
    json_files = list(values_dir.glob('*.json'))
    
    if not json_files:
        print("✅ Inga original JSON-filer att rensa")
        return
    
    print(f"\n🗑️ Rensar {len(json_files)} original JSON-filer...")
    
    for json_file in json_files:
        # Kontrollera att .gz filen finns innan vi tar bort originalet
        gz_file = json_file.with_suffix('.json.gz')
        if gz_file.exists():
            json_file.unlink()
            print(f"  ✅ Tog bort {json_file.name}")
        else:
            print(f"  ⚠️ Behöll {json_file.name} (ingen .gz fil hittad)")

def main():
    print("🗜️ MAKRILL-VÄRDEN KOMPRIMERING")
    print("=" * 40)
    print("Komprimerar JSON-filer för GitHub deployment")
    print("Följer samma mönster som area-parameters-extended.json.gz")
    print()
    
    # Kontrollera att vi är i rätt directory
    if not Path('public/data').exists():
        print("❌ Kör scriptet från projektets rot-directory")
        return
    
    # Komprimera filer
    compressed_count = compress_mackerel_values()
    
    if compressed_count > 0:
        # Fråga om vi ska rensa original filer
        response = input("\n🗑️ Vill du ta bort original JSON-filerna? (y/N): ")
        if response.lower() in ['y', 'yes']:
            cleanup_original_files()
            print("\n✅ Rensning klar!")
        else:
            print("\n💡 Du kan rensa manuellt senare med: rm public/data/mackerel-probability-images-mercator/mackerel-values/*.json")
    
    print("\n🏁 Komprimering klar!")
    print("Nu kan du commita .gz filerna till GitHub utan storleksproblem")

if __name__ == "__main__":
    main() 