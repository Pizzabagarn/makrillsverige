'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, ArrowLeft, Wind, Thermometer, Droplets, MapPin, Loader2, 
  Compass, ChevronRight, Calendar, Navigation, ArrowUp, Zap, Eye, Sunrise, Sunset,
  ChevronDown, X
} from 'lucide-react';
import Link from 'next/link';
import { weatherGeocodingService, type GeoLocation } from '@/lib/weatherGeocodingService';
import WeatherAttribution from '@/app/components/WeatherAttribution';
import { searchWaterBodies, type WaterBody } from '@/lib/swedishWaterBodies';

interface WeatherData {
  time: string;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  cloudCover: number | null;
  pressure: number | null;
  humidity: number | null;
  dewpoint: number | null;
  symbol: string | null;  // YR weather symbol - was missing!
}

interface DailyWeather {
  date: string;
  day: string;
  maxTemp: number;
  minTemp: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
  cloudCover: number;
  avgPressure: number | null;
  avgHumidity: number | null;
  icon: string;  // Keep for backward compatibility, but we'll use YR symbols instead
  primarySymbol: string | null;  // YR weather symbol for the day
  hourlyData: WeatherData[];
}

export default function WeatherPage() {
  // Optimerad lösning: Använd live API direkt för snabb laddning
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<GeoLocation[]>([]);
  const [waterResults, setWaterResults] = useState<WaterBody[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GeoLocation | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  
  // Ny state för keyboard navigation
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
  const [isDropdownFocused, setIsDropdownFocused] = useState(false);
  
  // Refs för click outside och keyboard navigation
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const router = useRouter();

  // Optimerad laddning: Inga stora filer behövs
  const [isSystemReady, setIsSystemReady] = useState(false);

  // Snabb systeminitialisering - inga stora filer att ladda
  useEffect(() => {
    // Sätt systemet som redo omedelbart
    setIsSystemReady(true);
  }, []);

  // Automatisk geolokalisering vid sidstart
  useEffect(() => {
    const getCurrentLocation = async () => {
      if (!navigator.geolocation) {
        setIsLoadingLocation(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
  
          
          // Hitta närmaste platsnamn via geocoding
          try {
            const { geocodingService } = await import('@/lib/geocodingService');
            const result = await geocodingService.getPlaceName(latitude, longitude);
            
            const displayName = result.placeName 
              ? result.placeName 
              : `Position ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
            
            
            await fetchWeatherData({
              lat: latitude,
              lon: longitude,
              displayName: displayName
            });
          } catch (error) {
            console.warn('Geocoding failed, using coordinates:', error);
            // Fallback: använd koordinater
            await fetchWeatherData({
              lat: latitude,
              lon: longitude,
              displayName: `Position ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
            });
          }
          setIsLoadingLocation(false);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          setIsLoadingLocation(false);
        },
        { timeout: 10000, enableHighAccuracy: false }
      );
    };

    // Starta geolokalisering när systemet är redo
    if (isSystemReady) {
      getCurrentLocation();
    }
  }, [isSystemReady]);

  // Förbättrad click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setSelectedResultIndex(-1);
        setIsDropdownFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showSuggestions || searchResults.length === 0) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedResultIndex(prev => 
            prev < searchResults.length - 1 ? prev + 1 : 0
          );
          setIsDropdownFocused(true);
          break;
          
        case 'ArrowUp':
          event.preventDefault();
          setSelectedResultIndex(prev => 
            prev > 0 ? prev - 1 : searchResults.length - 1
          );
          setIsDropdownFocused(true);
          break;
          
        case 'Enter':
          event.preventDefault();
          if (selectedResultIndex >= 0 && selectedResultIndex < searchResults.length) {
            handleLocationSelect(searchResults[selectedResultIndex]);
          }
          break;
          
        case 'Escape':
          event.preventDefault();
          setShowSuggestions(false);
          setSelectedResultIndex(-1);
          setIsDropdownFocused(false);
          inputRef.current?.blur();
          break;
      }
    };

    if (showSuggestions) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showSuggestions, searchResults, selectedResultIndex]);

  // Sök platser när användaren skriver (förbättrad debouncing)
  useEffect(() => {
      if (searchTerm.length < 2) {
      setSearchResults([]);
      setWaterResults([]);
      setShowSuggestions(false);
      setSelectedResultIndex(-1);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      setSelectedResultIndex(-1);
      try {
        // Sök både platser och vattendrag parallellt
        const [geoResult, waterBodies] = await Promise.all([
          weatherGeocodingService.searchLocations(searchTerm),
          Promise.resolve(searchWaterBodies(searchTerm))
        ]);
        
        setSearchResults(geoResult.locations || []);
        setWaterResults(waterBodies);
        setShowSuggestions((geoResult.locations?.length > 0) || waterBodies.length > 0);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
        setWaterResults([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchTerm]);

  // Optimerad väderdata-hämtning: Direkt live API för snabb respons
  const fetchWeatherData = async (location: GeoLocation) => {
    setIsLoadingWeather(true);
    setSelectedDay(null);
    
    try {
      console.log(`🌤️ Hämtar väderdata för ${location.displayName} (${location.lat}, ${location.lon})`);
      
      const response = await fetch(`/api/weather?lat=${location.lat}&lon=${location.lon}`);
      
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }
      
      const apiData = await response.json();
      
      if (apiData.success && apiData.data.forecasts) {

        
        setWeatherData(apiData.data.forecasts);
        setSelectedLocation({ ...location, displayName: location.displayName });
        setSearchTerm('');
        setShowSuggestions(false);
        console.log(`✅ Väderdata hämtad för ${location.displayName}`);
      } else {
        console.warn('❌ API returnerade ingen väderdata');
        setWeatherData([]);
      }
      
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      setWeatherData(null);
    } finally {
      setIsLoadingWeather(false);
    }
  };

  // Gruppera väderdata per dag
  const dailyWeather = useMemo((): DailyWeather[] => {
    if (!weatherData || weatherData.length === 0) return [];

    // KORREKT svensk datumhantering (utan timezone-jox) - MOVED TO TOP
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayKey = `${year}-${month}-${day}`;
    
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomYear = tomorrow.getFullYear();
    const tomMonth = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const tomDay = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowKey = `${tomYear}-${tomMonth}-${tomDay}`;
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yestYear = yesterday.getFullYear();
    const yestMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
    const yestDay = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayKey = `${yestYear}-${yestMonth}-${yestDay}`;

    const dailyMap = new Map<string, WeatherData[]>();
    
    weatherData.forEach(forecast => {
      const date = new Date(forecast.time);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, []);
      }
      dailyMap.get(dateKey)!.push(forecast);
    });

    return Array.from(dailyMap.entries()).map(([dateKey, hourlyData], index) => {
      const date = new Date(dateKey);
      const temperatures = hourlyData
        .map(h => h.temperature)
        .filter((t): t is number => t !== null);
      
      const precipitations = hourlyData
        .map(h => h.precipitation || 0);
      
      const windSpeeds = hourlyData
        .map(h => h.windSpeed)
        .filter((w): w is number => w !== null);
      
             const windDirections = hourlyData
         .map(h => h.windDirection)
         .filter((w): w is number => w !== null);
       
       const cloudCovers = hourlyData
         .map(h => h.cloudCover)
         .filter((c): c is number => c !== null);
       
       const pressures = hourlyData
         .map(h => h.pressure)
         .filter((p): p is number => p !== null);

       const humidities = hourlyData
         .map(h => h.humidity)
         .filter((h): h is number => h !== null);

      // Use YR weather symbols instead of hardcoded logic!
      // CRITICAL FIX: Daglig nederbörd ska vara SUMMA, inte medelvärde!
      // Men vi måste vara försiktiga med YR:s blandade 1h/6h/12h perioder
      const totalPrecipitation = precipitations.length > 0 ? precipitations.reduce((a, b) => a + b, 0) : 0;
      
      // För medelvärden (temperatur, molntäcke)
      const avgCloudCover = cloudCovers.reduce((a, b) => a + b, 0) / cloudCovers.length;
      const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
      
            // Get the most appropriate YR weather symbol for the day
      let primarySymbol: string | null = null;
      
      // For "today", use current time symbol
      if (index === 0 && dateKey === todayKey) {
        const now = new Date();
        const currentHour = hourlyData.find(h => {
          const hourTime = new Date(h.time);
          return Math.abs(hourTime.getTime() - now.getTime()) < 30 * 60 * 1000; // Within 30 minutes
        });
        primarySymbol = currentHour?.symbol || null;
      }
      
      // Fallback: Use midday symbol or first available symbol
      if (!primarySymbol) {
        const middayIndex = Math.floor(hourlyData.length / 2);
        primarySymbol = hourlyData[middayIndex]?.symbol ||
                        hourlyData.find(h => h.symbol)?.symbol || 
                        null;
      }

      // Fallback icon logic (kept for compatibility, but primarySymbol is preferred)
      let icon = 'sun';
      if (totalPrecipitation > 0.1) {
        if (avgCloudCover >= 80) {
          icon = avgTemp < 0 ? 'pure-snow' : 'pure-rain';
        } else {
          icon = avgTemp < 0 ? 'snow' : 'rain';
        }
      } else if (avgCloudCover >= 90) {
        icon = 'overcast';
      } else if (avgCloudCover >= 70) {
        icon = 'cloudy';
      } else if (avgCloudCover >= 30) {
        icon = 'partly-cloudy';
      }

        return {
        date: dateKey,
        day: dateKey === todayKey ? 'Idag' : 
             dateKey === tomorrowKey ? 'Imorgon' : 
             dateKey === yesterdayKey ? 'Igår' :
             date.toLocaleDateString('sv-SE', { weekday: 'long' }),
                 maxTemp: Math.max(...temperatures),
        minTemp: Math.min(...temperatures),
        precipitation: totalPrecipitation, // FIXED: Total nederbörd för dagen
        windSpeed: windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length,
        windDirection: windDirections.reduce((a, b) => a + b, 0) / windDirections.length,
        cloudCover: avgCloudCover,
        avgPressure: pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : null,
        avgHumidity: humidities.length > 0 ? humidities.reduce((a, b) => a + b, 0) / humidities.length : null,
        icon,  // Fallback icon (deprecated)
        primarySymbol,  // YR weather symbol (preferred)
        hourlyData: hourlyData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
       };
                    }); // Visa alla tillgängliga dagar (max 10)
  }, [weatherData]);

  // MAPPING: YR weather symbol names (new IDs) to file names (old IDs)
  const mapYrSymbolToFile = (yrSymbol: string): string | null => {
    const symbolMap: Record<string, string> = {
      // Clear sky
      'clearsky_day': '01d',
      'clearsky_night': '01n', 
      'clearsky_polartwilight': '01m',
      
      // Fair
      'fair_day': '02d',
      'fair_night': '02n',
      'fair_polartwilight': '02m',
      
      // Partly cloudy
      'partlycloudy_day': '03d',
      'partlycloudy_night': '03n',
      'partlycloudy_polartwilight': '03m',
      
      // Cloudy
      'cloudy': '04',
      
      // Rain showers
      'rainshowers_day': '05d',
      'rainshowers_night': '05n',
      'rainshowers_polartwilight': '05m',
      
      // Rain showers and thunder
      'rainshowersandthunder_day': '06d',
      'rainshowersandthunder_night': '06n',
      'rainshowersandthunder_polartwilight': '06m',
      
      // Sleet showers
      'sleetshowers_day': '07d',
      'sleetshowers_night': '07n',
      'sleetshowers_polartwilight': '07m',
      
      // Snow showers
      'snowshowers_day': '08d',
      'snowshowers_night': '08n',
      'snowshowers_polartwilight': '08m',
      
      // Rain
      'rain': '09',
      
      // Heavy rain
      'heavyrain': '10',
      
      // Heavy rain and thunder
      'heavyrainandthunder': '11',
      
      // Sleet
      'sleet': '12',
      
      // Snow
      'snow': '13',
      
      // Snow and thunder
      'snowandthunder': '14',
      
      // Fog
      'fog': '15',
      
      // Sleet showers and thunder
      'sleetshowersandthunder_day': '20d',
      'sleetshowersandthunder_night': '20n',
      'sleetshowersandthunder_polartwilight': '20m',
      
      // Snow showers and thunder
      'snowshowersandthunder_day': '21d',
      'snowshowersandthunder_night': '21n',
      'snowshowersandthunder_polartwilight': '21m',
      
      // Rain and thunder
      'rainandthunder': '22',
      
      // Sleet and thunder
      'sleetandthunder': '23',
      
      // Light rain showers and thunder
      'lightrainshowersandthunder_day': '24d',
      'lightrainshowersandthunder_night': '24n',
      'lightrainshowersandthunder_polartwilight': '24m',
      
      // Heavy rain showers and thunder
      'heavyrainshowersandthunder_day': '25d',
      'heavyrainshowersandthunder_night': '25n',
      'heavyrainshowersandthunder_polartwilight': '25m',
      
      // Light sleet showers and thunder (note: YR has typo "lightssleet")
      'lightssleetshowersandthunder_day': '26d',
      'lightssleetshowersandthunder_night': '26n',
      'lightssleetshowersandthunder_polartwilight': '26m',
      
      // Heavy sleet showers and thunder
      'heavysleetshowersandthunder_day': '27d',
      'heavysleetshowersandthunder_night': '27n',
      'heavysleetshowersandthunder_polartwilight': '27m',
      
      // Light snow showers and thunder (note: YR has typo "lightssnow")
      'lightssnowshowersandthunder_day': '28d',
      'lightssnowshowersandthunder_night': '28n',
      'lightssnowshowersandthunder_polartwilight': '28m',
      
      // Heavy snow showers and thunder
      'heavysnowshowersandthunder_day': '29d',
      'heavysnowshowersandthunder_night': '29n',
      'heavysnowshowersandthunder_polartwilight': '29m',
      
      // Light rain and thunder
      'lightrainandthunder': '30',
      
      // Light sleet and thunder
      'lightsleetandthunder': '31',
      
      // Heavy sleet and thunder
      'heavysleetandthunder': '32',
      
      // Light snow and thunder
      'lightsnowandthunder': '33',
      
      // Heavy snow and thunder
      'heavysnowandthunder': '34',
      
      // Light rain showers
      'lightrainshowers_day': '40d',
      'lightrainshowers_night': '40n',
      'lightrainshowers_polartwilight': '40m',
      
      // Heavy rain showers
      'heavyrainshowers_day': '41d',
      'heavyrainshowers_night': '41n',
      'heavyrainshowers_polartwilight': '41m',
      
      // Light sleet showers
      'lightsleetshowers_day': '42d',
      'lightsleetshowers_night': '42n',
      'lightsleetshowers_polartwilight': '42m',
      
      // Heavy sleet showers
      'heavysleetshowers_day': '43d',
      'heavysleetshowers_night': '43n',
      'heavysleetshowers_polartwilight': '43m',
      
      // Light snow showers
      'lightsnowshowers_day': '44d',
      'lightsnowshowers_night': '44n',
      'lightsnowshowers_polartwilight': '44m',
      
      // Heavy snow showers
      'heavysnowshowers_day': '45d',
      'heavysnowshowers_night': '45n',
      'heavysnowshowers_polartwilight': '45m',
      
      // Light rain
      'lightrain': '46',
      
      // Light sleet
      'lightsleet': '47',
      
      // Heavy sleet
      'heavysleet': '48',
      
      // Light snow
      'lightsnow': '49',
      
      // Heavy snow
      'heavysnow': '50',
    };

    return symbolMap[yrSymbol] || null;
  };

  // NEW: Use authentic YR weather symbols directly
  const getWeatherIcon = (iconType: string, size: string = 'w-8 h-8', time?: string, yrSymbol?: string | null) => {
    // If we have a YR symbol, map it to the authentic YR files
    if (yrSymbol) {
      const fileId = mapYrSymbolToFile(yrSymbol);
      
      if (fileId) {
                  const iconPath = `/images/weather_symbols/shadows/svg/${fileId}.svg`;
        return (
          <img 
            src={iconPath} 
            alt={`Weather: ${yrSymbol}`} 
            className={`${size} object-contain`}
            onError={(e) => {
              console.warn(`YR weather icon not found: ${fileId}.svg (${yrSymbol}), falling back`);
              (e.target as HTMLImageElement).src = '/images/weather_symbols/shadows/svg/01d.svg';
            }}
          />
        );
      }
    }

    // FALLBACK: Old hardcoded logic (deprecated, but using authentic YR symbols)
    // Avgör om det är dag eller natt baserat på tid och soluppgång/solnedgång
    const isNight = time ? (() => {
      const date = new Date(time);
      const hour = date.getHours() + date.getMinutes() / 60;
      
      // Beräkna soluppgång/solnedgång för denna dag och position
      const lat = selectedLocation?.lat || 55.6061;
      const lon = selectedLocation?.lon || 13.0007;
      const sunTimes = calculateSunTimes(date, lat, lon);
      
      return hour < sunTimes.sunrise || hour >= sunTimes.sunset;
    })() : false;

    // Map fallback types to authentic YR symbols
    let fallbackSymbol = '';
    switch (iconType) {
      case 'pure-rain':
        fallbackSymbol = '09'; // rain
        break;
      case 'pure-snow':
        fallbackSymbol = '13'; // snow
        break;
      case 'rain':
        fallbackSymbol = isNight ? '05n' : '05d'; // rainshowers
        break;
      case 'snow':
        fallbackSymbol = isNight ? '08n' : '08d'; // snowshowers
        break;
      case 'cloudy':
        fallbackSymbol = '04'; // cloudy
        break;
      case 'partly-cloudy':
        fallbackSymbol = isNight ? '03n' : '03d'; // partlycloudy
        break;
      case 'thunder':
        fallbackSymbol = isNight ? '06n' : '06d'; // rainshowersandthunder
        break;
      case 'fog':
        fallbackSymbol = '15'; // fog
        break;
      case 'mist':
        fallbackSymbol = '15'; // fog (use same as fog)
        break;
      case 'overcast':
        fallbackSymbol = '04'; // cloudy
        break;
      default: // 'sun' eller okänd
        fallbackSymbol = isNight ? '01n' : '01d'; // clearsky
        break;
    }

    const iconPath = `/images/weather_symbols/shadows/svg/${fallbackSymbol}.svg`;

    return (
      <img 
        src={iconPath} 
        alt={iconType} 
        className={`${size} object-contain`}
      />
    );
  };

          // Formatera tid för timprognos (Yr-data konverteras till svensk tid)
  const formatHour = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('sv-SE', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  // Kopiera från ClockKnob.tsx - funktion för att beräkna soluppgång och solnedgång
  const calculateSunTimes = (date: Date, lat: number = 55.6061, lon: number = 13.0007) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    // Julian Date beräkning
    const a = Math.floor((14 - month) / 12);
    const y = year - a;
    const m = month + 12 * a - 3;
    const JD = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + 1721119;
    
    const n = Math.ceil(JD - 2451545.0 + 0.0008);
    const J_star = n - lon / 360;
    
    const M_deg = (357.5291 + 0.98560028 * J_star) % 360;
    const M_rad = M_deg * Math.PI / 180;
    
    const C_deg = 1.9148 * Math.sin(M_rad) + 0.0200 * Math.sin(2 * M_rad) + 0.0003 * Math.sin(3 * M_rad);
    const lambda_deg = (M_deg + C_deg + 180 + 102.9372) % 360;
    const lambda_rad = lambda_deg * Math.PI / 180;
    
    const J_transit = 2451545.0 + J_star + 0.0053 * Math.sin(M_rad) - 0.0069 * Math.sin(2 * lambda_rad);
    
    const sin_delta = Math.sin(lambda_rad) * Math.sin(23.4397 * Math.PI / 180);
    const cos_delta = Math.cos(Math.asin(sin_delta));
    
    const altitude_angle = -0.833;
    const lat_rad = lat * Math.PI / 180;
    const cos_hour_angle = (Math.sin(altitude_angle * Math.PI / 180) - Math.sin(lat_rad) * sin_delta) / 
                           (Math.cos(lat_rad) * cos_delta);
    
    if (Math.abs(cos_hour_angle) > 1) {
      if (cos_hour_angle > 1) {
        return { sunrise: 12, sunset: 12 }; // Polarnatt
      } else {
        return { sunrise: 0, sunset: 24 }; // Midnattssol  
      }
    }
    
    const hour_angle_rad = Math.acos(cos_hour_angle);
    const hour_angle_deg = hour_angle_rad * 180 / Math.PI;
    
    const J_rise = J_transit - hour_angle_deg / 360;
    const J_set = J_transit + hour_angle_deg / 360;
    
    const unix_rise = (J_rise - 2440587.5) * 86400;
    const unix_set = (J_set - 2440587.5) * 86400;
    
    const sunrise_date = new Date(unix_rise * 1000);
    const sunset_date = new Date(unix_set * 1000);
    
    // Svensk tid (approximation)
    const isDST = date.getMonth() > 2 && date.getMonth() < 10;
    const timezone_offset = isDST ? 2 : 1;
    
    const sunrise_swedish = new Date(sunrise_date.getTime() + timezone_offset * 3600 * 1000);
    const sunset_swedish = new Date(sunset_date.getTime() + timezone_offset * 3600 * 1000);
    
    const sunrise_hours = sunrise_swedish.getUTCHours() + sunrise_swedish.getUTCMinutes() / 60;
    const sunset_hours = sunset_swedish.getUTCHours() + sunset_swedish.getUTCMinutes() / 60;
    
    return { sunrise: sunrise_hours, sunset: sunset_hours };
  };

  // Förbättrad location select handler
  const handleLocationSelect = async (location: GeoLocation) => {
    await fetchWeatherData(location);
    setShowSuggestions(false);
    setSelectedResultIndex(-1);
    setIsDropdownFocused(false);
  };

  // Hantera input focus
  const handleInputFocus = () => {
    if (searchResults.length > 0) {
      setShowSuggestions(true);
    }
  };

  // Rensa sökfältet
  const handleClearSearch = () => {
    setSearchTerm('');
    setSearchResults([]);
    setShowSuggestions(false);
    setSelectedResultIndex(-1);
    setIsDropdownFocused(false);
    inputRef.current?.focus();
  };

  const isLoading = !isSystemReady || isLoadingLocation || isLoadingWeather;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative">
      {/* Video Background */}
      <video
        className="fixed inset-0 w-full h-full object-cover z-0"
        style={{
          filter: 'brightness(0.15) contrast(1.2) saturate(0.6)',
        }}
        autoPlay
        muted
        loop
        playsInline
        onLoadedData={(e) => {
          const video = e.target as HTMLVideoElement;
          video.playbackRate = 0.7;
        }}
      >
        <source src="/videos/calm-water.mp4" type="video/mp4" />
      </video>
      
      {/* Video Overlay */}
      <div className="fixed inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/70 z-0"></div>
      <div className="fixed inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-teal-900/20 z-0"></div>

      {/* Header */}
      <div className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="p-2 hover:bg-white/10 rounded-xl transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-light text-white truncate">Väderprognos</h1>

              </div>
            </div>
            
            {/* Förbättrad Search */}
            <div ref={searchRef} className="relative w-full sm:w-96 max-w-md">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40 z-10" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Sök stad eller kommun..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={handleInputFocus}
                  className="w-full pl-12 pr-12 py-3 bg-white/10 backdrop-blur-sm text-white placeholder-white/40 rounded-2xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-200"
                />
                
                {/* Loading eller Clear knapp */}
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  {isSearching ? (
                    <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
                  ) : searchTerm ? (
                    <button
                      onClick={handleClearSearch}
                      className="w-5 h-5 text-white/40 hover:text-white/80 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  ) : (
                    <ChevronDown className={`w-5 h-5 text-white/40 transition-transform duration-200 ${showSuggestions ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </div>
              
              {/* Förbättrade Search Results */}
              {showSuggestions && (
                <div 
                  ref={dropdownRef}
                  className="absolute top-full left-0 right-0 mt-2 bg-black/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl z-50 max-h-80 overflow-hidden animate-in slide-in-from-top-2 duration-200"
                >
                  <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20">
                    {searchResults.length > 0 ? (
                      <>
                        {/* Header */}
                        <div className="px-4 py-2 border-b border-white/10 bg-white/5">
                          <p className="text-xs text-white/60 font-medium uppercase tracking-wide">
                            Hittade {searchResults.length} platser
                          </p>
                        </div>
                        
                        {searchResults.map((location, index) => (
                          <button
                            key={`${location.lat}-${location.lon}-${index}`}
                            onClick={() => handleLocationSelect(location)}
                            className={`w-full px-4 py-3 text-left transition-all duration-150 border-b border-white/5 last:border-b-0 group ${
                              selectedResultIndex === index || (isDropdownFocused && selectedResultIndex === index)
                                ? 'bg-blue-500/20 border-blue-400/30' 
                                : 'hover:bg-white/8'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                                selectedResultIndex === index 
                                  ? 'bg-blue-400/30 text-blue-300' 
                                  : 'bg-white/10 text-white/60 group-hover:bg-white/15 group-hover:text-white/80'
                              }`}>
                                <MapPin className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-white font-medium text-sm leading-tight">
                                  {location.displayName}
                                </p>
                              </div>
                              <ChevronRight className={`w-4 h-4 text-white/40 transition-transform group-hover:translate-x-0.5 ${
                                selectedResultIndex === index ? 'text-blue-400' : ''
                              }`} />
                            </div>
                          </button>
                        ))}
                        
                        {/* Footer med keyboard hints */}
                        <div className="px-4 py-2 border-t border-white/10 bg-white/5">
                          <p className="text-xs text-white/50 text-center">
                            Använd ↑↓ för att navigera, Enter för att välja, Esc för att stänga
                          </p>
                        </div>
                      </>
                    ) : (
                      /* Empty state */
                      <div className="px-4 py-8 text-center">
                        <MapPin className="w-8 h-8 text-white/30 mx-auto mb-3" />
                        <p className="text-white/60 text-sm font-medium mb-1">Inga platser hittades</p>
                        <p className="text-white/40 text-xs">Prova att söka på en stad eller kommun</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-16 relative z-10">
        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-16">
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8 sm:p-12 max-w-2xl mx-auto">
              <Loader2 className="w-16 h-16 text-blue-400 mx-auto mb-6 animate-spin" />
              <h2 className="text-2xl sm:text-3xl font-light text-white mb-4">
                {!isSystemReady ? 'Startar systemet...' :
                 isLoadingLocation ? 'Hämtar din position...' : 
                 'Söker väderdata...'}
              </h2>
              
              <p className="text-white/70 text-lg">
                {!isSystemReady ? 'Snabb start utan stora filer' :
                 isLoadingLocation ? 'Identifierar din plats automatiskt' :
                 'Hämtar live väderdata från Yr'}
              </p>
            </div>
          </div>
        )}

        {/* Weather Content */}
        {!isLoading && selectedLocation && dailyWeather.length > 0 && (
          <div className="space-y-6">

            {/* Location Header */}
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6 sm:p-8">
              <div className="flex items-center gap-4 mb-4">
                <Navigation className="w-6 h-6 text-blue-400" />
                <div className="flex-1">
                  <h2 className="text-2xl sm:text-3xl font-light text-white">
                    {selectedLocation.displayName}
                    {selectedDay !== null && selectedDay > 0 && dailyWeather[selectedDay] && (
                      <span className="text-2xl sm:text-3xl text-white/90 ml-3 font-light">
                        {new Date(dailyWeather[selectedDay].date).toLocaleDateString('sv-SE', { 
                          day: 'numeric', 
                          month: 'long'
                        })}
                      </span>
                    )}
                    {selectedDay === 0 && (
                      <span className="text-2xl sm:text-3xl text-white/90 ml-3 font-light">idag</span>
                    )}
                  </h2>
                </div>
                {/* Current weather icon */}
                <div className="flex items-center gap-3">
                  {(() => {
                    if (!weatherData || weatherData.length === 0) return null;
                    const now = new Date();
                    const currentHour = weatherData.find(w => {
                      const weatherTime = new Date(w.time);
                      return Math.abs(weatherTime.getTime() - now.getTime()) < 30 * 60 * 1000; // Within 30 minutes
                    }) || weatherData[0]; // Fallback to first forecast
                    
                    return currentHour ? getWeatherIcon('current', 'w-12 h-12', currentHour.time, currentHour.symbol) : null;
                  })()}
                </div>
              </div>
              
              {/* Current Weather (för vald dag eller idag) */}
              {dailyWeather[selectedDay || 0] && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-400/20 to-red-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Thermometer className="w-8 h-8 text-orange-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Temperatur</p>
                    <p className="text-white font-bold text-xl">
                      {(() => {
                        const displayDay = dailyWeather[selectedDay || 0];
                        // Om det är "idag" (selectedDay = 0 eller null), visa aktuell temperatur
                        if ((selectedDay === null || selectedDay === 0) && weatherData && weatherData.length > 0) {
                          const now = new Date();
                          const currentHour = weatherData.find(w => {
                            const weatherTime = new Date(w.time);
                            return Math.abs(weatherTime.getTime() - now.getTime()) < 30 * 60 * 1000;
                          }) || weatherData[0];
                          return currentHour?.temperature ? `${currentHour.temperature.toFixed(1)}°C` : `${displayDay.maxTemp.toFixed(1)}°C`;
                        }
                        // För andra dagar, visa dagens maxtemperatur
                        return `${displayDay.maxTemp.toFixed(1)}°C`;
                      })()}
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Wind className="w-8 h-8 text-blue-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Vindstyrka</p>
                    <p className="text-white font-bold text-xl">
                      {(() => {
                        const displayDay = dailyWeather[selectedDay || 0];
                        // Om det är "idag" (selectedDay = 0 eller null), visa aktuell vind
                        if ((selectedDay === null || selectedDay === 0) && weatherData && weatherData.length > 0) {
                          const now = new Date();
                          const currentHour = weatherData.find(w => {
                            const weatherTime = new Date(w.time);
                            return Math.abs(weatherTime.getTime() - now.getTime()) < 30 * 60 * 1000;
                          }) || weatherData[0];
                          
                          const windSpeed = currentHour?.windSpeed || displayDay.windSpeed;
                          const windGust = currentHour?.windGust;
                          
                          let windDisplay = `${windSpeed.toFixed(1)} m/s`;
                          if (windGust) {
                            windDisplay += ` (byar ${windGust.toFixed(1)})`;
                          }
                          
                          return windDisplay;
                        }
                        // För andra dagar, visa dagsmedeltal
                        return `${displayDay.windSpeed.toFixed(1)} m/s`;
                      })()}
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Droplets className="w-8 h-8 text-blue-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Nederbörd</p>
                    <p className="text-white font-bold text-xl">
                      {(() => {
                        const displayDay = dailyWeather[selectedDay || 0];
                        // För nederbörd, visa alltid dagsumman (inte aktuell timme)
                        return `${displayDay.precipitation.toFixed(1)} mm`;
                      })()}
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Eye className="w-8 h-8 text-purple-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Molntäcke</p>
                    <p className="text-white font-bold text-xl">
                      {(() => {
                        const displayDay = dailyWeather[selectedDay || 0];
                        // Om det är "idag", visa aktuellt molntäcke
                        if ((selectedDay === null || selectedDay === 0) && weatherData && weatherData.length > 0) {
                          const now = new Date();
                          const currentHour = weatherData.find(w => {
                            const weatherTime = new Date(w.time);
                            return Math.abs(weatherTime.getTime() - now.getTime()) < 30 * 60 * 1000;
                          }) || weatherData[0];
                          return currentHour?.cloudCover ? `${Math.round(currentHour.cloudCover)}%` : `${displayDay.cloudCover.toFixed(0)}%`;
                        }
                        // För andra dagar, visa dagsmedeltal
                        return `${displayDay.cloudCover.toFixed(0)}%`;
                      })()}
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-400/20 to-teal-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Compass className="w-8 h-8 text-green-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Lufttryck</p>
                    <p className="text-white font-bold text-xl">
                      {(() => {
                        const displayDay = dailyWeather[selectedDay || 0];
                        // Om det är "idag", visa aktuellt lufttryck
                        if ((selectedDay === null || selectedDay === 0) && weatherData && weatherData.length > 0) {
                          const now = new Date();
                          const currentHour = weatherData.find(w => {
                            const weatherTime = new Date(w.time);
                            return Math.abs(weatherTime.getTime() - now.getTime()) < 30 * 60 * 1000;
                          }) || weatherData[0];
                          return currentHour?.pressure ? `${Math.round(currentHour.pressure)} hPa` : (displayDay.avgPressure ? `${Math.round(displayDay.avgPressure)} hPa` : 'N/A');
                        }
                        // För andra dagar, visa dagsmedeltal
                        return displayDay.avgPressure ? `${Math.round(displayDay.avgPressure)} hPa` : 'N/A';
                      })()}
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-cyan-400/20 to-blue-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Droplets className="w-8 h-8 text-cyan-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Luftfuktighet</p>
                    <p className="text-white font-bold text-xl">
                      {(() => {
                        const displayDay = dailyWeather[selectedDay || 0];
                        // Om det är "idag", visa aktuell luftfuktighet
                        if ((selectedDay === null || selectedDay === 0) && weatherData && weatherData.length > 0) {
                          const now = new Date();
                          const currentHour = weatherData.find(w => {
                            const weatherTime = new Date(w.time);
                            return Math.abs(weatherTime.getTime() - now.getTime()) < 30 * 60 * 1000;
                          }) || weatherData[0];
                          return currentHour?.humidity ? `${Math.round(currentHour.humidity)}%` : (displayDay.avgHumidity ? `${Math.round(displayDay.avgHumidity)}%` : 'N/A');
                        }
                        // För andra dagar, visa dagsmedeltal
                        return displayDay.avgHumidity ? `${Math.round(displayDay.avgHumidity)}%` : 'N/A';
                      })()}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Daily Forecast Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {dailyWeather.map((day, index) => (
                <div
                  key={day.date}
                  onClick={() => setSelectedDay(selectedDay === index ? null : index)}
                  className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-4 hover:bg-white/10 transition-all cursor-pointer hover:border-white/30"
                >
                  <div className="text-center">
                    <p className="font-semibold text-white text-sm">{day.day}</p>
                    <p className="text-white/60 text-xs mb-3">
                      {new Date(day.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                    </p>
                    
                    <div className="mb-3">
                      {getWeatherIcon(day.icon, 'w-12 h-12', 
                        index === 0 && day.day === 'Idag' ? 
                          (() => {
                            const now = new Date();
                            const currentHour = day.hourlyData.find(h => {
                              const hourTime = new Date(h.time);
                              return Math.abs(hourTime.getTime() - now.getTime()) < 30 * 60 * 1000;
                            });
                            return currentHour?.time || day.hourlyData[0]?.time;
                          })() :
                          day.hourlyData[Math.floor(day.hourlyData.length/2)]?.time, 
                        day.primarySymbol)}
                    </div>
                    
                    <div className="mb-3">
                      <p className="text-2xl font-bold text-white">{Math.round(day.maxTemp)}°</p>
                      <p className="text-sm font-medium text-white/60">{Math.round(day.minTemp)}° min</p>
                    </div>
                    
                    <div className="space-y-2 text-xs text-white/60">
                      <div className="flex items-center justify-center gap-1">
                        <Droplets className="w-3 h-3" />
                        <span>{day.precipitation.toFixed(1)} mm</span>
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <Wind className="w-3 h-3" />
                        <span>{day.windSpeed.toFixed(0)} m/s</span>
                      </div>
                    </div>
                    
                    <ChevronRight className={`w-4 h-4 text-white/40 mx-auto mt-2 transition-transform ${selectedDay === index ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              ))}
            </div>

            {/* Hourly Forecast (when day is selected) */}
            {selectedDay !== null && dailyWeather[selectedDay] && (
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6 sm:p-8">
              <h3 className="text-xl sm:text-2xl font-light text-white mb-6 flex items-center gap-3">
                <Calendar className="w-6 h-6 text-blue-400" />
                  {selectedLocation ? `Väder för ${selectedLocation.displayName}` : 'Väderprognos'}
              </h3>
              

                
                <div className="overflow-x-auto">
                  <div className="min-w-full">

                    
                    {/* Hourly rows med soluppgång/solnedgång och dagheaders */}
                    <div className="space-y-1">
                      {(() => {
                                                  // Hitta första 00:00 från vald dag och framåt
                          const startDate = new Date(dailyWeather[selectedDay].date);
                          const startOfDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                          
                          // Samla alla tillgängliga timmar från alla dagar
                          const allAvailableHours: WeatherData[] = [];
                          dailyWeather.forEach(day => {
                            allAvailableHours.push(...day.hourlyData);
                          });
                          
                          // Sortera och filtrera från startOfDay framåt (max 48 timmar)
                          const sortedHours = allAvailableHours
                            .filter(hour => new Date(hour.time).getTime() >= startOfDay.getTime())
                            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                            .slice(0, 48);
                        
                                                 // Skapa kombinerad lista med timmar, dagheaders och sol-events
                         type CombinedItem = 
                           | { type: 'dayHeader'; date: string; dayName: string; key: string }
                           | { type: 'sunrise'; time: string; date: string; key: string }
                           | { type: 'sunset'; time: string; date: string; key: string }
                           | { type: 'hour'; hour: WeatherData; key: string };
                         
                         const combinedItems: CombinedItem[] = [];
                         let currentDate = '';
                        
                        sortedHours.forEach((hour, index) => {
                          const hourDate = new Date(hour.time);
                          // Yr-data använder UTC-tid, konvertera till svensk tid för visning
                          const dateKey = hourDate.toLocaleDateString('sv-SE');
                          const hourTime = hourDate.getHours();
                          
                                                     // Lägg till dagheader när dagen ändras
                           if (dateKey !== currentDate) {
                             currentDate = dateKey;
                             // SMART logik: Kontrollera ALLA datum mot idag/igår/imorgon
                             const checkDate = new Date();
                             const todayKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
                             
                             const tomorrow = new Date(checkDate);
                             tomorrow.setDate(tomorrow.getDate() + 1);
                             const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
                             
                             const yesterday = new Date(checkDate);
                             yesterday.setDate(yesterday.getDate() - 1);
                             const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
                             
                             let dayName;
                             if (dateKey === todayKey) {
                               dayName = `IDAG ${hourDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}`;
                             } else if (dateKey === tomorrowKey) {
                               dayName = `IMORGON ${hourDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}`;
                             } else if (dateKey === yesterdayKey) {
                               dayName = `IGÅR ${hourDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}`;
                             } else {
                               // Vanliga veckodagar
                               dayName = hourDate.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' });
                             }
                             
                             combinedItems.push({
                               type: 'dayHeader',
                               date: dateKey,
                               dayName: dayName || dateKey,
                               key: `day-${dateKey}`
                             });
                           }
                          
                                                     // Beräkna soluppgång/solnedgång för denna dag
                           const lat = selectedLocation?.lat || 55.6061;
                           const lon = selectedLocation?.lon || 13.0007;
                           const sunTimes = calculateSunTimes(hourDate, lat, lon);
                          
                          const sunriseHour = Math.floor(sunTimes.sunrise);
                          const sunsetHour = Math.floor(sunTimes.sunset);
                          
                          // Lägg till soluppgång om vi passerar den tiden
                          if (hourTime === sunriseHour + 1 && !combinedItems.some(item => 
                            item.type === 'sunrise' && item.date === dateKey)) {
                            const sunriseMinutes = Math.floor((sunTimes.sunrise % 1) * 60);
                            combinedItems.push({
                              type: 'sunrise',
                              time: `${sunriseHour.toString().padStart(2, '0')}:${sunriseMinutes.toString().padStart(2, '0')}`,
                              date: dateKey,
                              key: `sunrise-${dateKey}`
                            });
                          }
                          
                          // Lägg till timprognos
                          combinedItems.push({
                            type: 'hour',
                            hour: hour,
                            key: `hour-${hour.time}`
                          });
                          
                          // Lägg till solnedgång om vi passerar den tiden
                          if (hourTime === sunsetHour && !combinedItems.some(item => 
                            item.type === 'sunset' && item.date === dateKey)) {
                            const sunsetMinutes = Math.floor((sunTimes.sunset % 1) * 60);
                            combinedItems.push({
                              type: 'sunset',
                              time: `${sunsetHour.toString().padStart(2, '0')}:${sunsetMinutes.toString().padStart(2, '0')}`,
                              date: dateKey,
                              key: `sunset-${dateKey}`
                            });
                          }
                        });
                        
                        return combinedItems.map((item) => {
                          if (item.type === 'dayHeader') {
                            return (
                              <div key={item.key} className="bg-blue-500/10 rounded-xl border-l-4 border-blue-400/50 mt-4 mb-2 p-3">
                                <div className="grid grid-cols-8 gap-2 sm:gap-4 text-xs font-medium items-center">
                                  <div className="col-span-2 text-blue-200 font-semibold text-sm uppercase tracking-wide">
                                    {item.dayName}
                                  </div>
                                  <div className="col-span-1 text-white/90 text-center">Temp</div>
                                  <div className="col-span-1 text-white/90 text-center">mm</div>
                                  <div className="col-span-1 text-white/90 text-center">m/s (by)</div>
                                  <div className="col-span-1 text-white/90 text-center">Moln</div>
                                  <div className="col-span-1 text-white/90 text-center">Luftfuk</div>
                                  <div className="col-span-1 text-white/90 text-center">Lufttryck</div>
                                </div>
                              </div>
                            );
                          }
                          
                          if (item.type === 'sunrise') {
                            return (
                              <div key={item.key} className="grid grid-cols-8 gap-2 sm:gap-4 items-center py-2 px-2 bg-orange-500/10 rounded-xl border-l-2 border-orange-400/50">
                                <div className="col-span-1 text-orange-300 text-sm font-medium">{item.time}</div>
                                <div className="col-span-1 flex justify-center">
                                  <Sunrise className="w-5 h-5 text-orange-400" />
                                </div>
                                <div className="col-span-6 text-orange-200 text-sm">Soluppgång</div>
                              </div>
                            );
                          }
                          
                          if (item.type === 'sunset') {
                            return (
                              <div key={item.key} className="grid grid-cols-8 gap-2 sm:gap-4 items-center py-2 px-2 bg-orange-600/10 rounded-xl border-l-2 border-orange-500/50">
                                <div className="col-span-1 text-orange-400 text-sm font-medium">{item.time}</div>
                                <div className="col-span-1 flex justify-center">
                                  <Sunset className="w-5 h-5 text-orange-500" />
                                </div>
                                <div className="col-span-6 text-orange-300 text-sm">Solnedgång</div>
                              </div>
                            );
                          }
                          
                          // Timprognos
                          const hour = item.hour;
                          
                          // Bestäm väderikon baserat på data (förbättrad logik)
                          let hourIcon = 'sun';
                          const cloudCover = hour.cloudCover || 0;
                          const precipitation = hour.precipitation || 0;
                          
                          if (precipitation > 0.1) {
                            if (cloudCover >= 80) {
                              // Mulet med regn/snö - använd ren regn/snö-ikon utan sol/måne
                              hourIcon = hour.temperature && hour.temperature < 0 ? 'pure-snow' : 'pure-rain';
                            } else {
                              // Delvis molnigt med regn/snö - använd regn/snö med sol/måne
                              hourIcon = hour.temperature && hour.temperature < 0 ? 'snow' : 'rain';
                            }
                          } else if (cloudCover >= 90) {
                            // Helt molnigt utan regn - använd overcast
                            hourIcon = 'overcast';
                          } else if (cloudCover >= 70) {
                            // Mestadels molnigt - använd cloudy
                            hourIcon = 'cloudy';
                          } else if (cloudCover >= 30) {
                            // Delvis molnigt
                            hourIcon = 'partly-cloudy';
                          }
                          
                          // ✅ ALLA HÅRDKODADE FUSK-BERÄKNINGAR BORTTAGNA!
                          
                          // Vindriktningspil - Yr ger meteorologisk vindriktning (från vilken riktning vinden kommer)
                          // Pilen ska visa åt vilken riktning vinden BLÅSER (180° förskjuten)
                          const getWindArrow = (direction: number | null) => {
                            if (!direction) return '↑';
                            // Konvertera från "kommer från" till "blåser åt" genom att lägga till 180°
                            const windBlowsTo = (direction + 180) % 360;
                            const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
                            return arrows[Math.round(windBlowsTo / 45) % 8];
                          };
                          
                          // Vindriktning som text för bättre förståelse
                          const getWindDirectionText = (direction: number | null) => {
                            if (!direction) return 'Vindstilla';
                            const directions = ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'];
                            const index = Math.round(direction / 45) % 8;
                            return `${directions[index]}`;
                          };
                          
                          return (
                            <div key={item.key} className="grid grid-cols-8 gap-2 sm:gap-4 items-center py-2 px-2 hover:bg-white/5 rounded-xl transition-colors text-sm">
                              {/* Tid */}
                              <div className="col-span-1 text-white/90 font-medium">
                                {formatHour(hour.time)}
                              </div>
                              
                              {/* Väderikon */}
                              <div className="col-span-1 flex justify-center">
                                {getWeatherIcon(hourIcon, 'w-10 h-10', hour.time, hour.symbol)}
                              </div>
                              
                              {/* Temperatur */}
                              <div className="col-span-1 text-center text-white font-bold text-lg">
                                {hour.temperature ? `${Math.round(hour.temperature)}°` : '--'}
                              </div>
                              
                              {/* Nederbörd */}
                              <div className="col-span-1 text-center text-white/80">
                                {hour.precipitation && hour.precipitation > 0 ? hour.precipitation.toFixed(1) : '0'}
                              </div>
                      
                              {/* Vind */}
                              <div className="col-span-1 text-center text-white/80 flex items-center justify-center gap-1">
                                <span className="text-base" title={getWindDirectionText(hour.windDirection)}>{getWindArrow(hour.windDirection)}</span>
                                <div className="flex items-center gap-1">
                                  <span>{hour.windSpeed ? `${Math.round(hour.windSpeed)}` : '--'}</span>
                                  {hour.windGust && (
                                    <span className="text-xs text-white/60">
                                      ({Math.round(hour.windGust)})
                                    </span>
                                  )}
                                </div>
                              </div>
                      
                              {/* Molntäcke */}
                              <div className="col-span-1 text-center text-white/80">
                                {hour.cloudCover ? `${Math.round(hour.cloudCover)}%` : '--'}
                              </div>

                              {/* Luftfuktighet - NY KOLUMN! */}
                              <div className="col-span-1 text-center text-white/80">
                                {hour.humidity ? `${Math.round(hour.humidity)}%` : '--'}
                              </div>
                      
                              {/* Lufttryck */}
                              <div className="col-span-1 text-center text-white/80">
                                {hour.pressure ? `${Math.round(hour.pressure)} hPa` : '--'}
                              </div>
                      </div>
                          );
                        });
                      })()}
                       
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
        )}

        {/* No data state */}
        {!isLoading && !selectedLocation && (
          <div className="text-center py-16">
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8 sm:p-12 max-w-2xl mx-auto">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Thermometer className="w-8 h-8 text-blue-400 opacity-60" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-light text-white mb-4">Välkommen till väderprognosen</h2>
              <p className="text-white/70 text-lg">Sök efter städer, sjöar eller vattendrag för väderprognos från Yr (Meteorologisk institutt)</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Weather attribution footer */}
      <div className="container mx-auto px-4 pb-8">
        <WeatherAttribution variant="compact" className="text-center" />
      </div>
    </div>
  );
} 