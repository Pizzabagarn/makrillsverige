#!/usr/bin/env python3
"""
List all available files in SMHI SVAR directory
Parse the HTML directory listing to see what's actually available
"""

import requests
import re

SMHI_BASE_URL = "https://opendata-download.smhi.se/svar/"

def list_smhi_files():
    """List all files available in SMHI SVAR directory"""
    
    print("🇸🇪 LISTING ALL SMHI SVAR FILES")
    print("="*60)
    
    try:
        response = requests.get(SMHI_BASE_URL, timeout=15)
        response.raise_for_status()
        
        print(f"✅ Successfully connected to {SMHI_BASE_URL}")
        print(f"   Response size: {len(response.text)} characters")
        
        # Parse HTML using regex 
        # Try multiple patterns for Apache directory listing
        
        # Pattern 1: Full Apache format with date and size
        full_pattern = r'<a href="([^"]+)">([^<]+)</a>\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+([0-9.]+[KMG]?)'
        full_matches = re.findall(full_pattern, response.text)
        
        # Pattern 2: Simpler format - just links
        link_pattern = r'<a href="([^"]+)">([^<]+)</a>'
        link_matches = re.findall(link_pattern, response.text)
        
        final_files = []
        
        # Try full matches first
        if full_matches:
            for href, name, date, size in full_matches:
                if not href.startswith('?') and href != '/' and not href.startswith('['):
                    final_files.append({
                        'name': name.strip(),
                        'href': href,
                        'date': date,
                        'size': size
                    })
        else:
            # Fallback to simple link matches
            for href, name in link_matches:
                if not href.startswith('?') and href != '/' and not name.startswith('['):
                    final_files.append({
                        'name': name.strip(),
                        'href': href,
                        'date': 'Unknown',
                        'size': 'Unknown'
                    })
        
        if not final_files:
            print("❌ No files found in directory listing")
            print("\nRaw HTML (first 2000 chars):")
            print(response.text[:2000])
            return []
        
        print(f"\n📁 Found {len(final_files)} files in SVAR directory:")
        print("="*80)
        
        # Group files by type
        water_files = []
        other_files = []
        
        for file_info in final_files:
            name = file_info['name']
            size = file_info.get('size', 'Unknown')
            date = file_info.get('date', 'Unknown')
            
            # Check if this looks like water body data
            is_water = any(keyword in name.lower() for keyword in [
                'vatten', 'sjo', 'river', 'lake', 'forekomst', 'hydro'
            ])
            
            file_entry = {
                'name': name,
                'size': size,
                'date': date,
                'is_water': is_water
            }
            
            if is_water:
                water_files.append(file_entry)
            else:
                other_files.append(file_entry)
        
        # Show water-related files first
        if water_files:
            print("\n🌊 WATER-RELATED FILES:")
            print("-" * 80)
            for f in water_files:
                print(f"   ✅ {f['name']:<40} | {f['size']:<8} | {f['date']}")
        
        print(f"\n📋 ALL FILES:")
        print("-" * 80)
        for f in final_files:
            icon = "🌊" if f.get('is_water', False) else "📄"
            print(f"   {icon} {f['name']:<40} | {f.get('size', 'Unknown'):<8} | {f.get('date', 'Unknown')}")
        
        # Look for patterns that might be our water data
        print(f"\n🔍 ANALYSIS:")
        print("-" * 40)
        
        svar_files = [f for f in final_files if 'SVAR' in f['name']]
        zip_files = [f for f in final_files if f['name'].endswith('.zip')]
        
        print(f"   Files with 'SVAR': {len(svar_files)}")
        print(f"   ZIP files: {len(zip_files)}")
        
        if svar_files:
            print(f"\n   SVAR files found:")
            for f in svar_files:
                print(f"      - {f['name']}")
        
        # Check if any files might be our water bodies
        potential_water = []
        for f in final_files:
            name_lower = f['name'].lower()
            if any(keyword in name_lower for keyword in ['vatten', 'sjo', 'forekomst', 'water']):
                potential_water.append(f['name'])
        
        if potential_water:
            print(f"\n   Potential water body files:")
            for name in potential_water:
                print(f"      - {name}")
        else:
            print(f"\n   ⚠️ No obvious water body files found")
            print(f"   The data might be in a different format or location")
        
        return final_files
        
    except Exception as e:
        print(f"❌ Error listing files: {e}")
        import traceback
        traceback.print_exc()
        return []

def check_specific_file(filename):
    """Check if a specific file exists and get its details"""
    
    url = f"{SMHI_BASE_URL}{filename}"
    try:
        response = requests.head(url, timeout=10)
        if response.status_code == 200:
            size = response.headers.get('content-length', 'Unknown')
            print(f"✅ {filename} exists (size: {size} bytes)")
            return True
        else:
            print(f"❌ {filename} not found (status: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ {filename} error: {e}")
        return False

def main():
    """Main function"""
    
    files = list_smhi_files()
    
    if files:
        print(f"\n🎯 RECOMMENDATIONS:")
        print("-" * 40)
        
        # Look for any file that might contain water body data
        recommendations = []
        
        for f in files:
            name = f['name'].lower()
            if 'svar' in name and 'zip' in name:
                recommendations.append(f['name'])
        
        if recommendations:
            print(f"   Try downloading these files:")
            for rec in recommendations:
                print(f"      - {rec}")
        else:
            print(f"   No obvious water body files found")
            print(f"   You might need to:")
            print(f"      1. Check SMHI's documentation for current file names")
            print(f"      2. Contact SMHI for access to water body data")
            print(f"      3. Look for alternative data sources")
    
    print(f"\n✅ File listing complete!")

if __name__ == "__main__":
    main()