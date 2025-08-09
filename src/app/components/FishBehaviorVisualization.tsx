'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  Activity, Loader2, Thermometer, Droplets, Wind, Clock, Sun, Moon, CloudRain,
  Gauge, Eye, Target, MapPin, BarChart3, CheckCircle, AlertTriangle, Fish, Brain,
  Calendar, Waves, Scale, Settings, TrendingUp, Heart, Zap, Home
} from 'lucide-react';
import { loadFishBehaviorData, FishBehaviorData } from '@/lib/fishBehaviorData';
import { calculateComprehensiveBehavior, ParameterState, CalculatedBehavior, getActivityLevelColor } from '@/lib/dynamicBehaviorCalculations';

interface FishBehaviorVisualizationProps {
  fishName: string;
}

// Animated counter component
function AnimatedCounter({ value, formatter }: { value: number; formatter?: (val: number) => string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 1200;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      setDisplayValue(value * easeOut);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value]);

  return <span>{formatter ? formatter(displayValue) : displayValue.toFixed(1)}</span>;
}

// Funktion för att beräkna soluppgång och solnedgång (från ClockKnob.tsx)
function calculateSunTimes(date: Date) {
  const latitude = 55.6061; // Malmö latitud
  const longitude = 13.0007; // Malmö longitud
  
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Julian Date beräkning
  const a = Math.floor((14 - month) / 12);
  const y = year - a;
  const m = month + 12 * a - 3;
  const JD = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + 1721119;
  
  const n = Math.ceil(JD - 2451545.0 + 0.0008);
  const J_star = n - longitude / 360;
  
  const M_deg = (357.5291 + 0.98560028 * J_star) % 360;
  const M_rad = M_deg * Math.PI / 180;
  
  const C_deg = 1.9148 * Math.sin(M_rad) + 0.0200 * Math.sin(2 * M_rad) + 0.0003 * Math.sin(3 * M_rad);
  const lambda_deg = (M_deg + C_deg + 180 + 102.9372) % 360;
  const lambda_rad = lambda_deg * Math.PI / 180;
  
  const J_transit = 2451545.0 + J_star + 0.0053 * Math.sin(M_rad) - 0.0069 * Math.sin(2 * lambda_rad);
  
  const sin_delta = Math.sin(lambda_rad) * Math.sin(23.4397 * Math.PI / 180);
  const cos_delta = Math.cos(Math.asin(sin_delta));
  
  const altitude_angle = -0.833;
  const lat_rad = latitude * Math.PI / 180;
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
}

