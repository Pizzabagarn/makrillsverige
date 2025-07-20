#!/usr/bin/env python3
"""
Fixar timestamp-format i metadata.json filer
Konverterar "2025:07:19T12:00:00.000Z" till "2025-07-19T12:00:00.000Z"
"""

import json
from pathlib import Path

def fix_timestamps_in_metadata(metadata_file):
    """Fixa timestamp-format i en metadata-fil"""
    with open(metadata_file, 'r') as f:
        metadata = json.load(f)
    
    # Fixa timestamp-format i alla bilder
    for image in metadata.get('images', []):
        if 'timestamp' in image:
            # Konvertera kolontecken till bindestreck i datum
            timestamp = image['timestamp']
            if ':' in timestamp and timestamp.count(':') > 2:  # Mer än bara tid-kolonerna
                # Fixa datum-delen (första 10 tecknen)
                date_part = timestamp[:10].replace(':', '-')
                time_part = timestamp[10:]
                image['timestamp'] = date_part + time_part
    
    # Spara uppdaterad metadata
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✅ Fixad timestamp-format: {metadata_file}")

def main():
    """Fixa alla metadata-filer"""
    metadata_files = [
        'public/data/current-images-mercator/metadata.json',
        'public/data/temperature-images-mercator/metadata.json',
        'public/data/salinity-images-mercator/metadata.json',
        'public/data/mackerel-probability-images-mercator/metadata.json'
    ]
    
    for metadata_file in metadata_files:
        if Path(metadata_file).exists():
            fix_timestamps_in_metadata(metadata_file)
    
    print("\n🎉 Alla timestamp-format fixade!")

if __name__ == "__main__":
    main() 