'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Thermometer, Droplets, Clock, CloudRain, TrendingDown, 
  Activity, Settings, RotateCcw, Zap, Eye, Sun, Moon,
  Wind, Gauge, Target
} from 'lucide-react';
import { FishBehaviorData } from '@/lib/fishBehaviorData';
import { ParameterState } from '@/lib/dynamicBehaviorCalculations';

interface ParameterControlsProps {
  fishData: FishBehaviorData;
  onParametersChange: (params: ParameterState) => void;
}

interface ControlSection {
  id: string;
  title: string;
  icon: any;
  color: string;
  bgColor: string;
}

export default function ParameterControls({ 
  fishData, 
  onParametersChange 
}: ParameterControlsProps) {
  const [parameters, setParameters] = useState<ParameterState>({
    water_temperature: 15,
    salinity: 0,
    air_pressure_change: 0,
    time_of_day: 'day',
    season: 'summer',
    weather: 'clear',
    moon_phase: 'new_moon',
    oxygen_level: 8,
    current_speed: 0.1
  });

  const [activeSection, setActiveSection] = useState<string>('environment');
  const [isAnimating, setIsAnimating] = useState(false);

  // Control sections configuration
  const sections: ControlSection[] = [
    {
      id: 'environment',
      title: 'Miljöfaktorer',
      icon: Thermometer,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/20'
    },
    {
      id: 'temporal',
      title: 'Tid & Säsong',
      icon: Clock,
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/20'
    },
    {
      id: 'weather',
      title: 'Väder & Tryck',
      icon: CloudRain,
      color: 'text-green-400',
      bgColor: 'bg-green-400/20'
    },
    {
      id: 'physical',
      title: 'Fysiska faktorer',
      icon: Activity,
      color: 'text-orange-400',
      bgColor: 'bg-orange-400/20'
    }
  ];

  // Notify parent of parameter changes
  useEffect(() => {
    onParametersChange(parameters);
  }, [parameters, onParametersChange]);

  // Update parameters with animation
  const updateParameter = useCallback((key: keyof ParameterState, value: any) => {
    setIsAnimating(true);
    setParameters(prev => ({ ...prev, [key]: value }));
    
    // Reset animation after short delay
    setTimeout(() => setIsAnimating(false), 150);
  }, []);

  // Reset to default values
  const resetParameters = useCallback(() => {
    setParameters({
      water_temperature: 15,
      salinity: 0,
      air_pressure_change: 0,
      time_of_day: 'day',
      season: 'summer',
      weather: 'clear',
      moon_phase: 'new_moon',
      depth: 5,
      oxygen_level: 8,
      current_speed: 0.1
    });
  }, []);

  // Load preset scenarios
  const loadPreset = useCallback((presetName: string) => {
    const presets: Record<string, ParameterState> = {
      'optimal_summer': {
        water_temperature: 18,
        salinity: 0,
        air_pressure_change: -1.5,
        time_of_day: 'dusk',
        season: 'summer',
        weather: 'overcast',
        moon_phase: 'new_moon',
        depth: 3,
        oxygen_level: 9,
        current_speed: 0.2
      },
      'winter_challenge': {
        water_temperature: 4,
        salinity: 0,
        air_pressure_change: 2,
        time_of_day: 'day',
        season: 'winter',
        weather: 'clear',
        moon_phase: 'full_moon',
        depth: 8,
        oxygen_level: 10,
        current_speed: 0.05
      },
      'spring_feeding': {
        water_temperature: 12,
        salinity: 0,
        air_pressure_change: -0.5,
        time_of_day: 'dawn',
        season: 'spring',
        weather: 'light_rain',
        moon_phase: 'waxing_crescent',
        depth: 2,
        oxygen_level: 8.5,
        current_speed: 0.3
      },
      'coastal_conditions': {
        water_temperature: 16,
        salinity: 8,
        air_pressure_change: -1,
        time_of_day: 'dusk',
        season: 'summer',
        weather: 'overcast',
        moon_phase: 'new_moon',
        depth: 4,
        oxygen_level: 7.5,
        current_speed: 0.4
      }
    };

    if (presets[presetName]) {
      setParameters(presets[presetName]);
    }
  }, []);

  // Render slider component
  const renderSlider = (
    key: keyof ParameterState,
    label: string,
    min: number,
    max: number,
    step: number,
    unit: string,
    icon: any,
    color: string,
    formatter?: (value: number) => string
  ) => {
    const Icon = icon;
    const value = Number(parameters[key]) || 0;
    const percentage = ((value - min) / (max - min)) * 100;
    const displayValue = formatter ? formatter(value) : `${value}${unit}`;

    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 hover:bg-white/10 transition-all duration-300">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-white font-medium">{label}</h4>
              <p className="text-white/60 text-sm">{displayValue}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-white">{displayValue}</div>
          </div>
        </div>

        <div className="relative">
          {/* Track */}
          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
            {/* Progress */}
            <div 
              className={`h-full bg-gradient-to-r from-white/30 to-white/60 transition-all duration-300 rounded-full ${
                isAnimating ? 'scale-y-110' : ''
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          
          {/* Slider input */}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => updateParameter(key, Number(e.target.value))}
            className="absolute inset-0 w-full h-3 opacity-0 cursor-pointer"
          />
          
          {/* Thumb indicator */}
          <div 
            className={`absolute top-1/2 transform -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-200 border-2 border-white/20 ${
              isAnimating ? 'scale-110 shadow-xl' : ''
            }`}
            style={{ left: `calc(${percentage}% - 10px)` }}
          />
        </div>

        {/* Range indicators */}
        <div className="flex justify-between mt-2 text-xs text-white/50">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      </div>
    );
  };

  // Render dropdown component
  const renderDropdown = (
    key: keyof ParameterState,
    label: string,
    options: Array<{ value: string; label: string; icon?: string }>,
    icon: any,
    color: string
  ) => {
    const Icon = icon;
    const currentValue = String(parameters[key]);
    const currentOption = options.find(opt => opt.value === currentValue);

    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 hover:bg-white/10 transition-all duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-white font-medium">{label}</h4>
            <p className="text-white/60 text-sm">{currentOption?.label}</p>
          </div>
        </div>

        <div className="relative">
          <select
            value={currentValue}
            onChange={(e) => updateParameter(key, e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white appearance-none cursor-pointer hover:bg-white/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
          >
            {options.map((option) => (
              <option 
                key={option.value} 
                value={option.value}
                className="bg-slate-800 text-white"
              >
                {option.icon} {option.label}
              </option>
            ))}
          </select>
          
          {/* Custom dropdown arrow */}
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white/60" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header with presets */}
      <div className="bg-gradient-to-r from-slate-500/10 to-gray-500/10 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-light text-white mb-2 flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-400/30 to-orange-400/30 rounded-xl flex items-center justify-center">
                <Settings className="w-6 h-6 text-yellow-400" />
              </div>
              Miljöparametrar
            </h3>
            <p className="text-white/70 text-lg">
              Justera miljöfaktorer och se hur {fishData.svenskt_namn.toLowerCase()}s beteende förändras i realtid
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Preset buttons */}
            <button
              onClick={() => loadPreset('optimal_summer')}
              className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105"
            >
              🌞 Optimal sommar
            </button>
            
            <button
              onClick={() => loadPreset('winter_challenge')}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105"
            >
              ❄️ Vinterutmaning
            </button>
            
            <button
              onClick={() => loadPreset('spring_feeding')}
              className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105"
            >
              🌸 Vårfödosök
            </button>
            
            <button
              onClick={() => loadPreset('coastal_conditions')}
              className="px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/30 text-teal-300 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105"
            >
              🌊 Kustnära
            </button>

            <button
              onClick={resetParameters}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Återställ
            </button>
          </div>
        </div>
      </div>

      {/* Section Navigation */}
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`group relative flex items-center gap-3 p-4 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? 'bg-white/10 text-white shadow-lg' 
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  isActive ? section.bgColor : 'bg-white/5 group-hover:bg-white/10'
                }`}>
                  <Icon className={`w-5 h-5 ${isActive ? section.color : 'text-white/70'}`} />
                </div>
                <div className="text-left min-w-0">
                  <div className="font-medium text-sm truncate">{section.title}</div>
                </div>
                
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Parameter Controls */}
      <div className="min-h-[600px]">
        {activeSection === 'environment' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderSlider(
              'water_temperature',
              'Vattentemperatur',
              0, 30, 0.5, '°C',
              Thermometer,
              'from-blue-400/20 to-red-400/20',
              (val) => `${val}°C`
            )}
            
            {renderSlider(
              'salinity',
              'Salthalt',
              0, 35, 0.5, '‰',
              Droplets,
              'from-cyan-400/20 to-blue-400/20'
            )}
            
            {renderSlider(
              'oxygen_level',
              'Syrehalt',
              1, 15, 0.1, ' mg/L',
              Activity,
              'from-green-400/20 to-emerald-400/20',
              (val) => `${val.toFixed(1)} mg/L`
            )}
            
            {renderSlider(
              'current_speed',
              'Strömhastighet',
              0, 2, 0.05, ' m/s',
              Wind,
              'from-teal-400/20 to-cyan-400/20',
              (val) => `${val.toFixed(2)} m/s`
            )}
          </div>
        )}

        {activeSection === 'temporal' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderDropdown(
              'time_of_day',
              'Tid på dagen',
              [
                { value: 'dawn', label: 'Gryning (05:00-07:00)', icon: '🌅' },
                { value: 'day', label: 'Dag (07:00-18:00)', icon: '☀️' },
                { value: 'dusk', label: 'Skymning (18:00-21:00)', icon: '🌆' },
                { value: 'night', label: 'Natt (21:00-05:00)', icon: '🌙' }
              ],
              Clock,
              'from-purple-400/20 to-pink-400/20'
            )}
            
            {renderDropdown(
              'season',
              'Säsong',
              [
                { value: 'spring', label: 'Vår (mars-maj)', icon: '🌸' },
                { value: 'summer', label: 'Sommar (juni-augusti)', icon: '☀️' },
                { value: 'autumn', label: 'Höst (september-november)', icon: '🍂' },
                { value: 'winter', label: 'Vinter (december-februari)', icon: '❄️' }
              ],
              Sun,
              'from-yellow-400/20 to-orange-400/20'
            )}
            
            {renderDropdown(
              'moon_phase',
              'Månfas',
              [
                { value: 'new_moon', label: 'Nymåne', icon: '🌑' },
                { value: 'waxing_crescent', label: 'Tilltagande skära', icon: '🌒' },
                { value: 'first_quarter', label: 'Första kvarteret', icon: '🌓' },
                { value: 'waxing_gibbous', label: 'Tilltagande månasken', icon: '🌔' },
                { value: 'full_moon', label: 'Fullmåne', icon: '🌕' },
                { value: 'waning_gibbous', label: 'Avtagande månasken', icon: '🌖' },
                { value: 'last_quarter', label: 'Sista kvarteret', icon: '🌗' },
                { value: 'waning_crescent', label: 'Avtagande skära', icon: '🌘' }
              ],
              Moon,
              'from-indigo-400/20 to-purple-400/20'
            )}
            
            {renderSlider(
              'depth',
              'Djup',
              0.5, 50, 0.5, ' m',
              Target,
              'from-purple-400/20 to-indigo-400/20',
              (val) => `${val} m`
            )}
          </div>
        )}

        {activeSection === 'weather' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderDropdown(
              'weather',
              'Väderförhållanden',
              [
                { value: 'clear', label: 'Klart', icon: '☀️' },
                { value: 'sunny', label: 'Soligt', icon: '🌞' },
                { value: 'overcast', label: 'Mulet', icon: '☁️' },
                { value: 'light_rain', label: 'Lätt regn', icon: '🌦️' },
                { value: 'rain', label: 'Regn', icon: '🌧️' }
              ],
              CloudRain,
              'from-green-400/20 to-teal-400/20'
            )}
            
            {renderSlider(
              'air_pressure_change',
              'Lufttrycksförändring',
              -5, 5, 0.1, ' hPa/12h',
              TrendingDown,
              'from-red-400/20 to-orange-400/20',
              (val) => {
                const sign = val >= 0 ? '+' : '';
                return `${sign}${val.toFixed(1)} hPa/12h`;
              }
            )}
          </div>
        )}

        {activeSection === 'physical' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-400/20 to-red-400/20 rounded-xl flex items-center justify-center">
                  <Eye className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium">Visuella faktorer</h4>
                  <p className="text-white/60 text-sm">Ljus- och siktförhållanden</p>
                </div>
              </div>
              <div className="space-y-4 text-white/80">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                  <span>Siktdjup</span>
                  <span className="text-white font-medium">
                    {parameters.weather === 'clear' ? '8-12 m' : 
                     parameters.weather === 'overcast' ? '5-8 m' : '3-6 m'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                  <span>Ljusintensitet</span>
                  <span className="text-white font-medium">
                    {parameters.time_of_day === 'day' ? 'Hög' :
                     parameters.time_of_day === 'dawn' || parameters.time_of_day === 'dusk' ? 'Måttlig' : 'Låg'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-teal-400/20 to-cyan-400/20 rounded-xl flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium">Fysisk stress</h4>
                  <p className="text-white/60 text-sm">Miljöstressfaktorer</p>
                </div>
              </div>
              <div className="space-y-4 text-white/80">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                  <span>Temperaturstress</span>
                  <span className={`font-medium ${
                    Math.abs((parameters.water_temperature || 15) - 15) < 5 ? 'text-green-400' :
                    Math.abs((parameters.water_temperature || 15) - 15) < 10 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {Math.abs((parameters.water_temperature || 15) - 15) < 5 ? 'Låg' :
                     Math.abs((parameters.water_temperature || 15) - 15) < 10 ? 'Måttlig' : 'Hög'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                  <span>Salthaltstress</span>
                  <span className={`font-medium ${
                    (parameters.salinity || 0) < 5 ? 'text-green-400' :
                    (parameters.salinity || 0) < 15 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {(parameters.salinity || 0) < 5 ? 'Låg' :
                     (parameters.salinity || 0) < 15 ? 'Måttlig' : 'Hög'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 backdrop-blur-sm rounded-2xl border border-yellow-400/20 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-400/30 to-orange-400/30 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1">
            <h4 className="text-white font-medium text-sm mb-2">Realtidsberäkningar</h4>
            <p className="text-white/70 text-sm leading-relaxed">
              Alla ändringar beräknas omedelbart med avancerade matematiska modeller som tar hänsyn till 
              parameter-interaktioner och biologiska principer. Resultaten visas i realtid för en 
              realistisk bild av fiskbeteendet under olika förhållanden.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 