// Advanced SVG-based Circadian Rhythm Chart
function CircadianRhythmChart({ activity, sizeClass }: { activity: number; sizeClass: string }) {
  // Beräkna verkliga soltider för idag
  const today = new Date();
  const { sunrise, sunset } = calculateSunTimes(today);
  
  // Skapa realistisk aktivitetskurva baserad på verkliga soltider
  const createActivityData = () => {
    const data = [];
    
    for (let hour = 0; hour < 24; hour += 2) {
      let baseActivity = 0.1; // Grundaktivitet
      
      // Gryning (1 timme före till 2 timmar efter soluppgång)
      if (hour >= sunrise - 1 && hour <= sunrise + 2) {
        const dawnPeak = 1 - Math.abs(hour - sunrise) / 3;
        baseActivity = Math.max(baseActivity, dawnPeak);
      }
      
      // Skymning (2 timmar före till 1 timme efter solnedgång)
      if (hour >= sunset - 2 && hour <= sunset + 1) {
        const duskPeak = 1 - Math.abs(hour - sunset) / 3;
        baseActivity = Math.max(baseActivity, duskPeak);
      }
      
      // Dagtid (mellan gryning och skymning) - beroende på årstid
      if (hour > sunrise + 2 && hour < sunset - 2) {
        const isWinter = today.getMonth() === 11 || today.getMonth() < 3;
        baseActivity = isWinter ? 0.6 : 0.3; // Högre aktivitet på vintern mitt på dagen
      }
      
      // Natt (extremt låg aktivitet)
      if (hour > sunset + 1 || hour < sunrise - 1) {
        baseActivity = 0.05;
      }
      
      // Justera för storleksklass
      if (sizeClass === 'small') {
        baseActivity *= 1.1; // Småabborre något mer aktiv
      } else if (sizeClass === 'large') {
        baseActivity *= 0.9; // Stora abborre något mer selektiv
      }
      
      data.push({ hour, value: Math.min(1.0, baseActivity) });
    }
    
    return data;
  };

  const hourlyData = createActivityData();
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const exactCurrentTime = currentHour + (currentMinutes / 60); // 11.49 för 11:49
  const width = 400;
  const height = 200;
  const padding = 40;

  // Interpolera aktivitet för exakt nuvarande tid
  const getActivityAtTime = (time: number) => {
    // Hitta närmaste datapunkter
    let beforePoint = hourlyData[0];
    let afterPoint = hourlyData[hourlyData.length - 1];
    
    for (let i = 0; i < hourlyData.length - 1; i++) {
      if (hourlyData[i].hour <= time && hourlyData[i + 1].hour >= time) {
        beforePoint = hourlyData[i];
        afterPoint = hourlyData[i + 1];
        break;
      }
    }
    
    // Linjär interpolation
    const ratio = (time - beforePoint.hour) / (afterPoint.hour - beforePoint.hour);
    return beforePoint.value + (afterPoint.value - beforePoint.value) * ratio;
  };

  const currentActivity = getActivityAtTime(exactCurrentTime);

  // Create smooth curve path
  const createPath = (data: typeof hourlyData) => {
    if (data.length === 0) return '';
    
    const points = data.map((d, i) => ({
      x: padding + (i * (width - 2 * padding)) / (data.length - 1),
      y: height - padding - (d.value * (height - 2 * padding))
    }));

    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currentPoint = points[i];
      const controlPoint1X = prevPoint.x + (currentPoint.x - prevPoint.x) * 0.3;
      const controlPoint2X = currentPoint.x - (currentPoint.x - prevPoint.x) * 0.3;
      
      path += ` C ${controlPoint1X} ${prevPoint.y}, ${controlPoint2X} ${currentPoint.y}, ${currentPoint.x} ${currentPoint.y}`;
    }
    
    return path;
  };

  return (
    <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/20 rounded-xl p-6 border border-blue-500/20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" />
          Dygnsrytm - {sizeClass} abborre
        </h3>
        <div className="text-3xl font-light text-blue-400">
          <AnimatedCounter value={activity * 100} formatter={(val) => `${val.toFixed(0)}%`} />
        </div>
      </div>
      
      <svg width={width} height={height} className="w-full">
        {/* Grid lines */}
        <defs>
          <linearGradient id="activityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{stopColor: '#60A5FA', stopOpacity: 0.8}} />
            <stop offset="100%" style={{stopColor: '#3B82F6', stopOpacity: 0.2}} />
          </linearGradient>
        </defs>
        
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((value, i) => (
          <line
            key={i}
            x1={padding}
            y1={height - padding - (value * (height - 2 * padding))}
            x2={width - padding}
            y2={height - padding - (value * (height - 2 * padding))}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}
        
        {/* Vertical grid lines for hours */}
        {hourlyData.map((d, i) => (
          <line
            key={i}
            x1={padding + (i * (width - 2 * padding)) / (hourlyData.length - 1)}
            y1={padding}
            x2={padding + (i * (width - 2 * padding)) / (hourlyData.length - 1)}
            y2={height - padding}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}
        
        {/* Activity curve */}
        <path
          d={createPath(hourlyData)}
          fill="none"
          stroke="#60A5FA"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Area under curve */}
        <path
          d={createPath(hourlyData) + ` L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`}
          fill="url(#activityGradient)"
        />
        
        {/* Data points - alla blåa, inga röda */}
        {hourlyData.map((d, i) => {
          const x = padding + (i * (width - 2 * padding)) / (hourlyData.length - 1);
          const y = height - padding - (d.value * (height - 2 * padding));
          
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={4}
              fill="#60A5FA"
              stroke="#93C5FD"
              strokeWidth="2"
            />
          );
        })}
        
        {/* Exakt nuvarande tid indikator - på aktivitetskurvan */}
        <circle
          cx={padding + ((exactCurrentTime / 24) * (width - 2 * padding))}
          cy={height - padding - (currentActivity * (height - 2 * padding))}
          r={8}
          fill="#EF4444"
          stroke="#FCA5A5"
          strokeWidth="3"
        />
        
        {/* Vertikal linje för exakt nuvarande tid */}
        <line
          x1={padding + ((exactCurrentTime / 24) * (width - 2 * padding))}
          y1={padding}
          x2={padding + ((exactCurrentTime / 24) * (width - 2 * padding))}
          y2={height - padding}
          stroke="#EF4444"
          strokeWidth="2"
          strokeDasharray="3,3"
        />
        
        {/* Hour labels */}
        {hourlyData.map((d, i) => (
          <text
            key={i}
            x={padding + (i * (width - 2 * padding)) / (hourlyData.length - 1)}
            y={height - 10}
            textAnchor="middle"
            className="fill-white/60 text-xs"
          >
            {d.hour.toString().padStart(2, '0')}
          </text>
        ))}
        
        {/* Activity level labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((value, i) => (
          <text
            key={i}
            x={20}
            y={height - padding - (value * (height - 2 * padding)) + 4}
            textAnchor="middle"
            className="fill-white/60 text-xs"
          >
            {Math.round(value * 100)}%
          </text>
        ))}
        
        {/* Sunrise indicator */}
        <line
          x1={padding + ((sunrise / 24) * (width - 2 * padding))}
          y1={padding}
          x2={padding + ((sunrise / 24) * (width - 2 * padding))}
          y2={height - padding}
          stroke="#FFA500"
          strokeWidth="2"
          strokeDasharray="2,2"
        />
        
        {/* Sunset indicator */}
        <line
          x1={padding + ((sunset / 24) * (width - 2 * padding))}
          y1={padding}
          x2={padding + ((sunset / 24) * (width - 2 * padding))}
          y2={height - padding}
          stroke="#FF6B35"
          strokeWidth="2"
          strokeDasharray="2,2"
        />
        
        {/* Current time indicator - NOT NEEDED since we have the red dot */}
        
        {/* Current time label on the red dot */}
        <text
          x={padding + ((exactCurrentTime / 24) * (width - 2 * padding))}
          y={padding - 20}
          textAnchor="middle"
          className="fill-red-400 text-xs font-medium"
        >
          🔴 Nu ({currentHour.toString().padStart(2, '0')}:{currentMinutes.toString().padStart(2, '0')})
        </text>
        
        {/* Sunrise label */}
        <text
          x={padding + ((sunrise / 24) * (width - 2 * padding))}
          y={padding - 5}
          textAnchor="middle"
          className="fill-orange-400 text-xs font-medium"
        >
          🌅 {Math.floor(sunrise)}:{(Math.round((sunrise % 1) * 60)).toString().padStart(2, '0')}
        </text>
        
        {/* Sunset label */}
        <text
          x={padding + ((sunset / 24) * (width - 2 * padding))}
          y={padding - 5}
          textAnchor="middle"
          className="fill-orange-600 text-xs font-medium"
        >
          🌇 {Math.floor(sunset)}:{(Math.round((sunset % 1) * 60)).toString().padStart(2, '0')}
        </text>
      </svg>
      
             <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs">
         <div className="flex items-center space-x-1">
           <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
           <span className="text-white/80">Aktivitetsnivå</span>
         </div>
         <div className="flex items-center space-x-1">
           <div className="w-3 h-3 bg-orange-400 rounded-full"></div>
           <span className="text-white/80">🌅 Soluppgång ({Math.floor(sunrise)}:{(Math.round((sunrise % 1) * 60)).toString().padStart(2, '0')})</span>
         </div>
         <div className="flex items-center space-x-1">
           <div className="w-3 h-3 bg-orange-600 rounded-full"></div>
           <span className="text-white/80">🌇 Solnedgång ({Math.floor(sunset)}:{(Math.round((sunset % 1) * 60)).toString().padStart(2, '0')})</span>
         </div>
         <div className="flex items-center space-x-1">
           <div className="w-3 h-3 bg-red-400 rounded-full"></div>
           <span className="text-white/80">🔴 Nuvarande tid ({currentHour.toString().padStart(2, '0')}:{currentMinutes.toString().padStart(2, '0')})</span>
         </div>
       </div>
    </div>
  );
}

