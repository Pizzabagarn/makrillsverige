export interface LayerOffset {
  lat_offset: number;
  lon_offset: number;
  region: string;
}

// Detaljerade regionspecifika offset-värden för svenska vatten
const REGIONAL_OFFSETS: Array<{
  name: string;
  bounds: {
    lon_min: number;
    lon_max: number;
    lat_min: number;
    lat_max: number;
  };
  offset: LayerOffset;
}> = [
  // SKAGERRAK & KATTEGATT
  {
    name: 'Skagerrak_Väst',
    bounds: { lon_min: 10.3, lon_max: 11.5, lat_min: 57.5, lat_max: 59.0 },
    offset: { lat_offset: -0.055, lon_offset: -0.008, region: 'Skagerrak_Väst' }
  },
  {
    name: 'Skagerrak_Öst',
    bounds: { lon_min: 11.5, lon_max: 12.5, lat_min: 57.5, lat_max: 59.0 },
    offset: { lat_offset: -0.053, lon_offset: -0.005, region: 'Skagerrak_Öst' }
  },
  {
    name: 'Kattegatt_Nord',
    bounds: { lon_min: 11.0, lon_max: 12.8, lat_min: 56.5, lat_max: 57.5 },
    offset: { lat_offset: -0.052, lon_offset: -0.003, region: 'Kattegatt_Nord' }
  },
  {
    name: 'Kattegatt_Syd',
    bounds: { lon_min: 11.5, lon_max: 13.0, lat_min: 55.5, lat_max: 56.5 },
    offset: { lat_offset: -0.050, lon_offset: -0.001, region: 'Kattegatt_Syd' }
  },

  // ÖRESUND & SKÅNE
  {
    name: 'Öresund_Nord',
    bounds: { lon_min: 12.5, lon_max: 13.2, lat_min: 55.8, lat_max: 56.3 },
    offset: { lat_offset: -0.049, lon_offset: 0.001, region: 'Öresund_Nord' }
  },
  {
    name: 'Öresund_Syd',
    bounds: { lon_min: 12.8, lon_max: 13.1, lat_min: 55.4, lat_max: 55.8 },
    offset: { lat_offset: -0.052, lon_offset: 0.000, region: 'Öresund_Syd' }
  },
  {
    name: 'Skåne_Sydkust',
    bounds: { lon_min: 13.0, lon_max: 14.5, lat_min: 54.9, lat_max: 55.6 },
    offset: { lat_offset: -0.048, lon_offset: 0.002, region: 'Skåne_Sydkust' }
  },

  // ÖSTERSJÖN - SÖDRA DELEN
  {
    name: 'Östersjön_Sydväst',
    bounds: { lon_min: 13.5, lon_max: 15.0, lat_min: 55.0, lat_max: 56.5 },
    offset: { lat_offset: -0.051, lon_offset: 0.003, region: 'Östersjön_Sydväst' }
  },
  {
    name: 'Östersjön_Bornholm',
    bounds: { lon_min: 14.5, lon_max: 16.0, lat_min: 55.0, lat_max: 56.0 },
    offset: { lat_offset: -0.047, lon_offset: 0.005, region: 'Östersjön_Bornholm' }
  },
  {
    name: 'Hanöbukten',
    bounds: { lon_min: 13.8, lon_max: 15.2, lat_min: 55.8, lat_max: 56.5 },
    offset: { lat_offset: -0.050, lon_offset: 0.004, region: 'Hanöbukten' }
  },

  // BLEKINGE & SMÅLAND KUST
  {
    name: 'Blekinge_Kust',
    bounds: { lon_min: 14.0, lon_max: 16.0, lat_min: 56.0, lat_max: 56.8 },
    offset: { lat_offset: -0.049, lon_offset: 0.006, region: 'Blekinge_Kust' }
  },
  {
    name: 'Kalmar_Sund',
    bounds: { lon_min: 15.8, lon_max: 16.6, lat_min: 56.5, lat_max: 57.8 },
    offset: { lat_offset: -0.048, lon_offset: 0.008, region: 'Kalmar_Sund' }
  },

  // GOTLAND OMRÅDET
  {
    name: 'Gotland_Väst',
    bounds: { lon_min: 17.5, lon_max: 18.5, lat_min: 56.8, lat_max: 57.8 },
    offset: { lat_offset: -0.045, lon_offset: 0.012, region: 'Gotland_Väst' }
  },
  {
    name: 'Gotland_Öst',
    bounds: { lon_min: 18.5, lon_max: 19.5, lat_min: 56.8, lat_max: 57.8 },
    offset: { lat_offset: -0.043, lon_offset: 0.015, region: 'Gotland_Öst' }
  },

  // STOCKHOLM SKÄRGÅRD
  {
    name: 'Stockholm_Inre_Skärgård',
    bounds: { lon_min: 18.0, lon_max: 19.0, lat_min: 59.0, lat_max: 59.6 },
    offset: { lat_offset: -0.046, lon_offset: 0.010, region: 'Stockholm_Inre_Skärgård' }
  },
  {
    name: 'Stockholm_Yttre_Skärgård',
    bounds: { lon_min: 18.5, lon_max: 19.5, lat_min: 58.8, lat_max: 59.2 },
    offset: { lat_offset: -0.044, lon_offset: 0.012, region: 'Stockholm_Yttre_Skärgård' }
  },
  {
    name: 'Södermanland_Kust',
    bounds: { lon_min: 16.5, lon_max: 18.0, lat_min: 58.5, lat_max: 59.3 },
    offset: { lat_offset: -0.047, lon_offset: 0.008, region: 'Södermanland_Kust' }
  },

  // UPPLAND & GÄVLEBORG
  {
    name: 'Uppland_Kust',
    bounds: { lon_min: 17.0, lon_max: 18.5, lat_min: 59.3, lat_max: 60.2 },
    offset: { lat_offset: -0.045, lon_offset: 0.009, region: 'Uppland_Kust' }
  },
  {
    name: 'Gävleborg_Syd',
    bounds: { lon_min: 16.5, lon_max: 18.0, lat_min: 60.0, lat_max: 61.0 },
    offset: { lat_offset: -0.043, lon_offset: 0.007, region: 'Gävleborg_Syd' }
  },

  // BOTTENVIKEN
  {
    name: 'Bottenhavet_Syd',
    bounds: { lon_min: 17.0, lon_max: 19.0, lat_min: 60.5, lat_max: 61.5 },
    offset: { lat_offset: -0.042, lon_offset: 0.008, region: 'Bottenhavet_Syd' }
  },
  {
    name: 'Bottenhavet_Nord',
    bounds: { lon_min: 17.5, lon_max: 19.5, lat_min: 61.5, lat_max: 62.5 },
    offset: { lat_offset: -0.040, lon_offset: 0.010, region: 'Bottenhavet_Nord' }
  },
  {
    name: 'Bottenviken_Syd',
    bounds: { lon_min: 18.0, lon_max: 20.0, lat_min: 62.5, lat_max: 63.5 },
    offset: { lat_offset: -0.038, lon_offset: 0.012, region: 'Bottenviken_Syd' }
  },
  {
    name: 'Bottenviken_Nord',
    bounds: { lon_min: 18.5, lon_max: 20.5, lat_min: 63.5, lat_max: 65.0 },
    offset: { lat_offset: -0.035, lon_offset: 0.015, region: 'Bottenviken_Nord' }
  },

  // VÄSTKUSTEN - MELLERSTA DELEN
  {
    name: 'Västkusten_Göteborg',
    bounds: { lon_min: 11.5, lon_max: 12.5, lat_min: 57.5, lat_max: 58.2 },
    offset: { lat_offset: -0.054, lon_offset: -0.004, region: 'Västkusten_Göteborg' }
  },
  {
    name: 'Västkusten_Halland',
    bounds: { lon_min: 12.0, lon_max: 13.0, lat_min: 56.0, lat_max: 57.0 },
    offset: { lat_offset: -0.053, lon_offset: -0.002, region: 'Västkusten_Halland' }
  },

  // DEFAULT FALLBACK - MITT I ÖSTERSJÖN
  {
    name: 'Default_Östersjön',
    bounds: { lon_min: 10.3, lon_max: 16.6, lat_min: 54.9, lat_max: 59.6 },
    offset: { lat_offset: -0.052, lon_offset: 0.000, region: 'Default_Östersjön' }
  }
];

