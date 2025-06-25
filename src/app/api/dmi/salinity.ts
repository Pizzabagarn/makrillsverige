import { dmiFetch } from './apiClient';

export interface SalinityData {
  lat: number;
  lon: number;
  salinity: number;
  time: string;
}

/**
 * Hämta salthalt från DMI DKSS EDR API
 * Enligt specifikationen är salthalt kritisk för makrillens beteende (optimalt ~30-35 psu)
 */
export async function fetchSalinityGrid(
  bbox: string = '10.5,54.5,14.5,58.5', // Utökat: Hela västkusten + Kattegatt + Skagerrak + Öresund + Sydkust
  depth: string = 'surface' // Standarddjup är ytan
): Promise<SalinityData[]> {
  try {
    const params = {
      bbox,
      'crs': 'crs84',
      'parameter-name': depth === 'surface' ? 'salinity' : `salinity-${depth.replace('m', '')}m`,
      'f': 'GeoJSON'
    };

    const data = await dmiFetch('collections/dkss_idw/cube', params);
    
    // Parse GeoJSON format (since we request f=GeoJSON)
    return parseGeoJSONToSalinity(data);
  } catch (error) {
    console.error('Failed to fetch salinity data:', error);
    throw error;
  }
}

/**
 * Konvertera GeoJSON från DMI till vårt SalinityData format
 */
function parseGeoJSONToSalinity(geoData: any): SalinityData[] {
  const result: SalinityData[] = [];
  
  if (!geoData || geoData.type !== 'FeatureCollection' || !Array.isArray(geoData.features)) {
    console.warn('Invalid GeoJSON structure:', geoData);
    return result;
  }

  geoData.features.forEach((feature: any) => {
    if (!feature.geometry || !feature.properties || feature.geometry.type !== 'Point') {
      return;
    }
    
    const [lon, lat] = feature.geometry.coordinates;
    const properties = feature.properties;
    
    // Look for salinity in properties
    const salinityKeys = Object.keys(properties).filter(key => 
      key.includes('salinity') || key.includes('salt')
    );
    
    if (salinityKeys.length === 0) {
      return;
    }
    
    const salinity = properties[salinityKeys[0]];
    const time = properties.step || properties.time || new Date().toISOString();
    
    if (salinity != null && !isNaN(salinity)) {
      result.push({
        lat,
        lon,
        salinity,
        time
      });
    }
  });

  return result;
}

/**
 * Konvertera CoverageJSON från DMI till vårt SalinityData format (fallback)
 */
function parseCoverageJSONToSalinity(coverageData: any): SalinityData[] {
  const result: SalinityData[] = [];
  
  if (!coverageData.domain || !coverageData.ranges) {
    console.warn('Invalid CoverageJSON structure');
    return result;
  }

  const { domain, ranges } = coverageData;
  const lats = domain.axes?.y?.values || [];
  const lons = domain.axes?.x?.values || [];
  const times = domain.axes?.t?.values || [];
  
  // Look for salinity data in ranges
  const salinityKeys = Object.keys(ranges).filter(key => 
    key.includes('salinity') || key.includes('salt')
  );
  
  if (salinityKeys.length === 0) {
    console.warn('No salinity data found in ranges:', Object.keys(ranges));
    return result;
  }
  
  const salinityValues = ranges[salinityKeys[0]]?.values || [];

  let valueIndex = 0;
  for (let timeIdx = 0; timeIdx < times.length; timeIdx++) {
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const salinity = salinityValues[valueIndex];
        if (salinity != null && !isNaN(salinity)) {
          result.push({
            lat: lats[latIdx],
            lon: lons[lonIdx],
            salinity,
            time: times[timeIdx]
          });
        }
        valueIndex++;
      }
    }
  }

  return result;
}