// Perch Size Class Selector
function PerchSizeClassSelector({ 
  selectedSize, 
  onSizeChange 
}: { 
  selectedSize: 'small' | 'medium' | 'large';
  onSizeChange: (size: 'small' | 'medium' | 'large') => void;
}) {
  const sizes = [
    { 
      id: 'small' as const, 
      name: 'Små abborrar', 
      range: '<15cm', 
      description: 'Stimfisk, håller sig nära skydd, äter plankton och småkräftor',
      icon: Fish,
      color: 'text-green-400'
    },
    { 
      id: 'medium' as const, 
      name: 'Medelstora abborrar', 
      range: '15-30cm', 
      description: 'Aktiva rovfiskar, jagar småfisk i grupper, varierad diet',
      icon: Fish,
      color: 'text-blue-400'
    },
    { 
      id: 'large' as const, 
      name: 'Stora abborrar', 
      range: '>30cm', 
      description: 'Troféfisk, ofta ensamma, jagar större byten',
      icon: Fish,
      color: 'text-purple-400'
    }
  ];

  return (
    <div className="bg-gradient-to-br from-slate-800/40 to-slate-700/40 rounded-xl p-6 border border-slate-600/30">
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <Scale className="w-5 h-5 text-blue-400" />
        Abborre storleksklasser
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sizes.map((size) => (
          <button
            key={size.id}
            onClick={() => onSizeChange(size.id)}
            className={`p-4 rounded-lg text-left transition-all transform hover:scale-105 ${
              selectedSize === size.id
                ? 'bg-blue-500/30 border-2 border-blue-400 shadow-lg shadow-blue-500/20'
                : 'bg-white/5 border-2 border-transparent hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <size.icon className={`w-6 h-6 ${size.color}`} />
              <div>
                <div className="text-white font-medium">{size.name}</div>
                <div className="text-white/60 text-sm">{size.range}</div>
              </div>
            </div>
            <p className="text-white/70 text-sm">{size.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// Advanced Parameter Panel
function AdvancedParameterPanel({ 
  parameters, 
  onParameterChange 
}: { 
  parameters: ParameterState;
  onParameterChange: (key: keyof ParameterState, value: any) => void;
}) {
  const ParameterSlider = ({ 
    label, 
    value, 
    min, 
    max, 
    step, 
    unit, 
    icon: Icon, 
    onChange 
  }: any) => (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <div className="flex justify-between items-center mb-3">
        <label className="text-white/90 font-medium flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-400" />
          {label}
        </label>
        <span className="text-white font-semibold">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
      />
      <div className="flex justify-between text-xs text-white/60 mt-1">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );

  const ParameterDropdown = ({ label, value, options, icon: Icon, onChange }: any) => (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <label className="text-white/90 font-medium flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-blue-400" />
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
      >
        {options.map((option: any) => (
          <option key={option.value} value={option.value} className="bg-gray-800">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-blue-400" />
        Miljöparametrar
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ParameterSlider
          label="Vattentemperatur"
          value={parameters.water_temperature || 15}
          min={0}
          max={30}
          step={0.5}
          unit="°C"
          icon={Thermometer}
          onChange={(val: number) => onParameterChange('water_temperature', val)}
        />

        <ParameterSlider
          label="Lufttrycksförändring"
          value={parameters.air_pressure_change || 0}
          min={-10}
          max={5}
          step={0.5}
          unit=" hPa"
          icon={Gauge}
          onChange={(val: number) => onParameterChange('air_pressure_change', val)}
        />

        <ParameterSlider
          label="Syrehalt"
          value={parameters.oxygen_level || 8}
          min={2}
          max={12}
          step={0.5}
          unit=" mg/L"
          icon={Droplets}
          onChange={(val: number) => onParameterChange('oxygen_level', val)}
        />

        <ParameterSlider
          label="Salthalt"
          value={parameters.salinity || 0}
          min={0}
          max={35}
          step={0.5}
          unit="‰"
          icon={Waves}
          onChange={(val: number) => onParameterChange('salinity', val)}
        />

        <ParameterSlider
          label="Strömhastighet"
          value={parameters.current_speed || 0.1}
          min={0}
          max={2}
          step={0.1}
          unit=" m/s"
          icon={Wind}
          onChange={(val: number) => onParameterChange('current_speed', val)}
        />

        <ParameterSlider
          label="Vindhastighet"
          value={parameters.wind_speed || 3}
          min={0}
          max={20}
          step={1}
          unit=" m/s"
          icon={Wind}
          onChange={(val: number) => onParameterChange('wind_speed', val)}
        />

        <ParameterDropdown
          label="Tid på dagen"
          value={parameters.time_of_day || 'day'}
          icon={Clock}
          onChange={(val: string) => onParameterChange('time_of_day', val)}
          options={[
            { value: 'dawn', label: '🌅 Gryning (05-07)' },
            { value: 'day', label: '☀️ Dag (07-17)' },
            { value: 'dusk', label: '🌆 Skymning (17-19)' },
            { value: 'night', label: '🌙 Natt (19-05)' }
          ]}
        />

        <ParameterDropdown
          label="Årstid"
          value={parameters.season || 'summer'}
          icon={Calendar}
          onChange={(val: string) => onParameterChange('season', val)}
          options={[
            { value: 'spring', label: '🌸 Vår' },
            { value: 'summer', label: '☀️ Sommar' },
            { value: 'autumn', label: '🍂 Höst' },
            { value: 'winter', label: '❄️ Vinter' }
          ]}
        />

        <ParameterDropdown
          label="Väder"
          value={parameters.weather || 'clear'}
          icon={CloudRain}
          onChange={(val: string) => onParameterChange('weather', val)}
          options={[
            { value: 'clear', label: '☀️ Klart väder' },
            { value: 'overcast', label: '☁️ Mulet' },
            { value: 'light_rain', label: '🌦️ Lätt regn' },
            { value: 'rain', label: '🌧️ Regn' },
            { value: 'storm', label: '⛈️ Storm' }
          ]}
        />

        <ParameterDropdown
          label="Månfas"
          value={parameters.moon_phase || 'new_moon'}
          icon={Moon}
          onChange={(val: string) => onParameterChange('moon_phase', val)}
          options={[
            { value: 'new_moon', label: '🌑 Nymåne' },
            { value: 'waxing_crescent', label: '🌒 Tilltagande skära' },
            { value: 'first_quarter', label: '🌓 Första kvarteret' },
            { value: 'waxing_gibbous', label: '🌔 Tilltagande måne' },
            { value: 'full_moon', label: '🌕 Fullmåne' },
            { value: 'waning_gibbous', label: '🌖 Avtagande måne' },
            { value: 'last_quarter', label: '🌗 Sista kvarteret' },
            { value: 'waning_crescent', label: '🌘 Avtagande skära' }
          ]}
        />
      </div>
    </div>
  );
}

// Circular Progress Component
function CircularProgress({ value, size = 120, strokeWidth = 8, className = "" }: {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value * circumference);
  
  const getColor = (val: number) => {
    if (val >= 0.8) return '#10B981'; // green-500
    if (val >= 0.6) return '#F59E0B'; // amber-500
    if (val >= 0.4) return '#EF4444'; // red-500
    return '#6B7280'; // gray-500
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor(value)}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-white">
          <AnimatedCounter value={value * 100} formatter={(val) => `${val.toFixed(0)}%`} />
        </span>
      </div>
    </div>
  );
}

// Helper functions
function getIntelligentActivityDescription(behavior: CalculatedBehavior, timeOfDay?: string, weather?: string): string {
  const activity = behavior.overallActivity;
  const today = new Date();
  const { sunrise, sunset } = calculateSunTimes(today);
  
  const formatTime = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const baseDescription = (() => {
    if (activity >= 0.8) return 'Utmärkt fiskeläge';
    if (activity >= 0.6) return 'Bra förhållanden för fiske';
    if (activity >= 0.4) return 'Måttliga förhållanden';
    if (activity >= 0.2) return 'Begränsad aktivitet';
    return 'Låg aktivitet';
  })();

  // Hitta de mest begränsande faktorerna
  const factors = Object.entries(behavior.activityBreakdown)
    .filter(([key]) => key !== 'combined')
    .map(([key, data]) => ({
      key,
      value: data.value,
      optimal: data.optimal,
      notes: data.notes,
      name: translateParameter(key)
    }))
    .sort((a, b) => a.value - b.value); // Sortera från lägst till högst

  // Identifiera kritiska problem (under 30%)
  const criticalFactors = factors.filter(f => f.value < 0.3);
  const poorFactors = factors.filter(f => f.value >= 0.3 && f.value < 0.6);
  const goodFactors = factors.filter(f => f.value >= 0.8);

  // Om det finns kritiska faktorer - fokusera på dem
  if (criticalFactors.length > 0) {
    if (criticalFactors.length === 1) {
      const factor = criticalFactors[0];
      return `${baseDescription} - ${factor.name} är kritiskt dålig (${Math.round(factor.value * 100)}%). ${factor.notes}`;
    } else {
      const factorNames = criticalFactors.map(f => `${f.name} (${Math.round(f.value * 100)}%)`).join(', ');
      return `${baseDescription} - Flera kritiska problem: ${factorNames}`;
    }
  }

  // Om det finns dåliga faktorer men inga kritiska
  if (poorFactors.length > 0) {
    if (poorFactors.length === 1) {
      const factor = poorFactors[0];
      return `${baseDescription} - ${factor.name} begränsar aktiviteten (${Math.round(factor.value * 100)}%). ${factor.notes}`;
    } else if (poorFactors.length === 2) {
      const factorNames = poorFactors.map(f => `${f.name} (${Math.round(f.value * 100)}%)`).join(' och ');
      return `${baseDescription} - ${factorNames} begränsar aktiviteten`;
    } else {
      return `${baseDescription} - Flera faktorer begränsar aktiviteten: ${poorFactors.map(f => f.name).join(', ')}`;
    }
  }

  // Om alla faktorer är okej, använd tid+väder logik
  const getTimeWeatherDescription = () => {
    const weatherDescriptions = {
      clear: 'solig',
      overcast: 'mulen', 
      light_rain: 'lätt regnig',
      rain: 'regnig'
    };
    
    const timeDescriptions = {
      dawn: `gryning (${formatTime(sunrise)})`,
      day: 'dag',
      dusk: `skymning (${formatTime(sunset)})`,
      night: 'natt'
    };
    
    const weatherDesc = weatherDescriptions[weather as keyof typeof weatherDescriptions] || '';
    const timeDesc = timeDescriptions[timeOfDay as keyof typeof timeDescriptions] || 'dag';
    
    if (weather && weatherDesc && timeOfDay !== 'dawn' && timeOfDay !== 'dusk') {
      return `${weatherDesc} ${timeDesc}`;
    }
    
    return timeDesc;
  };

  const timeWeatherDesc = getTimeWeatherDescription();

  // Specifika meddelanden baserat på tid och väder (endast när inga större problem finns)
  if (timeOfDay === 'night') {
    return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} är svår tid för abborre (dåligt mörkerseende)`;
  }
  
  if (timeOfDay === 'dawn') {
    if (weather === 'overcast' || weather === 'light_rain') {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} är perfekt för abborre`;
    } else if (weather === 'clear') {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} är optimal för abborre`;
    } else {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} är optimal trots vädret`;
    }
  }
  
  if (timeOfDay === 'dusk') {
    if (weather === 'overcast' || weather === 'light_rain') {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} är perfekt för abborre`;
    } else if (weather === 'clear') {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} är optimal för abborre`;
    } else {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} är optimal trots vädret`;
    }
  }
  
  if (timeOfDay === 'day') {
    if (weather === 'overcast') {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} är utmärkt (abborre mindre skygg)`;
    } else if (weather === 'clear') {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} kan göra abborre skygg`;
    } else if (weather === 'light_rain') {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} syresätter vattnet, ofta bra fiske`;
    } else if (weather === 'rain') {
      return `${baseDescription} - ${timeWeatherDesc.charAt(0).toUpperCase() + timeWeatherDesc.slice(1)} får abborre att söka skydd djupare`;
    }
  }
  
  // Om vi har bra förhållanden, nämn vad som är bäst
  if (goodFactors.length > 0) {
    const bestFactor = goodFactors[goodFactors.length - 1]; // Högsta värdet
    return `${baseDescription} - Gynnsamma förhållanden, ${bestFactor.name} (${Math.round(bestFactor.value * 100)}%) driver aktiviteten`;
  }
  
  return baseDescription;

}

// Backward compatibility function
function getActivityDescription(activity: number, timeOfDay?: string, weather?: string): string {
  // This is a fallback for any remaining usage - should not be used for intelligent descriptions
  if (activity >= 0.8) return 'Utmärkt fiskeläge';
  if (activity >= 0.6) return 'Bra förhållanden för fiske';
  if (activity >= 0.4) return 'Måttliga förhållanden';
  if (activity >= 0.2) return 'Begränsad aktivitet';
  return 'Låg aktivitet';
}

function translateParameter(param: string): string {
  const translations: { [key: string]: string } = {
    'water_temperature': 'Vattentemperatur',
    'air_pressure_change': 'Lufttryck',
    'time_of_day': 'Tid på dagen',
    'weather': 'Väder',
    'season': 'Årstid',
    'moon_phase': 'Månfas',
    'oxygen_level': 'Syrehalt',
    'salinity': 'Salthalt',
    'current_speed': 'Strömhastighet',
    'wind_speed': 'Vindhastighet'
  };
  return translations[param] || param.replace('_', ' ');
}

function translateFood(food: string): string {
  const foodTranslations: { [key: string]: string } = {
    'small_fish': 'Småfisk',
    'crustaceans': 'Kräftdjur',
    'small_crustaceans': 'Små kräftdjur',
    'insects': 'Insekter',
    'worms': 'Maskar',
    'plankton': 'Plankton',
    'larvae': 'Larver',
    'mollusks': 'Blötdjur',
    'vegetation': 'Växtlighet',
    'other_fish': 'Andra fiskar',
    'bottom_fauna': 'Bottenfauna'
  };
  return foodTranslations[food] || food.replace('_', ' ');
}

// Main Activity Display
function MainActivityDisplay({ behavior, sizeClass, timeOfDay, weather }: { behavior: CalculatedBehavior; sizeClass: string; timeOfDay?: string; weather?: string }) {
  const getSizeSpecificInsights = (size: string) => {
    switch (size) {
      case 'small':
        return {
          behavior: 'Håller sig i stim nära växtlighet och skydd',
          diet: 'Plankton, småkräftor och insektslarver',
          depth: 'Grunt vatten, 1-3 meter'
        };
      case 'large':
        return {
          behavior: 'Solitär eller i små grupper, jagar från gömställen',
          diet: 'Stora fiskar, kräftor och grodyngel',
          depth: 'Varierar mellan grunt och djupt, 2-15 meter'
        };
      default:
        return {
          behavior: 'Jagar i grupper, aktiv rovfisk',
          diet: 'Småfisk, bottendjur och kräftor',
          depth: 'Medeldjup, 2-8 meter'
        };
    }
  };

  const insights = getSizeSpecificInsights(sizeClass);

  return (
    <div className="space-y-6">
             {/* Main Activity Level */}
       <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 rounded-xl p-8 text-center border border-blue-500/20">
         <h3 className="text-2xl font-semibold text-white mb-6">Övergripande aktivitetsnivå</h3>
         <CircularProgress value={behavior.overallActivity} size={140} />
                 <div className="mt-4 text-lg text-white/90">
          {getIntelligentActivityDescription(behavior, timeOfDay, weather)}
        </div>
                 <div className="mt-6 grid grid-cols-3 gap-4">
           <div className="text-center">
             <div className="text-lg font-semibold text-blue-400">
               <AnimatedCounter value={behavior.spatialBehavior.aggregation_tendency * 100} formatter={(val) => `${val.toFixed(0)}%`} />
             </div>
             <div className="text-white/70 text-sm">Aggregationsbenägenhet</div>
           </div>
           <div className="text-center">
             <div className="text-lg font-semibold text-green-400">
               <AnimatedCounter value={behavior.spatialBehavior.horizontal_movement * 100} formatter={(val) => `${val.toFixed(0)}%`} />
             </div>
             <div className="text-white/70 text-sm">Horisontell rörlighet</div>
           </div>
           <div className="text-center">
             <div className="text-lg font-semibold text-purple-400">
               <AnimatedCounter value={behavior.spatialBehavior.vertical_movement * 100} formatter={(val) => `${val.toFixed(0)}%`} />
             </div>
             <div className="text-white/70 text-sm">Vertikal rörlighet</div>
           </div>
         </div>
      </div>

      {/* Size-specific insights */}
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5 text-blue-400" />
          Storleksspecifika insikter ({sizeClass})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h5 className="text-white/90 font-medium mb-2">Beteende</h5>
            <p className="text-white/70 text-sm">{insights.behavior}</p>
          </div>
          <div>
            <h5 className="text-white/90 font-medium mb-2">Diet</h5>
            <p className="text-white/70 text-sm">{insights.diet}</p>
          </div>
          <div>
            <h5 className="text-white/90 font-medium mb-2">Djup</h5>
            <p className="text-white/70 text-sm">{insights.depth}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Parameter Analysis Component
function ParameterAnalysis({ behavior }: { behavior: CalculatedBehavior }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-white flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-400" />
        Detaljerad aktivitetsanalys
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(behavior.activityBreakdown)
          .filter(([key]) => key !== 'combined')
          .map(([param, data]) => (
          <div key={param} className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                {data.optimal ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                )}
                                 <span className="text-white/90 font-medium">
                   {translateParameter(param)}
                 </span>
              </div>
              <span className="text-white font-semibold">
                {Math.round(data.value * 100)}%
              </span>
            </div>
            
            <div className="w-full bg-white/10 rounded-full h-2 mb-2">
              <div 
                className={`h-2 rounded-full transition-all duration-1000 ${
                  data.optimal ? 'bg-green-400' : 'bg-yellow-400'
                }`}
                style={{ width: `${data.value * 100}%` }}
              />
            </div>
            
            {data.notes && (
              <p className="text-white/60 text-xs mt-2">{data.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Activity Indicator Component
function ActivityIndicator({ level, label }: { level: number; label: string }) {
  const getColor = (val: number) => {
    if (val >= 0.8) return 'bg-green-400';
    if (val >= 0.6) return 'bg-yellow-400';
    if (val >= 0.4) return 'bg-orange-400';
    return 'bg-red-400';
  };

  return (
    <div className="flex items-center space-x-3">
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-white/90 text-sm">{label}</span>
          <span className="text-white font-medium text-sm">
            <AnimatedCounter value={level * 100} formatter={(val) => `${val.toFixed(0)}%`} />
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div 
            className={`h-2 rounded-full ${getColor(level)} transition-all duration-1000 ease-out`}
            style={{ width: `${level * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Advanced Insights Component
function AdvancedInsights({ behavior }: { behavior: CalculatedBehavior }) {
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-white flex items-center gap-2">
        <Brain className="w-5 h-5 text-blue-400" />
        Avancerade insikter
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Spatial Behavior */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-400" />
            Rumsligt beteende
          </h4>
                     <div className="space-y-3">
             <ActivityIndicator 
               level={behavior.spatialBehavior.preferred_depth.optimal / 20} 
               label={`Föredraget djup: ${behavior.spatialBehavior.preferred_depth.optimal.toFixed(1)}m`}
             />
             <ActivityIndicator 
               level={behavior.spatialBehavior.horizontal_movement} 
               label="Horisontell rörlighet"
             />
             <ActivityIndicator 
               level={behavior.spatialBehavior.territory_size / 100} 
               label={`Territoriestorlek: ${behavior.spatialBehavior.territory_size.toFixed(0)}m²`}
             />
           </div>
        </div>

        {/* Physiological State */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-400" />
            Fysiologiskt tillstånd
          </h4>
                     <div className="space-y-3">
             <ActivityIndicator 
               level={behavior.physiologicalState.metabolism_rate} 
               label="Metabolism"
             />
             <ActivityIndicator 
               level={1 - behavior.physiologicalState.stress_level} 
               label="Välbefinnande"
             />
             <ActivityIndicator 
               level={1 - behavior.physiologicalState.energy_expenditure} 
               label="Energinivå"
             />
             <ActivityIndicator 
               level={behavior.physiologicalState.immune_function} 
               label="Immunförsvar"
             />
           </div>
        </div>
      </div>

      {/* Current Diet */}
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-purple-400" />
          Aktuell diet
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(behavior.dietComposition).map(([food, percentage]) => (
            <div key={food} className="text-center">
              <div className="text-lg font-semibold text-white">
                <AnimatedCounter value={(typeof percentage === 'number' ? percentage : 0) * 100} formatter={(val) => `${val.toFixed(0)}%`} />
              </div>
              <div className="text-white/70 text-sm">{translateFood(food)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Fishing Recommendations Component  
function FishingRecommendations({ behavior }: { behavior: CalculatedBehavior }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-white flex items-center gap-2">
        <Fish className="w-5 h-5 text-blue-400" />
        Fiskerekommendationer
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {behavior.fishingRecommendations.slice(0, 4).map((rec, index) => (
          <div key={index} className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex justify-between items-start mb-3">
              <h4 className="text-white font-semibold">{rec.method}</h4>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-medium">
                  <AnimatedCounter value={rec.effectiveness * 100} formatter={(val) => `${val.toFixed(0)}%`} />
                </span>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-white/70">Optimal tid: </span>
                <span className="text-white">{rec.optimal_timing}</span>
              </div>
              
                             {rec.bait_recommendations && rec.bait_recommendations.length > 0 && (
                 <div>
                   <span className="text-white/70">Rekommenderade beten: </span>
                   <span className="text-white">{rec.bait_recommendations.join(', ')}</span>
                 </div>
               )}
               
               {rec.technique_notes && (
                 <p className="text-white/60 italic">{rec.technique_notes}</p>
               )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main component with sidebar layout for parameters
export default function FishBehaviorVisualization({ fishName }: FishBehaviorVisualizationProps) {
  const [fishBehaviorData, setFishBehaviorData] = useState<FishBehaviorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculatedBehavior, setCalculatedBehavior] = useState<CalculatedBehavior | null>(null);
  const [selectedSizeClass, setSelectedSizeClass] = useState<'small' | 'medium' | 'large'>('medium');
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'insights' | 'recommendations'>('overview');
  const [showParameterPanel, setShowParameterPanel] = useState(false);
  
  const [parameters, setParameters] = useState<ParameterState>({
    water_temperature: 15,
    salinity: 0,
    current_speed: 0.1,
    air_pressure_change: 0,
    time_of_day: 'day',
    season: 'summer',
    weather: 'clear',
    moon_phase: 'new_moon',
    oxygen_level: 8,
    wind_speed: 3,
    depth: 5
  });

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const behaviorLookup = await loadFishBehaviorData();
        const data = behaviorLookup[fishName];
        
        if (data) {
          setFishBehaviorData(data);
        } else {
          setError(`Ingen beteendedata tillgänglig för ${fishName}`);
        }
      } catch (err) {
        setError('Kunde inte ladda beteendedata');
      } finally {
        setIsLoading(false);
      }
    };

    if (fishName) {
      loadData();
    }
  }, [fishName]);

  // Calculate behavior
  useEffect(() => {
    if (fishBehaviorData) {
      calculateComprehensiveBehavior(fishBehaviorData, parameters, selectedSizeClass)
        .then(result => setCalculatedBehavior(result))
        .catch(() => setCalculatedBehavior(null));
    }
  }, [fishBehaviorData, parameters, selectedSizeClass]);

  const updateParameter = useCallback((key: keyof ParameterState, value: any) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-white/80">Laddar avancerad beteendeanalys...</p>
        </div>
      </div>
    );
  }

  if (error || !fishBehaviorData) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-xl text-white mb-2">Beteendedata ej tillgänglig</h3>
        <p className="text-white/60">{error}</p>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Översikt', icon: Home },
    { id: 'analysis', label: 'Analys', icon: BarChart3 },
    { id: 'insights', label: 'Insikter', icon: Brain },
    { id: 'recommendations', label: 'Rekommendationer', icon: Fish }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">
          Avancerad beteendeanalys: {fishBehaviorData.svenskt_namn}
        </h2>
        <p className="text-white/70 italic">{fishBehaviorData.latinskt_namn}</p>
        {calculatedBehavior && (
          <div className="mt-4">
            <span className="text-4xl font-light text-blue-400">
              <AnimatedCounter value={calculatedBehavior.overallActivity * 100} formatter={(val) => `${val.toFixed(0)}%`} />
            </span>
            <span className="text-white/70 ml-2">aktivitet just nu</span>
            <div className="mt-2 text-white/80">
              {getIntelligentActivityDescription(calculatedBehavior, parameters.time_of_day, parameters.weather)}
            </div>
          </div>
        )}
      </div>

      {/* Size selector for Abborre */}
      {fishName === 'Abborre' && (
        <PerchSizeClassSelector 
          selectedSize={selectedSizeClass} 
          onSizeChange={setSelectedSizeClass} 
        />
      )}

      {/* Main Layout with Sidebar */}
      <div className="flex gap-6">
        {/* Left Sidebar - Parameters */}
        <div className="w-80 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-400" />
              Parametrar
            </h3>
            <button
              onClick={() => setShowParameterPanel(!showParameterPanel)}
              className="lg:hidden flex items-center gap-2 px-3 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              {showParameterPanel ? 'Dölj' : 'Visa'}
            </button>
          </div>
          
          <div className={`space-y-4 ${showParameterPanel ? 'block' : 'hidden lg:block'}`}>
            {/* Quick controls - most important parameters */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white/90 font-medium flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-blue-400" />
                  Temperatur
                </label>
                <span className="text-white font-semibold">{parameters.water_temperature || 15}°C</span>
              </div>
              <input
                type="range"
                min={0}
                max={30}
                step={0.5}
                value={parameters.water_temperature || 15}
                onChange={(e) => updateParameter('water_temperature', Number(e.target.value))}
                className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white/90 font-medium flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-blue-400" />
                  Lufttryck
                </label>
                <span className="text-white font-semibold">{parameters.air_pressure_change || 0} hPa</span>
              </div>
              <input
                type="range"
                min={-10}
                max={5}
                step={0.5}
                value={parameters.air_pressure_change || 0}
                onChange={(e) => updateParameter('air_pressure_change', Number(e.target.value))}
                className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <label className="text-white/90 font-medium flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-400" />
                Tid på dagen
              </label>
              <select
                value={parameters.time_of_day || 'day'}
                onChange={(e) => updateParameter('time_of_day', e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              >
                <option value="dawn">🌅 Gryning</option>
                <option value="day">☀️ Dag</option>
                <option value="dusk">🌆 Skymning</option>
                <option value="night">🌙 Natt</option>
              </select>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <label className="text-white/90 font-medium flex items-center gap-2 mb-3">
                <CloudRain className="w-4 h-4 text-blue-400" />
                Väder
              </label>
              <select
                value={parameters.weather || 'clear'}
                onChange={(e) => updateParameter('weather', e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              >
                <option value="clear">☀️ Klart</option>
                <option value="overcast">☁️ Mulet</option>
                <option value="light_rain">🌦️ Lätt regn</option>
                <option value="rain">🌧️ Regn</option>
              </select>
            </div>

            {/* Expandable advanced parameters */}
            <details className="bg-white/5 rounded-lg border border-white/10">
              <summary className="p-4 cursor-pointer text-white/90 font-medium hover:bg-white/5">
                Avancerade parametrar
              </summary>
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-white/90 text-sm flex items-center gap-2">
                      <Droplets className="w-4 h-4 text-blue-400" />
                      Syrehalt
                    </label>
                    <span className="text-white font-medium">{parameters.oxygen_level || 8} mg/L</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={12}
                    step={0.5}
                    value={parameters.oxygen_level || 8}
                    onChange={(e) => updateParameter('oxygen_level', Number(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-white/90 text-sm flex items-center gap-2">
                      <Waves className="w-4 h-4 text-blue-400" />
                      Salthalt
                    </label>
                    <span className="text-white font-medium">{parameters.salinity || 0}‰</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    step={0.5}
                    value={parameters.salinity || 0}
                    onChange={(e) => updateParameter('salinity', Number(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-white/90 text-sm flex items-center gap-2">
                      <Wind className="w-4 h-4 text-blue-400" />
                      Strömhastighet
                    </label>
                    <span className="text-white font-medium">{parameters.current_speed || 0.1} m/s</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={parameters.current_speed || 0.1}
                    onChange={(e) => updateParameter('current_speed', Number(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>

                <div>
                  <label className="text-white/90 text-sm flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    Årstid
                  </label>
                  <select
                    value={parameters.season || 'summer'}
                    onChange={(e) => updateParameter('season', e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white text-sm"
                  >
                    <option value="spring">🌸 Vår</option>
                    <option value="summer">☀️ Sommar</option>
                    <option value="autumn">🍂 Höst</option>
                    <option value="winter">❄️ Vinter</option>
                  </select>
                </div>

                <div>
                  <label className="text-white/90 text-sm flex items-center gap-2 mb-2">
                    <Moon className="w-4 h-4 text-blue-400" />
                    Månfas
                  </label>
                  <select
                    value={parameters.moon_phase || 'new_moon'}
                    onChange={(e) => updateParameter('moon_phase', e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white text-sm"
                  >
                    <option value="new_moon">🌑 Nymåne</option>
                    <option value="waxing_crescent">🌒 Tilltagande skära</option>
                    <option value="first_quarter">🌓 Första kvarteret</option>
                    <option value="waxing_gibbous">🌔 Tilltagande måne</option>
                    <option value="full_moon">🌕 Fullmåne</option>
                    <option value="waning_gibbous">🌖 Avtagande måne</option>
                    <option value="last_quarter">🌗 Sista kvarteret</option>
                    <option value="waning_crescent">🌘 Avtagande skära</option>
                  </select>
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 space-y-6">
          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-2 p-2 bg-white/5 rounded-xl border border-white/10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-500/30 text-white border border-blue-400'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[600px]">
            {activeTab === 'overview' && fishName === 'Abborre' && calculatedBehavior && (
              <div className="space-y-8">
                <CircadianRhythmChart activity={calculatedBehavior.overallActivity} sizeClass={selectedSizeClass} />
                <MainActivityDisplay behavior={calculatedBehavior} sizeClass={selectedSizeClass} timeOfDay={parameters.time_of_day} weather={parameters.weather} />
              </div>
            )}

            {activeTab === 'analysis' && calculatedBehavior && (
              <ParameterAnalysis behavior={calculatedBehavior} />
            )}

            {activeTab === 'insights' && calculatedBehavior && (
              <AdvancedInsights behavior={calculatedBehavior} />
            )}

            {activeTab === 'recommendations' && calculatedBehavior && (
              <FishingRecommendations behavior={calculatedBehavior} />
            )}

            {!calculatedBehavior && (
              <div className="bg-white/5 rounded-xl p-8 text-center border border-white/10">
                <Activity className="w-12 h-12 text-white/40 mx-auto mb-4" />
                <h3 className="text-lg text-white mb-2">Beräknar beteendeanalys...</h3>
                <p className="text-white/60">Justera parametrarna till vänster för att se detaljerad analys</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 