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
  icon: string;
  hourlyData: WeatherData[];
}

export default function WeatherPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<GeoLocation[]>([]);
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

  // Ladda förberedd väderdata
  const [preloadedWeatherData, setPreloadedWeatherData] = useState<any>(null);
  const [isLoadingPreloadedData, setIsLoadingPreloadedData] = useState(true);

  // Ladda förberedd väderdata vid sidstart
  useEffect(() => {
    const loadPreloadedWeatherData = async () => {
      try {
        // Använd okomprimerad fil för att undvika pako/gzip problem
        const response = await fetch('/data/weather_data.json');
        if (!response.ok) throw new Error('Weather data not found');
        
        const data = await response.json();

        
        setPreloadedWeatherData(data);
        setIsLoadingPreloadedData(false);
      } catch (error) {
        console.error('Failed to load weather data:', error);
        setIsLoadingPreloadedData(false);
      }
    };

    loadPreloadedWeatherData();
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

    // Vänta på att preloaded data laddas först
    if (!isLoadingPreloadedData) {
      getCurrentLocation();
    }
  }, [isLoadingPreloadedData]);

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
      setShowSuggestions(false);
      setSelectedResultIndex(-1);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      setSelectedResultIndex(-1);
      try {
        const result = await weatherGeocodingService.searchLocations(searchTerm);
        setSearchResults(result.locations);
        setShowSuggestions(result.locations.length > 0);
      } catch (error) {
        console.error('Search failed:', error);
        setSearchResults([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchTerm]);

  // Hybrid väderdata-hämtning: Cache först, sedan real-time API
  const fetchWeatherData = async (location: GeoLocation) => {
    setIsLoadingWeather(true);
    setSelectedDay(null);
    
    // Deklarera utanför try för att kunna använda i catch
    let closestPoint = null;
    let minDistance = Infinity;
    
    try {
      if (!preloadedWeatherData) {
        console.error('Weather data not loaded yet');
        return;
      }
      
      // STEG 1: Försök hitta i cached data först
      
      for (const point of preloadedWeatherData.points) {
        const distance = Math.sqrt(
          Math.pow(point.lat - location.lat, 2) + 
          Math.pow(point.lon - location.lon, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      }



      // STEG 2: Om cached data är nära nog (< 0.3°), använd den
      if (closestPoint && minDistance < 0.3) {
        
        
        const forecasts = closestPoint.data.map((timeData: any) => ({
          time: timeData.time,
          temperature: timeData.temperature || null,
          precipitation: timeData.precipitation || null,
          windSpeed: timeData.windSpeed || null,
          windDirection: timeData.windDirection || null,
          windGust: timeData.windGust || null,
          cloudCover: timeData.cloudCover || null,
          pressure: timeData.pressure || null,
          humidity: timeData.humidity || null,
          dewpoint: timeData.dewpoint || null
        }));

        setWeatherData(forecasts);
        setSelectedLocation({ ...location, displayName: location.displayName });
        setSearchTerm('');
        setShowSuggestions(false);
        return;
      }

      // STEG 3: Om för långt bort, använd real-time API
      
      
      const apiStart = Date.now();
      const response = await fetch(`/api/weather?lat=${location.lat}&lon=${location.lon}`);
      const apiTime = Date.now() - apiStart;
      
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }
      
      const apiData = await response.json();
      
      
      if (apiData.success && apiData.data.forecasts) {
        setWeatherData(apiData.data.forecasts);
        setSelectedLocation({ ...location, displayName: location.displayName });
        setSearchTerm('');
        setShowSuggestions(false);
      } else {
        console.warn('❌ API returnerade ingen väderdata');
        setWeatherData([]);
      }
      
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      
      // FALLBACK: Om API misslyckas, använd cached data ändå (även om långt bort)
      if (closestPoint && minDistance < 1.0) {
        
        
        const forecasts = closestPoint.data.map((timeData: any) => ({
          time: timeData.time,
          temperature: timeData.temperature || null,
          precipitation: timeData.precipitation || null,
          windSpeed: timeData.windSpeed || null,
          windDirection: timeData.windDirection || null,
          windGust: timeData.windGust || null,
          cloudCover: timeData.cloudCover || null,
          pressure: timeData.pressure || null,
          humidity: timeData.humidity || null,
          dewpoint: timeData.dewpoint || null
        }));

        setWeatherData(forecasts);
        setSelectedLocation({ ...location, displayName: location.displayName });
        setSearchTerm('');
        setShowSuggestions(false);
      } else {
        setWeatherData(null);
      }
    } finally {
      setIsLoadingWeather(false);
    }
  };

  // Gruppera väderdata per dag
  const dailyWeather = useMemo((): DailyWeather[] => {
    if (!weatherData || weatherData.length === 0) return [];

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

      // Bestäm väderikon baserat på genomsnittlig nederbörd och molntäcke (förbättrad logik)
      const avgPrecipitation = precipitations.reduce((a, b) => a + b, 0) / precipitations.length;
      const avgCloudCover = cloudCovers.reduce((a, b) => a + b, 0) / cloudCovers.length;
      const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
      
      let icon = 'sun';
      if (avgPrecipitation > 0.1) {
        if (avgCloudCover >= 80) {
          // Mulet med regn/snö - använd ren regn/snö-ikon utan sol/måne
          icon = avgTemp < 0 ? 'pure-snow' : 'pure-rain';
        } else {
          // Delvis molnigt med regn/snö - använd regn/snö med sol/måne
          icon = avgTemp < 0 ? 'snow' : 'rain';
        }
      } else if (avgCloudCover >= 90) {
        // Helt molnigt utan regn - använd overcast
        icon = 'overcast';
      } else if (avgCloudCover >= 70) {
        // Mestadels molnigt - använd cloudy
        icon = 'cloudy';
      } else if (avgCloudCover >= 30) {
        // Delvis molnigt
        icon = 'partly-cloudy';
      }

                          // KORREKT svensk datumhantering (utan timezone-jox)
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

        return {
        date: dateKey,
        day: dateKey === todayKey ? 'Idag' : 
             dateKey === tomorrowKey ? 'Imorgon' : 
             dateKey === yesterdayKey ? 'Igår' :
             date.toLocaleDateString('sv-SE', { weekday: 'long' }),
         maxTemp: Math.max(...temperatures),
         minTemp: Math.min(...temperatures),
         precipitation: Math.max(...precipitations),
         windSpeed: windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length,
         windDirection: windDirections.reduce((a, b) => a + b, 0) / windDirections.length,
         cloudCover: avgCloudCover,
         avgPressure: pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : null,
         icon,
         hourlyData: hourlyData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
       };
                    }); // Visa alla tillgängliga dagar (max 10)
  }, [weatherData]);

  // SVG väderikoner med dag/natt-logik
  const getWeatherIcon = (iconType: string, size: string = 'w-8 h-8', time?: string) => {
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

    // Välj rätt SVG-ikon baserat på vädertyp och dag/natt
    let iconPath = '';
    switch (iconType) {
      case 'pure-rain':
        // Ren regn-ikon utan sol/måne för mulet väder
        iconPath = '/images/weather_icons/SVG/rain.svg';
        break;
      case 'pure-snow':
        // Ren snö-ikon utan sol/måne för mulet väder
        iconPath = '/images/weather_icons/SVG/snow.svg';
        break;
      case 'rain':
        // Regn med sol/måne för delvis molnigt väder
        iconPath = isNight ? '/images/weather_icons/SVG/night_rain.svg' : '/images/weather_icons/SVG/day_rain.svg';
        break;
      case 'snow':
        // Snö med sol/måne för delvis molnigt väder
        iconPath = isNight ? '/images/weather_icons/SVG/night_snow.svg' : '/images/weather_icons/SVG/day_snow.svg';
        break;
      case 'cloudy':
        iconPath = '/images/weather_icons/SVG/cloudy.svg';
        break;
      case 'partly-cloudy':
        iconPath = isNight ? '/images/weather_icons/SVG/night_partial_cloud.svg' : '/images/weather_icons/SVG/day_partial_cloud.svg';
        break;
      case 'thunder':
        iconPath = isNight ? '/images/weather_icons/SVG/night_rain_thunder.svg' : '/images/weather_icons/SVG/day_rain_thunder.svg';
        break;
      case 'fog':
        iconPath = '/images/weather_icons/SVG/fog.svg';
        break;
      case 'mist':
        iconPath = '/images/weather_icons/SVG/mist.svg';
        break;
      case 'overcast':
        iconPath = '/images/weather_icons/SVG/overcast.svg';
        break;
      default: // 'sun' eller okänd
        iconPath = isNight ? '/images/weather_icons/SVG/night_clear.svg' : '/images/weather_icons/SVG/day_clear.svg';
        break;
    }

    return (
      <img 
        src={iconPath} 
        alt={iconType} 
        className={`${size} object-contain`}
      />
    );
  };

  // Formatera tid för timprognos (FMI-data är redan i svensk tid)
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

  const isLoading = isLoadingPreloadedData || isLoadingLocation || isLoadingWeather;

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
                {isLoadingPreloadedData ? 'Laddar väderdata...' : 
                 isLoadingLocation ? 'Hämtar din position...' : 
                 'Söker väderdata...'}
              </h2>
              <p className="text-white/70 text-lg">Vänta medan vi förbereder prognoserna</p>
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
                <div>
                  <h2 className="text-2xl sm:text-3xl font-light text-white">{selectedLocation.displayName}</h2>
  
                </div>
              </div>
              
              {/* Current Weather (dagens första prognos) */}
              {dailyWeather[0] && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-400/20 to-red-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Thermometer className="w-8 h-8 text-orange-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Temperatur</p>
                    <p className="text-white font-bold text-xl">
                      {dailyWeather[0].maxTemp.toFixed(1)}°C
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Wind className="w-8 h-8 text-blue-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Vindstyrka</p>
                    <p className="text-white font-bold text-xl">
                      {dailyWeather[0].windSpeed.toFixed(1)} m/s
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <img src="/images/weather_icons/SVG/day_rain.svg" alt="Nederbörd" className="w-8 h-8 object-contain" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Nederbörd</p>
                    <p className="text-white font-bold text-xl">
                      {dailyWeather[0].precipitation.toFixed(1)} mm
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <img src="/images/weather_icons/SVG/cloudy.svg" alt="Molntäcke" className="w-8 h-8 object-contain" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Molntäcke</p>
                    <p className="text-white font-bold text-xl">
                      {dailyWeather[0].cloudCover.toFixed(0)}%
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-400/20 to-teal-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                      <Compass className="w-8 h-8 text-green-400" />
                    </div>
                    <p className="text-white/60 text-sm mb-1">Lufttryck</p>
                    <p className="text-white font-bold text-xl">
                      {dailyWeather[0].avgPressure ? `${Math.round(dailyWeather[0].avgPressure)} hPa` : 'N/A'}
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
                      {getWeatherIcon(day.icon, 'w-12 h-12', day.hourlyData[Math.floor(day.hourlyData.length/2)]?.time)}
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
                        <span className="text-xs text-white/50">({Math.round(day.windDirection)}°)</span>
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
                          // FMI-data representerar redan svensk tid, även om tidsstämplarna har Z-suffix
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
                                <div className="grid grid-cols-7 gap-2 sm:gap-4 text-xs font-medium items-center">
                                  <div className="col-span-2 text-blue-200 font-semibold text-sm uppercase tracking-wide">
                                    {item.dayName}
                                  </div>
                                  <div className="col-span-1 text-white/90 text-center">Temp</div>
                                  <div className="col-span-1 text-white/90 text-center">mm</div>
                                  <div className="col-span-1 text-white/90 text-center">m/s (by)</div>
                                  <div className="col-span-1 text-white/90 text-center">Moln</div>
                                  <div className="col-span-1 text-white/90 text-center">Lufttryck</div>
                                </div>
                              </div>
                            );
                          }
                          
                          if (item.type === 'sunrise') {
                            return (
                              <div key={item.key} className="grid grid-cols-7 gap-2 sm:gap-4 items-center py-2 px-2 bg-orange-500/10 rounded-xl border-l-2 border-orange-400/50">
                                <div className="col-span-1 text-orange-300 text-sm font-medium">{item.time}</div>
                                <div className="col-span-1 flex justify-center">
                                  <Sunrise className="w-5 h-5 text-orange-400" />
                                </div>
                                <div className="col-span-5 text-orange-200 text-sm">Soluppgång</div>
                              </div>
                            );
                          }
                          
                          if (item.type === 'sunset') {
                            return (
                              <div key={item.key} className="grid grid-cols-7 gap-2 sm:gap-4 items-center py-2 px-2 bg-orange-600/10 rounded-xl border-l-2 border-orange-500/50">
                                <div className="col-span-1 text-orange-400 text-sm font-medium">{item.time}</div>
                                <div className="col-span-1 flex justify-center">
                                  <Sunset className="w-5 h-5 text-orange-500" />
                                </div>
                                <div className="col-span-5 text-orange-300 text-sm">Solnedgång</div>
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
                          
                          // Vindriktningspil - FMI ger redan färdig meteorologisk vindriktning
                          const getWindArrow = (direction: number | null) => {
                            if (!direction) return '↑';
                            const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
                            return arrows[Math.round(direction / 45) % 8];
                          };
                          
                          // Vindriktning som text för bättre förståelse
                          const getWindDirectionText = (direction: number | null) => {
                            if (!direction) return 'Vindstilla';
                            const directions = ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'];
                            const index = Math.round(direction / 45) % 8;
                            return `${directions[index]} (${Math.round(direction)}°)`;
                          };
                          
                          return (
                            <div key={item.key} className="grid grid-cols-7 gap-2 sm:gap-4 items-center py-2 px-2 hover:bg-white/5 rounded-xl transition-colors text-sm">
                              {/* Tid */}
                              <div className="col-span-1 text-white/90 font-medium">
                                {formatHour(hour.time)}
                              </div>
                              
                              {/* Väderikon */}
                              <div className="col-span-1 flex justify-center">
                                {getWeatherIcon(hourIcon, 'w-8 h-8', hour.time)}
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
                                <span>{hour.windSpeed ? `${Math.round(hour.windSpeed)}` : '--'}</span>
                                {hour.windGust && hour.windGust > (hour.windSpeed || 0) + 2 && (
                                  <span className="text-xs text-white/60">({Math.round(hour.windGust)})</span>
                                )}
                              </div>
                      
                              {/* Molntäcke */}
                              <div className="col-span-1 text-center text-white/80">
                                {hour.cloudCover ? `${Math.round(hour.cloudCover)}%` : '--'}
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
              <img src="/images/weather_icons/SVG/day_clear.svg" alt="Väder" className="w-16 h-16 object-contain mx-auto mb-6 opacity-20" />
              <h2 className="text-2xl sm:text-3xl font-light text-white mb-4">Välkommen till väderprognosen</h2>
              <p className="text-white/70 text-lg">Sök efter en stad eller kommun för att se väderprognos från FMI HARMONIE</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 