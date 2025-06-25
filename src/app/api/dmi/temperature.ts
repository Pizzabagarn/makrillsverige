import { dmiFetch } from './apiClient';

export interface TemperatureData {
  lat: number;
  lon: number;
  temperature: number;
  time: string;
}

/**
 * Hämta vattentemperatur från DMI DKSS EDR API
 * Enligt specifikationen används dkss_idw för Öresund med hög upplösning (~0.5 nautisk mil)
 */
export async function fetchTemperatureGrid(
  bbox: string = '10.5,54.5,14.5,58.5', // Utökat: Hela västkusten + Kattegatt + Skagerrak + Öresund + Sydkust
  depth: string = 'surface' // Standarddjup är ytan
): Promise<TemperatureData[]> {
  try {
    const params = {
      bbox,
      'crs': 'crs84',
      'parameter-name': depth === 'surface' ? 'water-temperature' : `water-temperature-${depth.replace('m', '')}m`,
      'f': 'GeoJSON'
    };

    const data = await dmiFetch('collections/dkss_idw/cube', params);
    
    // Parse GeoJSON format (since we request f=GeoJSON)
    return parseGeoJSONToTemperature(data);
  } catch (error) {
    console.error('Failed to fetch temperature data:', error);
    throw error;
  }
}

/**
 * Konvertera GeoJSON från DMI till vårt TemperatureData format
 */
function parseGeoJSONToTemperature(geoData: any): TemperatureData[] {
  const result: TemperatureData[] = [];
  
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
    
    // Look for temperature in properties - could be 'water-temperature' or other variants
    const temperatureKeys = Object.keys(properties).filter(key => 
      key.includes('temperature') || key.includes('temp')
    );
    
    if (temperatureKeys.length === 0) {
      return;
    }
    
    const temperature = properties[temperatureKeys[0]];
    const time = properties.step || properties.time || new Date().toISOString();
    
    if (temperature != null && !isNaN(temperature)) {
      result.push({
        lat,
        lon,
        temperature,
        time
      });
    }
  });

  return result;
}

/**
 * Konvertera CoverageJSON från DMI till vårt TemperatureData format (fallback)
 * Enligt specifikationen innehåller CoverageJSON koordinater, tidssteg och värdematriser
 */
function parseCoverageJSONToTemperature(coverageData: any): TemperatureData[] {
  const result: TemperatureData[] = [];
  
  if (!coverageData.domain || !coverageData.ranges) {
    console.warn('Invalid CoverageJSON structure');
    return result;
  }

  const { domain, ranges } = coverageData;
  const lats = domain.axes?.y?.values || [];
  const lons = domain.axes?.x?.values || [];
  const times = domain.axes?.t?.values || [];
  
  // Look for temperature data in ranges - could be various keys
  const temperatureKeys = Object.keys(ranges).filter(key => 
    key.includes('temperature') || key.includes('temp')
  );
  
  if (temperatureKeys.length === 0) {
    console.warn('No temperature data found in ranges:', Object.keys(ranges));
    return result;
  }
  
  const tempValues = ranges[temperatureKeys[0]]?.values || [];

  // Iterera över rutnätet enligt specifikationens exempel
  let valueIndex = 0;
  for (let timeIdx = 0; timeIdx < times.length; timeIdx++) {
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const temperature = tempValues[valueIndex];
        if (temperature != null && !isNaN(temperature)) {
          result.push({
            lat: lats[latIdx],
            lon: lons[lonIdx],
            temperature,
            time: times[timeIdx]
          });
        }
        valueIndex++;
      }
    }
  }

  return result;
}
