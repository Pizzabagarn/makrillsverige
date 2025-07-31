import { NextResponse } from 'next/server';

// Mapping av våra väderparametrar till HARMONIE API (cube format)
const WEATHER_PARAMETERS = {
  'temperature': 'temperature-2m',           // 2 metre temperature
  'precipitation': 'total-precipitation',    // Total precipitation
  'windSpeed': 'wind-speed-10m',            // 10 metre wind speed
  'windDirection': 'wind-direction-10m',    // 10 metre wind direction
  'windGust': 'wind-gust-10m',              // Wind speed (gust)
  'cloudCover': 'cloud-cover',              // Fraction of cloud cover
  'pressure': 'surface-air-pressure'       // Pressure at surface
};

const ALL_PARAMETERS = Object.values(WEATHER_PARAMETERS).join(',');

interface WeatherRequest {
  location?: string;
  lat?: number;
  lon?: number;
  bbox?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const location = url.searchParams.get('location');
  
  // Använd specificerad bbox eller standard svenska västkusten
  const defaultBbox = '2.970702,54.824871,26.613280,70';
  
  try {
    let weatherData;
    
    if (lat && lon) {
      // Punktspecifik väderdata
      weatherData = await fetchPointWeather(parseFloat(lat), parseFloat(lon));
    } else {
      // Grid-data för hela området
      weatherData = await fetchGridWeather(defaultBbox);
    }
    
    return NextResponse.json({
      success: true,
      data: weatherData,
      metadata: {
        source: 'DMI HARMONIE',
        parameters: Object.keys(WEATHER_PARAMETERS),
        fetchedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Weather API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch weather data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function fetchPointWeather(lat: number, lon: number) {
  const apiKey = process.env.DMI_API_KEY;
  if (!apiKey) {
    throw new Error('DMI API key not configured');
  }

  // Skapa tidsspann - samma som fetchAreaParametersExtended (nu till 5 dagar framåt)
  const now = new Date();
  const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 dagar
  const startTime = now.toISOString().split('.')[0] + 'Z';
  const endTime = future.toISOString().split('.')[0] + 'Z';

  const apiUrl = new URL('https://dmigw.govcloud.dk/v1/forecastedr/collections/harmonie_dini_sf/position');
  apiUrl.searchParams.set('coords', `POINT(${lon} ${lat})`);
  apiUrl.searchParams.set('crs', 'crs84');
  apiUrl.searchParams.set('parameter-name', ALL_PARAMETERS);
  apiUrl.searchParams.set('datetime', `${startTime}/${endTime}`);
  apiUrl.searchParams.set('format', 'CoverageJSON');
  apiUrl.searchParams.set('api-key', apiKey);

  const response = await fetch(apiUrl.toString(), {
    headers: {
      'User-Agent': 'Makrill Sverige Weather Service'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DMI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return processWeatherData(data, 'point');
}

async function fetchGridWeather(bbox: string) {
  const apiKey = process.env.DMI_API_KEY;
  if (!apiKey) {
    throw new Error('DMI API key not configured');
  }

  // Samma tidsspann som punkt-data
  const now = new Date();
  const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const startTime = now.toISOString().split('.')[0] + 'Z';
  const endTime = future.toISOString().split('.')[0] + 'Z';

  const apiUrl = new URL('https://dmigw.govcloud.dk/v1/forecastedr/collections/harmonie_dini_sf/cube');
  apiUrl.searchParams.set('bbox', bbox);
  apiUrl.searchParams.set('crs', 'native');
  apiUrl.searchParams.set('parameter-name', ALL_PARAMETERS);
  apiUrl.searchParams.set('datetime', `${startTime}/${endTime}`);
  apiUrl.searchParams.set('format', 'CoverageJSON');
  apiUrl.searchParams.set('api-key', apiKey);

  const response = await fetch(apiUrl.toString(), {
    headers: {
      'User-Agent': 'Makrill Sverige Weather Service'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DMI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return processWeatherData(data, 'grid');
}

function processWeatherData(coverageData: any, type: 'point' | 'grid') {
  if (!coverageData || !coverageData.domain || !coverageData.ranges) {
    throw new Error('Invalid CoverageJSON structure');
  }

  // Extrahera tidsstämplar
  const times: string[] = coverageData.domain.axes?.t?.values || [];
  if (times.length === 0) {
    throw new Error('No timestamps found in weather data');
  }

  const processedData = {
    timestamps: times,
    type,
    forecasts: [] as any[]
  };

  if (type === 'point') {
    // Bearbeta punktdata
    for (let i = 0; i < times.length; i++) {
      const forecast: any = {
        time: times[i],
        temperature: getParameterValue(coverageData, 'temperature-2m', i),
        precipitation: getParameterValue(coverageData, 'total-precipitation', i),
        windSpeed: getParameterValue(coverageData, 'wind-speed-10m', i),
        windDirection: getParameterValue(coverageData, 'wind-direction-10m', i),
        windGust: getParameterValue(coverageData, 'wind-gust-10m', i),
        cloudCover: getParameterValue(coverageData, 'cloud-cover', i),
        pressure: getParameterValue(coverageData, 'surface-air-pressure', i)
      };

      // Konvertera enheter
      if (forecast.temperature !== null) {
        forecast.temperature = Math.round((forecast.temperature - 273.15) * 10) / 10; // K till °C
      }
      if (forecast.precipitation !== null) {
        forecast.precipitation = Math.round(forecast.precipitation * 100) / 100; // mm
      }
      if (forecast.windSpeed !== null) {
        forecast.windSpeed = Math.round(forecast.windSpeed * 10) / 10; // m/s
      }
      if (forecast.windDirection !== null) {
        forecast.windDirection = Math.round(forecast.windDirection); // grader
      }
      if (forecast.windGust !== null) {
        forecast.windGust = Math.round(forecast.windGust * 10) / 10; // m/s
      }
      if (forecast.cloudCover !== null) {
        forecast.cloudCover = Math.round(forecast.cloudCover * 100); // procent
      }
      if (forecast.pressure !== null) {
        forecast.pressure = Math.round(forecast.pressure / 100); // Pa till hPa
      }

      processedData.forecasts.push(forecast);
    }
  } else {
    // Grid-data - returnera rå data för nu, kan utökas senare
    processedData.forecasts = [{ message: 'Grid data processing not implemented yet' }];
  }

  return processedData;
}

function getParameterValue(data: any, paramName: string, timeIndex: number): number | null {
  try {
    const parameterData = data.ranges[paramName];
    if (!parameterData || !parameterData.values) {
      return null;
    }
    
    const value = parameterData.values[timeIndex];
    return value !== null && value !== undefined ? value : null;
  } catch (error) {
    return null;
  }
} 