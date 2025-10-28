'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, MapPin, Droplets, Wind, Thermometer, Loader2, ChevronDown, ChevronUp, Download, ExternalLink, Calendar, Navigation as NavIcon, Eye, Compass, Sunrise, Sunset, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { SMHIWaterBody } from '@/lib/smhiWaterService';
import type { WaterBodyData } from '@/lib/waterBodyDataFetcher';
import { getSwedishWaterTypeName, formatWaterType } from '@/lib/waterTypeTranslation';
import * as turf from '@turf/turf';

interface WeatherData {
  time: string;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  symbol: string | null;
}

interface SvarMap {
  name: string;
  path: string;
  area?: string;
  type: 'tif' | 'jpg' | 'png' | 'pdf';
}

interface SvarMapResponse {
  sjoid: string;
  lakeName: string;
  maps: SvarMap[];
  cached: boolean;
}

interface WaterDetailModalProps {
  waterBody: SMHIWaterBody;
  onClose: () => void;
  waterData?: WaterBodyData | null;
}

export default function WaterDetailModal({ waterBody, onClose, waterData }: WaterDetailModalProps) {
  const [weatherData, setWeatherData] = useState<WeatherData[] | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [maps, setMaps] = useState<SvarMap[] | null>(null);
  const [selectedMapIndex, setSelectedMapIndex] = useState(0);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [viewingMap, setViewingMap] = useState(false);
  const [sjoid, setSjoid] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const countryNames = {
    'SE': 'Sverige',
    'NO': 'Norge',
    'DK': 'Danmark',
    'FI': 'Finland'
  };

  const getDisplayType = () => {
    const swedishType = getSwedishWaterTypeName(waterBody.name, waterBody.water_type);
    return formatWaterType(swedishType);
  };

  // Fetch weather
  useEffect(() => {
    const fetchWeather = async () => {
      const lat = waterBody?.coordinates?.[0];
      const lon = waterBody?.coordinates?.[1];
      if (typeof lat !== 'number' || typeof lon !== 'number') return;
      
      setLoadingWeather(true);
      try {
        const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.forecasts) {
            // Use full forecast for slider and hourly/day navigation
            setWeatherData(data.data.forecasts);
          }
        }
      } catch (error) {
        console.error('Failed to fetch weather:', error);
      } finally {
        setLoadingWeather(false);
      }
    };

    fetchWeather();
  }, [waterBody.coordinates]);

  // Fetch SVAR maps
  useEffect(() => {
    const fetchMaps = async () => {
      setLoadingMaps(true);
      try {
        const lat = waterBody?.coordinates?.[0];
        const lon = waterBody?.coordinates?.[1];
        if (typeof lat !== 'number' || typeof lon !== 'number') return;

        // First, lookup SJOID using our lookup service
        const lookupResponse = await fetch(`/api/svar/lookup?name=${encodeURIComponent(waterBody.name)}&lat=${lat}&lon=${lon}`);
        
        if (lookupResponse.ok) {
          const lookupData = await lookupResponse.json();
          
          if (lookupData.sjoid) {
            setSjoid(lookupData.sjoid);
            
            // Now fetch maps for this SJOID
            const mapsResponse = await fetch(`/api/svar/get-maps?sjoid=${lookupData.sjoid}`);
            
            if (mapsResponse.ok) {
              const mapsData: SvarMapResponse = await mapsResponse.json();
              if (mapsData.maps && mapsData.maps.length > 0) {
                setMaps(mapsData.maps);
              } else {
                setMaps([]);
              }
            }
          } else {
            setMaps([]);
          }
        } else {
          setMaps([]);
        }
      } catch (error) {
        console.error('Failed to fetch maps:', error);
        setMaps([]);
      } finally {
        setLoadingMaps(false);
      }
    };

    fetchMaps();
  }, [waterBody.name, waterBody.coordinates]);

  const getWindDirection = (degrees: number | null) => {
    if (degrees === null) return 'N/A';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  const currentWeather = weatherData?.[0];
  const [selectedDay, setSelectedDay] = useState(0);
  const [showHourly, setShowHourly] = useState(false);
  const [selectedHourIndex, setSelectedHourIndex] = useState(0);

  const mapYrSymbolToFile = (yrSymbol: string): string | null => {
    const symbolMap: Record<string, string> = {
      'clearsky_day': '01d', 'clearsky_night': '01n', 'clearsky_polartwilight': '01m',
      'fair_day': '02d', 'fair_night': '02n', 'fair_polartwilight': '02m',
      'partlycloudy_day': '03d', 'partlycloudy_night': '03n', 'partlycloudy_polartwilight': '03m',
      'cloudy': '04',
      'rainshowers_day': '05d', 'rainshowers_night': '05n', 'rainshowers_polartwilight': '05m',
      'rainshowersandthunder_day': '06d', 'rainshowersandthunder_night': '06n', 'rainshowersandthunder_polartwilight': '06m',
      'sleetshowers_day': '07d', 'sleetshowers_night': '07n', 'sleetshowers_polartwilight': '07m',
      'snowshowers_day': '08d', 'snowshowers_night': '08n', 'snowshowers_polartwilight': '08m',
      'rain': '09', 'heavyrain': '10', 'heavyrainandthunder': '11', 'sleet': '12', 'snow': '13', 'snowandthunder': '14', 'fog': '15',
      'sleetshowersandthunder_day': '20d', 'sleetshowersandthunder_night': '20n', 'sleetshowersandthunder_polartwilight': '20m',
      'snowshowersandthunder_day': '21d', 'snowshowersandthunder_night': '21n', 'snowshowersandthunder_polartwilight': '21m',
      'rainandthunder': '22', 'sleetandthunder': '23',
      'lightrainshowersandthunder_day': '24d', 'lightrainshowersandthunder_night': '24n', 'lightrainshowersandthunder_polartwilight': '24m',
      'heavyrainshowersandthunder_day': '25d', 'heavyrainshowersandthunder_night': '25n', 'heavyrainshowersandthunder_polartwilight': '25m',
      'lightssleetshowersandthunder_day': '26d', 'lightssleetshowersandthunder_night': '26n', 'lightssleetshowersandthunder_polartwilight': '26m',
      'heavysleetshowersandthunder_day': '27d', 'heavysleetshowersandthunder_night': '27n', 'heavysleetshowersandthunder_polartwilight': '27m',
      'lightssnowshowersandthunder_day': '28d', 'lightssnowshowersandthunder_night': '28n', 'lightssnowshowersandthunder_polartwilight': '28m',
      'heavysnowshowersandthunder_day': '29d', 'heavysnowshowersandthunder_night': '29n', 'heavysnowshowersandthunder_polartwilight': '29m',
      'lightrainandthunder': '30', 'lightsleetandthunder': '31', 'heavysleetandthunder': '32', 'lightsnowandthunder': '33', 'heavysnowandthunder': '34',
      'lightrainshowers_day': '40d', 'lightrainshowers_night': '40n', 'lightrainshowers_polartwilight': '40m',
      'heavyrainshowers_day': '41d', 'heavyrainshowers_night': '41n', 'heavyrainshowers_polartwilight': '41m',
      'lightsleetshowers_day': '42d', 'lightsleetshowers_night': '42n', 'lightsleetshowers_polartwilight': '42m',
      'heavysleetshowers_day': '43d', 'heavysleetshowers_night': '43n', 'heavysleetshowers_polartwilight': '43m',
      'lightsnowshowers_day': '44d', 'lightsnowshowers_night': '44n', 'lightsnowshowers_polartwilight': '44m',
      'heavysnowshowers_day': '45d', 'heavysnowshowers_night': '45n', 'heavysnowshowers_polartwilight': '45m',
      'lightrain': '46', 'lightsleet': '47', 'heavysleet': '48', 'lightsnow': '49', 'heavysnow': '50',
    };
    return symbolMap[yrSymbol] || null;
  };

  const calculateSunTimes = (date: Date, lat: number, lon: number) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
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
    const cos_hour_angle = (Math.sin(altitude_angle * Math.PI / 180) - Math.sin(lat_rad) * sin_delta) / (Math.cos(lat_rad) * cos_delta);
    if (Math.abs(cos_hour_angle) > 1) {
      if (cos_hour_angle > 1) return { sunrise: 12, sunset: 12 };
      return { sunrise: 0, sunset: 24 };
    }
    const hour_angle_rad = Math.acos(cos_hour_angle);
    const hour_angle_deg = hour_angle_rad * 180 / Math.PI;
    const J_rise = J_transit - hour_angle_deg / 360;
    const J_set = J_transit + hour_angle_deg / 360;
    const unix_rise = (J_rise - 2440587.5) * 86400;
    const unix_set = (J_set - 2440587.5) * 86400;
    const sunrise_date = new Date(unix_rise * 1000);
    const sunset_date = new Date(unix_set * 1000);
    const isDST = date.getMonth() > 2 && date.getMonth() < 10;
    const timezone_offset = isDST ? 2 : 1;
    const sunrise_swedish = new Date(sunrise_date.getTime() + timezone_offset * 3600 * 1000);
    const sunset_swedish = new Date(sunset_date.getTime() + timezone_offset * 3600 * 1000);
    const sunrise_hours = sunrise_swedish.getUTCHours() + sunrise_swedish.getUTCMinutes() / 60;
    const sunset_hours = sunset_swedish.getUTCHours() + sunset_swedish.getUTCMinutes() / 60;
    return { sunrise: sunrise_hours, sunset: sunset_hours };
  };

  const getWeatherIcon = (fallbackType: string, size: string = 'w-8 h-8', time?: string, yrSymbol?: string | null) => {
    if (yrSymbol) {
      const fileId = mapYrSymbolToFile(yrSymbol);
      if (fileId) {
        const iconPath = `/images/weather_symbols/shadows/svg/${fileId}.svg`;
        return <img src={iconPath} alt={`Weather: ${yrSymbol}`} className={`${size} object-contain`} onError={(e) => { (e.target as HTMLImageElement).src = '/images/weather_symbols/shadows/svg/01d.svg'; }} />;
      }
    }
    const isNight = time ? (() => {
      const date = new Date(time);
      const hour = date.getHours() + date.getMinutes() / 60;
      const lat = waterBody?.coordinates?.[0] || 60;
      const lon = waterBody?.coordinates?.[1] || 15;
      const { sunrise, sunset } = calculateSunTimes(date, lat, lon);
      return hour < sunrise || hour >= sunset;
    })() : false;
    let fallbackSymbol = isNight ? '01n' : '01d';
    if (fallbackType === 'overcast') fallbackSymbol = '04';
    if (fallbackType === 'cloudy') fallbackSymbol = isNight ? '03n' : '03d';
    if (fallbackType === 'partly-cloudy') fallbackSymbol = isNight ? '03n' : '03d';
    if (fallbackType === 'rain') fallbackSymbol = isNight ? '05n' : '05d';
    if (fallbackType === 'pure-rain') fallbackSymbol = '09';
    if (fallbackType === 'snow') fallbackSymbol = isNight ? '08n' : '08d';
    if (fallbackType === 'pure-snow') fallbackSymbol = '13';
    if (fallbackType === 'fog' || fallbackType === 'mist') fallbackSymbol = '15';
    const iconPath = `/images/weather_symbols/shadows/svg/${fallbackSymbol}.svg`;
    return <img src={iconPath} alt={fallbackType} className={`${size} object-contain`} />;
  };

  const dailyWeather = useMemo(() => {
    if (!weatherData || weatherData.length === 0) return [] as any[];
    const dailyMap = new Map<string, WeatherData[]>();
    weatherData.forEach(f => {
      const dateKey = new Date(f.time).toISOString().split('T')[0];
      if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, []);
      dailyMap.get(dateKey)!.push(f);
    });
    return Array.from(dailyMap.entries()).map(([dateKey, hourly]) => {
      const temps = hourly.map(h => h.temperature).filter((t): t is number => t !== null);
      const windSpeeds = hourly.map(h => h.windSpeed).filter((w): w is number => w !== null);
      const clouds = hourly.map(h => h.cloudCover).filter((c): c is number => c !== null);
      const precs = hourly.map(h => h.precipitation || 0);
      const pressures = hourly.map(h => h.pressure).filter((p): p is number => p !== null);
      const humidities = hourly.map(h => h.humidity).filter((h): h is number => h !== null);
      const totalPrec = precs.reduce((a, b) => a + b, 0);
      const avgCloud = clouds.length ? clouds.reduce((a, b) => a + b, 0) / clouds.length : 0;
      const avgWind = windSpeeds.length ? windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length : 0;
      const avgPressure = pressures.length ? pressures.reduce((a, b) => a + b, 0) / pressures.length : null;
      const avgHumidity = humidities.length ? humidities.reduce((a, b) => a + b, 0) / humidities.length : null;
      const primarySymbol = hourly[Math.floor(hourly.length / 2)]?.symbol || hourly.find(h => h.symbol)?.symbol || null;
      return {
        date: dateKey,
        maxTemp: temps.length ? Math.max(...temps) : 0,
        minTemp: temps.length ? Math.min(...temps) : 0,
        precipitation: totalPrec,
        windSpeed: avgWind,
        cloudCover: avgCloud,
        avgPressure,
        avgHumidity,
        primarySymbol,
        hourlyData: hourly.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
      } as any;
    });
  }, [weatherData]);

  useEffect(() => {
    if ((dailyWeather as any[]).length > 0) {
      setSelectedDay(0);
      setSelectedHourIndex(0);
    }
  }, [dailyWeather.length]);

  // Helpers: hour/day navigation preserving clock time
  const getTargetHourOfDay = (): number => {
    const day = (dailyWeather as any[])[selectedDay];
    if (!day || !day.hourlyData || day.hourlyData.length === 0) return 0;
    const time = new Date(day.hourlyData[Math.min(selectedHourIndex, day.hourlyData.length - 1)].time);
    return time.getHours();
  };

  const setDayKeepingHour = (newDay: number) => {
    const days = (dailyWeather as any[]);
    if (newDay < 0 || newDay >= days.length) return;
    const targetHour = getTargetHourOfDay();
    const targetDay = days[newDay];
    if (!targetDay || !targetDay.hourlyData || targetDay.hourlyData.length === 0) {
      setSelectedDay(newDay);
      setSelectedHourIndex(0);
      return;
    }
    let nearestIdx = 0;
    let bestDiff = Infinity;
    targetDay.hourlyData.forEach((h: any, idx: number) => {
      const hour = new Date(h.time).getHours();
      const diff = Math.abs(hour - targetHour);
      if (diff < bestDiff) { bestDiff = diff; nearestIdx = idx; }
    });
    setSelectedDay(newDay);
    setSelectedHourIndex(nearestIdx);
  };

  const stepHour = (delta: number) => {
    const days = (dailyWeather as any[]);
    if (days.length === 0) return;
    let day = selectedDay;
    let hour = selectedHourIndex + delta;
    // Move across day boundaries
    while (day >= 0 && day < days.length) {
      const len = days[day].hourlyData.length;
      if (hour < 0) { day -= 1; if (day < 0) { day = 0; hour = 0; break; } hour = days[day].hourlyData.length - 1; continue; }
      if (hour >= len) { day += 1; if (day >= days.length) { day = days.length - 1; hour = days[day].hourlyData.length - 1; break; } hour = 0; continue; }
      break;
    }
    setSelectedDay(day);
    setSelectedHourIndex(hour);
  };

  // Build global pressure series for graph
  const pressureSeries = useMemo(() => {
    const out: { t: Date; p: number }[] = [];
    (dailyWeather as any[]).forEach((d: any) => {
      d.hourlyData.forEach((h: any) => {
        if (typeof h.pressure === 'number') out.push({ t: new Date(h.time), p: h.pressure });
      });
    });
    return out;
  }, [dailyWeather]);

  const globalIndex = useMemo(() => {
    const days = (dailyWeather as any[]);
    let idx = 0;
    for (let i = 0; i < days.length; i++) {
      if (i < selectedDay) idx += days[i].hourlyData.length;
    }
    return idx + Math.min(selectedHourIndex, days[selectedDay]?.hourlyData?.length ? days[selectedDay].hourlyData.length - 1 : 0);
  }, [dailyWeather, selectedDay, selectedHourIndex]);

  const pressureTrend = useMemo(() => {
    if (pressureSeries.length === 0) return { label: 'N/A', color: 'text-white/60' };
    const i = Math.max(0, Math.min(pressureSeries.length - 1, globalIndex));
    const ahead = pressureSeries[Math.min(pressureSeries.length - 1, i + 3)]?.p ?? pressureSeries[i].p;
    const behind = pressureSeries[Math.max(0, i - 3)]?.p ?? pressureSeries[i].p;
    const delta = (ahead - behind); // approx 6h window
    if (delta >= 4) return { label: 'Stigande (kraftigt)', color: 'text-emerald-400' };
    if (delta >= 1) return { label: 'Stigande (svagt)', color: 'text-emerald-300' };
    if (delta <= -4) return { label: 'Sjunkande (kraftigt)', color: 'text-rose-400' };
    if (delta <= -1) return { label: 'Sjunkande (svagt)', color: 'text-rose-300' };
    return { label: 'Stabilt', color: 'text-slate-300' };
  }, [pressureSeries, globalIndex]);

  const PressureGraph = () => {
    if (pressureSeries.length < 2) return null;
    const width = 560; const height = 100; const pad = 8;
    const ps = pressureSeries.map(d => d.p);
    const min = Math.min(...ps) - 2;
    const max = Math.max(...ps) + 2;
    const scaleX = (i: number) => pad + (i * (width - 2 * pad)) / (pressureSeries.length - 1);
    const scaleY = (p: number) => pad + (height - 2 * pad) * (1 - (p - min) / (max - min || 1));
    const pathD = pressureSeries.map((d, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.p)}`).join(' ');
    const cx = scaleX(globalIndex);
    const cy = scaleY(pressureSeries[Math.max(0, Math.min(pressureSeries.length - 1, globalIndex))].p);
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24">
        <defs>
          <linearGradient id="pg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={`${pathD}`} fill="none" stroke="#93c5fd" strokeWidth="2" />
        <path d={`M ${pad} ${height - pad} ${pathD.replace(/^M/, 'L')} L ${width - pad} ${height - pad} Z`} fill="url(#pg)" opacity="0.25" />
        <line x1={cx} y1={pad} x2={cx} y2={height - pad} stroke="#ffffff" strokeOpacity="0.4" strokeDasharray="4 4" />
        <circle cx={cx} cy={cy} r="3" fill="#ffffff" />
      </svg>
    );
  };

  // Wind field preview (simple oriented streaks)
  const WindFieldPreview = ({ direction, speed }: { direction: number | null; speed: number | null }) => {
    const angle = ((direction ?? 0) + 90) * Math.PI / 180; // canvas angle (to-direction)
    const stroke = speed ? Math.min(1, Math.max(0.4, speed / 10)) : 0.6;
    return (
      <div className="bg-white/5 rounded-2xl border border-white/10 p-3">
        <div className="text-white/80 text-sm mb-2">Vindfält (visualisering)</div>
        <canvas
          className="w-full h-36"
          ref={(el) => {
            if (!el) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = el.getBoundingClientRect();
            el.width = Math.floor(rect.width * dpr);
            el.height = Math.floor(rect.height * dpr);
            const ctx = el.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, el.width, el.height);
            ctx.save();
            ctx.scale(dpr, dpr);
            // background subtle gradient
            const g = ctx.createLinearGradient(0, 0, rect.width, rect.height);
            g.addColorStop(0, 'rgba(59,130,246,0.10)');
            g.addColorStop(1, 'rgba(6,182,212,0.06)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, rect.width, rect.height);
            // draw streaks
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            const spacing = 12;
            const length = 22 + (speed ? Math.min(24, speed * 2.5) : 12);
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1.4;
            for (let y = -length; y < rect.height + length; y += spacing) {
              for (let x = -length; x < rect.width + length; x += spacing) {
                const jitter = ((x * 13.37 + y * 7.11) % 8) - 4;
                ctx.beginPath();
                ctx.moveTo(x + jitter, y + jitter);
                ctx.lineTo(x + jitter + dx * length, y + jitter + dy * length);
                ctx.stroke();
              }
            }
            // emphasize center arrow
            ctx.strokeStyle = 'rgba(255,255,255,1.0)';
            ctx.lineWidth = 2.2;
            const cx = rect.width / 2, cy = rect.height / 2;
            ctx.beginPath();
            ctx.moveTo(cx - dx * (length * 0.2), cy - dy * (length * 0.2));
            ctx.lineTo(cx + dx * (length * 1.1), cy + dy * (length * 1.1));
            ctx.stroke();
            ctx.restore();
          }}
        />
      </div>
    );
  };

// Mini map with MapLibre + particle overlay
  const WaterMiniWindMap = ({ geometry, direction, speed, name }: { geometry: any; direction: number | null; speed: number | null; name: string }) => {
    const containerRef = useMemo(() => ({ current: null as HTMLDivElement | null }), []);
    const canvasRef = useMemo(() => ({ current: null as HTMLCanvasElement | null }), []);
    const mapRef = useMemo(() => ({ current: null as maplibregl.Map | null }), []);
    const [isLoading, setIsLoading] = useState(true);
    const [mapOpacity, setMapOpacity] = useState(0);

    // init map once
    useEffect(() => {
      const container = containerRef.current; if (!container || mapRef.current) return;
      const map = new maplibregl.Map({
        container,
        style: {
          version: 8,
          glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
          sources: {
            'esri-world-imagery': {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256
            }
          },
          layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } },
            { id: 'esri', type: 'raster', source: 'esri-world-imagery', paint: { 'raster-brightness-max': 0.6, 'raster-saturation': -0.2, 'raster-contrast': 0.1 } }
          ]
        },
        interactive: false,
        center: [15, 62], zoom: 5
      });
      mapRef.current = map;
      map.once('idle', () => {
        setIsLoading(false);
        // Fade in the map when first ready
        requestAnimationFrame(() => setMapOpacity(1));
      });
      return () => { try { map.remove(); } catch {} mapRef.current = null; };
    }, []);

    // set geometry, fit and flash
    useEffect(() => {
      const map = mapRef.current; if (!map || !geometry) return;
      const srcId = 'wind-geom'; const fillId = 'wind-geom-fill'; const lineId = 'wind-geom-line';
      const data = { type: 'Feature', properties: {}, geometry } as any;

      const setup = () => {
        if (!map.getSource(srcId)) {
          map.addSource(srcId, { type: 'geojson', data });
          map.addLayer({ id: fillId, type: 'fill', source: srcId, paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.18 } });
          map.addLayer({ id: lineId, type: 'line', source: srcId, paint: { 'line-color': '#22d3ee', 'line-width': 2 } });
        } else {
          (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(data);
        }
        try {
          const b = turf.bbox(geometry) as [number, number, number, number];
          map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 10, duration: 0 });
        } catch {}
        // Fade-in instead of blinking while rendering new frame
        setIsLoading(true);
        setMapOpacity(0);
        map.once('idle', () => {
          setIsLoading(false);
          requestAnimationFrame(() => setMapOpacity(1));
        });
      };

      if ((map as any).isStyleLoaded && map.isStyleLoaded()) setup();
      else map.once('load', setup);
    }, [geometry, direction]);

    // particle overlay synced with map viewport
    useEffect(() => {
      const canvas = canvasRef.current; const map = mapRef.current; if (!canvas || !map) return;
      const dpr = window.devicePixelRatio || 1;
      const resize = () => { const r = canvas.getBoundingClientRect(); canvas.width = Math.floor(r.width * dpr); canvas.height = Math.floor(r.height * dpr); };
      resize();
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const rads = (direction ?? 0) * Math.PI / 180; const baseDx = -Math.sin(rads), baseDy = Math.cos(rads);
      const speedPx = (speed ? Math.max(0.1, Math.min(0.8, speed / 5)) : 0.3);
      const particles: { x: number; y: number; life: number }[] = Array.from({ length: 60 }, () => ({ x: Math.random() * canvas.width / dpr, y: Math.random() * canvas.height / dpr, life: 60 + Math.random() * 60 }));
      let raf = 0;
      let frame = 0;
      // trail layer for motion effect
      const trail = document.createElement('canvas');
      trail.width = canvas.width; trail.height = canvas.height;
      const tctx = trail.getContext('2d');
      const draw = () => {
        const w = canvas.width, h = canvas.height;
        // fade trails
        if (tctx) {
          tctx.globalCompositeOperation = 'destination-out';
          tctx.fillStyle = 'rgba(0,0,0,0.06)';
          tctx.fillRect(0, 0, w, h);
          tctx.globalCompositeOperation = 'source-over';
          tctx.strokeStyle = 'rgba(255,255,255,0.9)'; tctx.lineWidth = 1.0;
        }
        // subtle gust drift
        const driftX = Math.sin(frame * 0.01) * 0.2;
        const driftY = Math.cos(frame * 0.013) * 0.2;
        const dx = baseDx + driftX;
        const dy = baseDy + driftY;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i]; const x2 = p.x + dx * 8; const y2 = p.y + dy * 8;
          if (tctx) { tctx.beginPath(); tctx.moveTo(p.x * dpr, p.y * dpr); tctx.lineTo(x2 * dpr, y2 * dpr); tctx.stroke(); }
          p.x += dx * speedPx; p.y += dy * speedPx; p.life -= 1;
          if (p.life <= 0 || p.x < 0 || p.x > w / dpr || p.y < 0 || p.y > h / dpr) { p.x = Math.random() * (w / dpr); p.y = Math.random() * (h / dpr); p.life = 60 + Math.random() * 60; }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (tctx) ctx.drawImage(trail, 0, 0);
        frame++;
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
      (canvas as any).__anim = raf;
      const onResize = () => { resize(); };
      window.addEventListener('resize', onResize);
      return () => { cancelAnimationFrame(raf); (canvas as any).__anim = null; window.removeEventListener('resize', onResize); };
    }, [direction, speed, geometry]);

    return (
      <div className="bg-white/5 rounded-2xl border border-white/10 p-3">
        <div className="text-white/80 text-sm mb-2">Vind över {name}</div>
        <div className="relative w-full h-48 overflow-hidden rounded-xl">
          <div
            ref={(el) => (containerRef.current = el)}
            className="absolute inset-0"
            style={{ opacity: mapOpacity, transition: 'opacity 250ms ease-out' }}
          />
          <canvas ref={(el) => (canvasRef.current = el)} className="absolute inset-0 w-full h-full pointer-events-none" />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="w-6 h-6 text-white/80 animate-spin" />
            </div>
          )}
        </div>
      </div>
    );
  };

  // Wind compass component
  const WindCompass = ({ direction, speed }: { direction: number | null; speed: number | null }) => {
    const blowsTo = direction !== null ? (direction + 180) % 360 : 0;
    const dirAbbr = (() => {
      if (direction === null) return '—';
      const dirs = ['N','NÖ','Ö','SÖ','S','SV','V','NV'];
      return dirs[Math.round(direction / 45) % 8];
    })();
  return (
      <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white/80 text-sm">Vindriktning</div>
          <div className="text-white text-sm font-medium">{direction !== null ? `${dirAbbr} • ${Math.round(direction)}°` : 'N/A'}{speed !== null ? ` • ${speed.toFixed(1)} m/s` : ''}</div>
        </div>
        <div className="flex items-center justify-center py-2">
          <svg width="120" height="120" viewBox="0 0 120 120" className="text-white">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
            <g transform={`translate(60,60) rotate(${((direction ?? 0) + 180) % 360})`}>
              <path d="M 0 -40 L 6 -26 L 0 -30 L -6 -26 Z" fill="#fff" />
              <rect x="-2" y="-26" width="4" height="46" rx="2" fill="#fff" fillOpacity="0.85" />
            </g>
            <text x="60" y="14" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">N</text>
            <text x="106" y="64" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">Ö</text>
            <text x="60" y="116" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">S</text>
            <text x="14" y="64" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">V</text>
          </svg>
        </div>
      </div>
    );
  };

  // Cleanup any running wind animations on unmount (declare before any early returns)
  useEffect(() => {
    return () => {
      try {
        const canvases = document.querySelectorAll('canvas[data-wind-canvas]');
        canvases.forEach((c) => {
          const anyC = c as any;
          if (anyC.__anim) {
            cancelAnimationFrame(anyC.__anim);
            anyC.__anim = null;
          }
        });
      } catch {}
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[2000] flex items-center justify-center p-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full h-full relative rounded-none md:rounded-2xl md:m-4 overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background video and overlays for Apple/Meta-like UI */}
        <video
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
          style={{ filter: 'brightness(0.15) contrast(1.2) saturate(0.6)' }}
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="/videos/calm-water.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/70 z-0 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-teal-900/20 z-0 pointer-events-none"></div>

        {/* Header */}
        <div className="relative z-10 px-6 py-6 bg-black/30 backdrop-blur-md border-b border-white/10">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="max-w-6xl">
            <div className="flex items-center space-x-3 text-blue-300/80 text-sm font-medium mb-2">
              <MapPin className="w-4 h-4" />
              <span>{getDisplayType()} • {countryNames[waterBody.country]}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-light text-white mb-1">{waterBody.name}</h2>
            {waterBody.place_name && (
              <p className="text-base sm:text-lg text-white/80">{waterBody.place_name}</p>
            )}
          </div>
        </div>

        {/* Content */}
        <div 
          className="relative z-10 flex-1 overflow-y-auto min-h-0 max-h-full p-6 space-y-6"
          onWheel={(e) => e.stopPropagation()}
          style={{ overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weather Section */}
            <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center">
                <Thermometer className="w-5 h-5 mr-2 text-cyan-400" />
                Väder
              </h3>
                <button onClick={() => setShowHourly(!showHourly)} className="text-white/80 hover:text-white text-sm flex items-center">
                  {showHourly ? 'Dölj timme för timme' : 'Visa timme för timme'}
                  <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showHourly ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {loadingWeather ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                </div>
              ) : (weatherData && weatherData.length > 0 && (dailyWeather as any[]).length > 0) ? (
                <div className="space-y-5">
                  {(() => {
                    const now = new Date();
                    const currentDay = (dailyWeather as any[])[selectedDay];
                    const current = currentDay?.hourlyData?.[selectedHourIndex] || weatherData.find(w => Math.abs(new Date(w.time).getTime() - now.getTime()) < 30 * 60 * 1000) || weatherData[0];
                    return (
                      <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
                    <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {getWeatherIcon('current', 'w-12 h-12', current.time, current.symbol)}
                            <div>
                              <div className="text-white text-3xl font-bold">{current.temperature !== null ? `${current.temperature.toFixed(1)}°` : '--'}</div>
                              <div className="text-white/70 text-sm flex items-center gap-3 mt-1">
                                <span className="flex items-center"><Wind className="w-4 h-4 mr-1" /> {current.windSpeed !== null ? `${current.windSpeed.toFixed(1)} m/s${current.windGust ? ` (${current.windGust.toFixed(1)})` : ''}` : '--'}</span>
                                <span className="flex items-center"><Droplets className="w-4 h-4 mr-1" /> {current.precipitation ? `${current.precipitation.toFixed(1)} mm` : '0 mm'}</span>
                              </div>
                        </div>
                          </div>
                          <div className="grid grid-cols-4 gap-3 text-center">
                            <div>
                              <p className="text-white/60 text-xs">Vind</p>
                              <div className="flex items-center justify-center mt-1">
                                <svg width="28" height="28" viewBox="0 0 28 28" className="text-white/90">
                                  <circle cx="14" cy="14" r="13" fill="none" stroke="rgba(255,255,255,0.2)" />
                                  <g transform={`translate(14,14) rotate(${(((current.windDirection ?? 0) + 180) % 360)})`}>
                                    <path d="M 0 -9 L 3 -4 L 0 -6 L -3 -4 Z" fill="#fff" />
                                    <rect x="-1" y="-4" width="2" height="10" rx="1" fill="#fff" />
                                  </g>
                                </svg>
                              </div>
                            </div>
                            <div>
                              <p className="text-white/60 text-xs">Moln</p>
                              <p className="text-white text-base font-semibold">{current.cloudCover !== null ? `${Math.round(current.cloudCover)}%` : '--'}</p>
                            </div>
                            <div>
                              <p className="text-white/60 text-xs">Lufttryck</p>
                              <p className="text-white text-base font-semibold">{current.pressure !== null ? `${Math.round(current.pressure)} hPa` : 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-white/60 text-xs">Luftfukt</p>
                              <p className="text-white text-base font-semibold">{current.humidity !== null ? `${Math.round(current.humidity)}%` : 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-white/70 text-sm">
                          {(() => {
                            const day = (dailyWeather as any[])[selectedDay];
                            if (!day) return null;
                            const d = new Date(day.date);
                            const dateStr = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
                            const timeStr = new Date(current.time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
                            return <span>{dateStr} • {timeStr}</span>;
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setDayKeepingHour(Math.max(0, selectedDay - 1))} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white flex items-center">
                        <ChevronLeft className="w-4 h-4" />
                        <span className="ml-1 text-sm">Dag</span>
                      </button>
                      <button onClick={() => setDayKeepingHour(Math.min((dailyWeather as any[]).length - 1, selectedDay + 1))} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white flex items-center">
                        <span className="mr-1 text-sm">Dag</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => stepHour(-1)} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white flex items-center">
                        <ChevronLeft className="w-4 h-4" />
                        <span className="ml-1 text-sm">Tim</span>
                      </button>
                      <button onClick={() => stepHour(1)} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white flex items-center">
                        <span className="mr-1 text-sm">Tim</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {(dailyWeather as any[])[selectedDay]?.hourlyData && (dailyWeather as any[])[selectedDay].hourlyData.length > 0 && (
                    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <div className="flex items-center gap-3 mb-2 text-white/80 text-sm">
                        <Clock className="w-4 h-4" />
                        <span>{new Date((dailyWeather as any[])[selectedDay].hourlyData[selectedHourIndex]?.time || (dailyWeather as any[])[selectedDay].hourlyData[0].time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      <input
                        type="range"
                        min={0}
                        max={(dailyWeather as any[])[selectedDay].hourlyData.length - 1}
                        value={Math.min(selectedHourIndex, (dailyWeather as any[])[selectedDay].hourlyData.length - 1)}
                        onChange={(e) => setSelectedHourIndex(Number(e.target.value))}
                        className="w-full accent-cyan-400"
                      />
                        </div>
                  )}

                  {showHourly && (dailyWeather as any[])[selectedDay] && (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {(dailyWeather as any[])[selectedDay].hourlyData.map((h: any, idx: number) => (
                        <div key={idx} className={`grid grid-cols-8 gap-2 items-center py-2 px-2 rounded-xl ${idx === selectedHourIndex ? 'bg-white/12' : 'bg-white/5'} border border-white/10`}>
                          <div className="col-span-1 text-white/90 text-sm font-medium">{new Date(h.time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</div>
                          <div className="col-span-1 flex justify-center">{getWeatherIcon('hour', 'w-8 h-8', h.time, h.symbol)}</div>
                          <div className="col-span-1 text-center text-white font-semibold">{h.temperature !== null ? `${Math.round(h.temperature)}°` : '--'}</div>
                          <div className="col-span-1 text-center text-white/80">{h.precipitation && h.precipitation > 0 ? h.precipitation.toFixed(1) : '0'}</div>
                          <div className="col-span-1 text-center text-white/80 flex items-center justify-center gap-2">
                            <svg width="18" height="18" viewBox="0 0 28 28" className="text-white/90">
                              <g transform={`translate(14,14) rotate(${(((h.windDirection ?? 0) + 180) % 360)})`}>
                                <path d="M 0 -9 L 3 -4 L 0 -6 L -3 -4 Z" fill="#fff" />
                                <rect x="-1" y="-4" width="2" height="10" rx="1" fill="#fff" />
                              </g>
                            </svg>
                            <span>{h.windSpeed !== null ? `${Math.round(h.windSpeed)} m/s${h.windGust ? ` (${Math.round(h.windGust)})` : ''}` : '--'}</span>
                        </div>
                          <div className="col-span-1 text-center text-white/80">{h.cloudCover !== null ? `${Math.round(h.cloudCover)}%` : '--'}</div>
                          <div className="col-span-1 text-center text-white/80">{h.humidity !== null ? `${Math.round(h.humidity)}%` : '--'}</div>
                          <div className="col-span-1 text-center text-white/80">{h.pressure !== null ? `${Math.round(h.pressure)} hPa` : '--'}</div>
                      </div>
                    ))}
                  </div>
                  )}

                  {/* Pressure graph with trend */}
                  <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white/80 text-sm">Lufttryck (hela prognosen)</div>
                      <div className={`text-sm font-medium ${pressureTrend.color}`}>{pressureTrend.label}</div>
                    </div>
                    <PressureGraph />
                  </div>

                  {/* Wind compass */}
                  {(() => {
                    const day = (dailyWeather as any[])[selectedDay];
                    const hour = day?.hourlyData?.[selectedHourIndex];
                    return hour ? (
                      <>
                        <div className="lg:col-start-2"></div>
                        <WindCompass direction={hour.windDirection ?? null} speed={hour.windSpeed ?? null} />
                      </>
                    ) : null;
                  })()}
                </div>
              ) : (
                <div className="text-slate-400 text-center py-8">Ingen väderdata tillgänglig</div>
              )}
            </div>

            {/* Wind over water - right column top */}
            {(() => {
              const day = (dailyWeather as any[])[selectedDay];
              const hour = day?.hourlyData?.[selectedHourIndex];
              return hour ? (
                <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-4 border border-white/10 lg:col-start-2">
                  <WaterMiniWindMap geometry={waterBody.geometry} direction={hour.windDirection ?? null} speed={hour.windSpeed ?? null} name={waterBody.name} />
                </div>
              ) : (
                <div className="lg:col-start-2"></div>
              );
            })()}

            {/* Lake Charts Section */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl p-6 border border-slate-600/30">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-cyan-400" />
                Sjökort
              </h3>

              {loadingMaps ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                </div>
              ) : maps && maps.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm text-slate-300">
                    {maps.length} {maps.length === 1 ? 'karta tillgänglig' : 'kartor tillgängliga'}
                  </div>

                  {maps.length > 1 && (
                    <button
                      onClick={() => setShowMapSelector(!showMapSelector)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg transition-all duration-200"
                    >
                      <span className="text-white font-medium">
                        {maps[selectedMapIndex].area || `Karta ${selectedMapIndex + 1}`}
                      </span>
                      {showMapSelector ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  )}

                  {showMapSelector && maps.length > 1 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {maps.map((map, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setSelectedMapIndex(index);
                            setShowMapSelector(false);
                          }}
                          className={`w-full px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                            index === selectedMapIndex
                              ? 'bg-cyan-600/20 border border-cyan-500/50 text-white'
                              : 'bg-slate-700/20 hover:bg-slate-700/40 text-slate-300'
                          }`}
                        >
                          <div className="font-medium">{map.area || `Karta ${index + 1}`}</div>
                          <div className="text-xs text-slate-400 mt-1">{map.type.toUpperCase()}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Single map: preview inline; Multiple: choose then preview button */}
                  {maps.length === 1 ? (
                    <div className="space-y-3">
                      {['jpg','jpeg','png','webp'].includes(maps[0].type.toLowerCase()) && (
                        <div className="bg-slate-700/20 rounded-xl p-3">
                          <img
                            src={maps[0].path}
                            alt={`Sjökort för ${waterBody.name}`}
                            className="w-full h-auto rounded-lg object-contain"
                          />
                        </div>
                      )}
                      <a
                        href={maps[0].path}
                        download
                        className="inline-flex items-center px-5 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20"
                      >
                        <Download className="w-5 h-5 mr-2" />
                        Ladda ner karta
                      </a>
                    </div>
                  ) : (
                  <button
                    onClick={() => setViewingMap(true)}
                    className="w-full px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20"
                  >
                    <MapPin className="w-5 h-5" />
                      <span>Välj och ladda ner karta</span>
                  </button>
                  )}

                  {sjoid && (
                    <div className="text-xs text-slate-400 text-center">
                      SJOID: {sjoid}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-400 text-center py-8">
                  {loadingMaps ? 'Söker efter sjökort...' : 'Inga sjökort tillgängliga för denna sjö'}
                </div>
              )}
            </div>
          </div>

          {/* VISS Section (if available) */}
          {waterBody.country === 'SE' && waterData?.waterQuality && (() => {
            const hasOxygenData = waterData.waterQuality.oxygen?.status && waterData.waterQuality.oxygen.status !== 'Okänt' && waterData.waterQuality.oxygen.status !== '-';
            const hasNutrientsData = waterData.waterQuality.nutrients?.status && waterData.waterQuality.nutrients.status !== 'Okänt' && waterData.waterQuality.nutrients.status !== '-';
            const hasTransparencyData = waterData.waterQuality.transparency?.light_conditions && waterData.waterQuality.transparency.light_conditions !== 'Okänt' && waterData.waterQuality.transparency.light_conditions !== '-';
            const hasAcidityData = waterData.waterQuality.acidity?.ph_status && waterData.waterQuality.acidity.ph_status !== 'Okänt' && waterData.waterQuality.acidity.ph_status !== '-';
            const hasEcologicalData = waterData.waterQuality.ecological_status && waterData.waterQuality.ecological_status !== 'Okänt' && waterData.waterQuality.ecological_status !== '-';
            const hasAnyData = hasOxygenData || hasNutrientsData || hasTransparencyData || hasAcidityData || hasEcologicalData;
            return hasAnyData;
          })() && (
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl p-6 border border-slate-600/30">
              <h3 className="text-xl font-bold text-white mb-4">Vattenkvalitet (VISS)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {waterData?.waterQuality.oxygen?.status && waterData.waterQuality.oxygen.status !== 'Okänt' && waterData.waterQuality.oxygen.status !== '-' && (
                  <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 border border-cyan-700/30 rounded-xl p-4">
                    <div className="text-cyan-300 text-sm font-medium mb-1">Syrgas</div>
                    <div className="text-white font-semibold">{waterData.waterQuality.oxygen.status}</div>
                  </div>
                )}
                {waterData?.waterQuality.nutrients?.status && waterData.waterQuality.nutrients.status !== 'Okänt' && waterData.waterQuality.nutrients.status !== '-' && (
                  <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/30 rounded-xl p-4">
                    <div className="text-green-300 text-sm font-medium mb-1">Övergödning</div>
                    <div className="text-white font-semibold">{waterData.waterQuality.nutrients.status}</div>
                    {waterData.waterQuality.nutrients.chlorophyll && waterData.waterQuality.nutrients.chlorophyll !== 'Okänt' && (
                      <div className="text-green-400 text-xs mt-1">Alger: {waterData.waterQuality.nutrients.chlorophyll}</div>
                    )}
                  </div>
                )}
                {waterData?.waterQuality.transparency?.light_conditions && waterData.waterQuality.transparency.light_conditions !== 'Okänt' && waterData.waterQuality.transparency.light_conditions !== '-' && (
                  <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/30 rounded-xl p-4">
                    <div className="text-blue-300 text-sm font-medium mb-1">Ljus</div>
                    <div className="text-white font-semibold">{waterData.waterQuality.transparency.light_conditions}</div>
                    {waterData.waterQuality.transparency.visibility && waterData.waterQuality.transparency.visibility !== 'Okänt' && (
                      <div className="text-blue-400 text-xs mt-1">Sikt: {waterData.waterQuality.transparency.visibility}</div>
                    )}
                  </div>
                )}
                {waterData?.waterQuality.acidity?.ph_status && waterData.waterQuality.acidity.ph_status !== 'Okänt' && waterData.waterQuality.acidity.ph_status !== '-' && (
                  <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 border border-yellow-700/30 rounded-xl p-4">
                    <div className="text-yellow-300 text-sm font-medium mb-1">pH</div>
                    <div className="text-white font-semibold">{waterData.waterQuality.acidity.ph_status}</div>
                  </div>
                )}
                {waterData?.waterQuality.ecological_status && waterData.waterQuality.ecological_status !== 'Okänt' && (
                  <div className="md:col-span-2 bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/30 rounded-xl p-4">
                    <div className="text-purple-300 text-sm font-medium mb-1">Ekologisk status</div>
                    <div className="text-white font-semibold">{waterData.waterQuality.ecological_status}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Information Section */}
          {waterBody.water_district && (
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl p-6 border border-slate-600/30">
              <h3 className="text-xl font-bold text-white mb-4">Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-400">Vattendistrikt</div>
                  <div className="text-white font-medium">{waterBody.water_district}</div>
                </div>
                {waterBody.latitude && waterBody.longitude && (
                  <div>
                    <div className="text-slate-400">Koordinater</div>
                    <div className="text-white font-medium">
                      {waterBody.latitude.toFixed(4)}, {waterBody.longitude.toFixed(4)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Map Viewer Overlay */}
        {viewingMap && maps && maps[selectedMapIndex] && (
          <div 
            className="absolute inset-0 bg-black/95 backdrop-blur-sm z-10 flex flex-col"
            onClick={() => setViewingMap(false)}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-600/50">
              <div className="text-white">
                <div className="font-semibold">{waterBody.name}</div>
                <div className="text-sm text-slate-400">{maps[selectedMapIndex].area || 'Sjökort'}</div>
              </div>
              <button
                onClick={() => setViewingMap(false)}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto space-y-4" onClick={(e) => e.stopPropagation()}>
              <img
                src={maps[selectedMapIndex].path}
                alt={`Sjökort för ${waterBody.name}`}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
              <a
                href={maps[selectedMapIndex].path}
                download
                className="inline-flex items-center px-5 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20"
              >
                <Download className="w-5 h-5 mr-2" />
                Ladda ner
              </a>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