/**
 * Hitta bästa offset för en geografisk position
 * Returnerar det mest specifika område som matchar positionen
 */
export function getLayerOffset(lon: number, lat: number): LayerOffset {
  // Hitta alla områden som innehåller positionen
  const matchingRegions = REGIONAL_OFFSETS.filter(region => {
    const { bounds } = region;
    return (
      lon >= bounds.lon_min &&
      lon <= bounds.lon_max &&
      lat >= bounds.lat_min &&
      lat <= bounds.lat_max
    );
  });

  if (matchingRegions.length === 0) {
    // Fallback till default
    return REGIONAL_OFFSETS[REGIONAL_OFFSETS.length - 1].offset;
  }

  // Välj det mest specifika området (minsta area)
  const bestMatch = matchingRegions.reduce((best, current) => {
    const bestArea = (best.bounds.lon_max - best.bounds.lon_min) * 
                     (best.bounds.lat_max - best.bounds.lat_min);
    const currentArea = (current.bounds.lon_max - current.bounds.lon_min) * 
                        (current.bounds.lat_max - current.bounds.lat_min);
    
    return currentArea < bestArea ? current : best;
  });

  return bestMatch.offset;
}

/**
 * Beräkna offset för en hel bbox genom att använda centrum-punkten
 */
export function getLayerOffsetForBbox(
  lon_min: number, 
  lon_max: number, 
  lat_min: number, 
  lat_max: number
): LayerOffset {
  const centerLon = (lon_min + lon_max) / 2;
  const centerLat = (lat_min + lat_max) / 2;
  
  return getLayerOffset(centerLon, centerLat);
}

/**
 * Debug-funktion för att lista alla definierade regioner
 */
export function listAllRegions(): Array<{name: string; bounds: any; offset: LayerOffset}> {
  return REGIONAL_OFFSETS.map(region => ({
    name: region.name,
    bounds: region.bounds,
    offset: region.offset
  }));
}

/**
 * Hitta vilken region en specifik position tillhör
 */
export function getRegionForPosition(lon: number, lat: number): string {
  const offset = getLayerOffset(lon, lat);
  return offset.region;
} 