'use client';

import { useState, useEffect } from 'react';
import { 
  Activity, TrendingUp, Fish, MapPin, Gauge, 
  Zap, Target, Heart, Brain, Droplet, Clock,
  AlertTriangle, CheckCircle, Eye, BarChart3,
  PieChart, LineChart, CircuitBoard, Cpu
} from 'lucide-react';
import { CalculatedBehavior, getActivityLevelColor, getSuitabilityColor } from '@/lib/dynamicBehaviorCalculations';

interface DynamicResultsPanelProps {
  calculatedBehavior: CalculatedBehavior;
  fishName: string;
}

interface AnimatedCounterProps {
  value: number;
  duration: number;
  formatter?: (val: number) => string;
  className?: string;
}

// Animated counter component
function AnimatedCounter({ value, duration, formatter, className = '' }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(value * easeOutQuart);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  const formattedValue = formatter ? formatter(displayValue) : displayValue.toFixed(1);

  return <span className={className}>{formattedValue}</span>;
}

// Activity level indicator component
function ActivityIndicator({ level, label, color, isOptimal }: { 
  level: number; 
  label: string; 
  color: string;
  isOptimal: boolean;
}) {
  const percentage = level * 100;
  
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:bg-white/10 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/80 text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {isOptimal ? (
            <CheckCircle className="w-4 h-4 text-green-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
          )}
          <span className="text-white font-bold">
            <AnimatedCounter 
              value={percentage} 
              duration={800} 
              formatter={(val) => `${val.toFixed(0)}%`}
            />
          </span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: color,
            boxShadow: `0 0 10px ${color}40`
          }}
        />
      </div>
    </div>
  );
}

// Circular progress component
function CircularProgress({ 
  value, 
  size = 120, 
  strokeWidth = 8, 
  color = '#3b82f6',
  label,
  subtitle 
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  subtitle?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - (value * circumference);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
        >
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
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
            style={{
              filter: `drop-shadow(0 0 6px ${color}60)`
            }}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-white">
            <AnimatedCounter 
              value={value * 100} 
              duration={1000} 
              formatter={(val) => `${val.toFixed(0)}%`}
            />
          </div>
          {subtitle && (
            <div className="text-xs text-white/60 text-center">{subtitle}</div>
          )}
        </div>
      </div>
      
      {label && (
        <div className="mt-3 text-sm font-medium text-white text-center">{label}</div>
      )}
    </div>
  );
}

// Diet composition chart
function DietChart({ dietData }: { dietData: Record<string, number> }) {
  const entries = Object.entries(dietData).filter(([_, value]) => (value as number) > 0);
  const total = entries.reduce((sum, [_, value]) => sum + (value as number), 0);
  
  if (total === 0 || entries.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6 text-center">
        <PieChart className="w-8 h-8 text-white/40 mx-auto mb-2" />
        <p className="text-white/60">Ingen dietdata tillgänglig</p>
      </div>
    );
  }

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
    '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
  ];

  // Normalize percentages to ensure they add up to 100%
  const normalizedEntries = entries.map(([food, value]) => [
    food, (value as number) / total
  ]);

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6">
      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
        <PieChart className="w-5 h-5" />
        Dietsammansättning
      </h4>
      
      <div className="space-y-3">
        {normalizedEntries.map(([food, percentage], index) => {
          const percent = Math.round((percentage as number) * 100);
          const color = colors[index % colors.length];
          
          // Better food name translations
          const foodTranslations: Record<string, string> = {
            'fish': 'Fisk',
            'small_fish': 'Småfisk',
            'large_fish': 'Större fisk',
            'plankton': 'Plankton',
            'insects': 'Insekter',
            'crustaceans': 'Kräftdjur',
            'amphibians': 'Groddjur',
            'larvae': 'Larver',
            'worms': 'Maskar',
            'mollusks': 'Blötdjur'
          };
          
          const translatedFood = foodTranslations[food as string] || (food as string);
          
          return (
            <div key={food as string} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-white/80 text-sm">{translatedFood}</span>
              </div>
              <div className="flex items-center gap-2">
                <div 
                  className="h-2 bg-white/10 rounded-full"
                  style={{ width: '60px' }}
                >
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${percent}%`,
                      backgroundColor: color 
                    }}
                  />
                </div>
                <span className="text-white font-medium text-sm w-10 text-right">
                  {percent}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-white/60 text-xs">
          Baserat på artspecifika preferenser och nuvarande förhållanden
        </p>
      </div>
    </div>
  );
}

// Fishing recommendations component
function FishingRecommendations({ recommendations }: { recommendations: any[] }) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-6">
      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
        <Fish className="w-5 h-5 text-blue-400" />
        Rekommenderade metoder
      </h4>
      
      <div className="space-y-3">
        {recommendations.slice(0, 5).map((rec, index) => {
          const effectiveness = rec.effectiveness * 100;
          const color = getSuitabilityColor(rec.effectiveness);
          
          return (
            <div key={rec.method} className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">{rec.method}</span>
                <div className="flex items-center gap-2">
                  <span 
                    className="text-sm font-bold"
                    style={{ color }}
                  >
                    <AnimatedCounter 
                      value={effectiveness} 
                      duration={600 + index * 100} 
                      formatter={(val) => `${val.toFixed(0)}%`}
                    />
                  </span>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <div
                        key={star}
                        className={`w-3 h-3 ${
                          star <= rec.effectiveness * 5 
                            ? 'text-yellow-400' 
                            : 'text-gray-600'
                        }`}
                      >
                        ⭐
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3 h-3 text-white/60" />
                <span className="text-white/70 text-xs">{rec.optimal_timing}</span>
              </div>
              
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ 
                    width: `${effectiveness}%`,
                    backgroundColor: color
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DynamicResultsPanel({ 
  calculatedBehavior, 
  fishName 
}: DynamicResultsPanelProps) {
  const [animationKey, setAnimationKey] = useState(0);

  // Trigger animations when behavior changes
  useEffect(() => {
    setAnimationKey(prev => prev + 1);
  }, [calculatedBehavior]);

  const { 
    overallActivity, 
    activityBreakdown, 
    dietComposition,
    spatialBehavior,
    fishingRecommendations,
    physiologicalState 
  } = calculatedBehavior;

  const activityColor = getActivityLevelColor(overallActivity);

  return (
    <div key={animationKey} className="space-y-8">
      {/* Header with overall metrics */}
      <div className="bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-teal-600/20 backdrop-blur-sm rounded-3xl border border-blue-400/20 p-8">
        <div className="text-center mb-8">
          <h3 className="text-3xl font-light text-white mb-2 flex items-center justify-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-xl flex items-center justify-center">
              <CircuitBoard className="w-6 h-6 text-blue-400" />
            </div>
            Live Beteendeanalys
          </h3>
          <p className="text-white/70 text-lg">
            Realtidsberäkningar för {fishName.toLowerCase()} baserat på nuvarande förhållanden
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
          {/* Overall Activity */}
          <div className="flex justify-center">
            <CircularProgress 
              value={overallActivity}
              size={140}
              strokeWidth={10}
              color={activityColor}
              label="Övergripande aktivitet"
              subtitle="Kombinerat index"
            />
          </div>

          {/* Physiological State */}
          <div className="flex justify-center">
            <CircularProgress 
              value={physiologicalState.metabolism_rate}
              size={120}
              strokeWidth={8}
              color={activityColor}
              label="Metabolisk aktivitet"
              subtitle="Fysiologiskt tillstånd"
            />
          </div>

          {/* Key Metrics */}
          <div className="space-y-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-2">
                <Heart className="w-5 h-5 text-red-400" />
                <span className="text-white/90 font-medium">Metabolism</span>
              </div>
              <div className="text-2xl font-bold text-white">
                <AnimatedCounter 
                  value={physiologicalState.metabolism_rate} 
                  duration={1000} 
                  formatter={(val) => `${val.toFixed(1)}x`}
                />
              </div>
              <div className="text-sm text-white/60">Relativt till baseline</div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-2">
                <Brain className="w-5 h-5 text-purple-400" />
                <span className="text-white/90 font-medium">Stress</span>
              </div>
              <div className="text-2xl font-bold text-white">
                <AnimatedCounter 
                  value={physiologicalState.stress_level * 100} 
                  duration={1000} 
                  formatter={(val) => `${val.toFixed(0)}%`}
                />
              </div>
              <div className="text-sm text-white/60">Miljöstressnivå</div>
            </div>
          </div>
        </div>
      </div>

      {/* Parameter Breakdown */}
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
        <h4 className="text-2xl font-light text-white mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-400/30 to-blue-400/30 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-green-400" />
          </div>
          Parameteranalys
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <ActivityIndicator 
            level={activityBreakdown.temperature.value}
            label="Temperatur"
            color={getActivityLevelColor(activityBreakdown.temperature.value)}
            isOptimal={activityBreakdown.temperature.optimal}
          />
          
          <ActivityIndicator 
            level={activityBreakdown.salinity.value}
            label="Salthalt"
            color={getActivityLevelColor(activityBreakdown.salinity.value)}
            isOptimal={activityBreakdown.salinity.optimal}
          />
          
          <ActivityIndicator 
            level={activityBreakdown.timeOfDay.value}
            label="Tid på dagen"
            color={getActivityLevelColor(activityBreakdown.timeOfDay.value)}
            isOptimal={activityBreakdown.timeOfDay.optimal}
          />
          
          <ActivityIndicator 
            level={activityBreakdown.weather.value}
            label="Väder"
            color={getActivityLevelColor(activityBreakdown.weather.value)}
            isOptimal={activityBreakdown.weather.optimal}
          />
          
          <ActivityIndicator 
            level={activityBreakdown.pressure.value}
            label="Lufttryck"
            color={getActivityLevelColor(activityBreakdown.pressure.value)}
            isOptimal={activityBreakdown.pressure.optimal}
          />

          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:bg-white/10 transition-all duration-300">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-yellow-400" />
              <span className="text-white/90 font-medium text-sm">Synergier</span>
            </div>
            <div className="text-lg font-bold text-green-400">
              +<AnimatedCounter 
                value={overallActivity * 100} 
                duration={800} 
                formatter={(val) => `${val.toFixed(1)}%`}
              />
            </div>
            <div className="text-xs text-white/60 mt-1">
              {activityBreakdown.combined.notes || 'Parameterinteraktioner'}
            </div>
          </div>
        </div>

        {/* Parameter insights */}
        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 backdrop-blur-sm rounded-2xl border border-yellow-400/20 p-6">
          <h5 className="text-white font-medium mb-3 flex items-center gap-2">
            <Eye className="w-5 h-5 text-yellow-400" />
            Viktiga insikter
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {Object.entries(activityBreakdown).filter(([key]) => key !== 'combined').map(([param, data]) => (
              <div key={param} className="bg-white/5 rounded-lg p-3">
                <div className="font-medium text-white/90 capitalize mb-1">
                  {param === 'timeOfDay' ? 'Tid på dagen' : 
                   param === 'pressure' ? 'Lufttryck' :
                   param === 'temperature' ? 'Temperatur' :
                   param === 'salinity' ? 'Salthalt' :
                   param === 'weather' ? 'Väder' : param}
                </div>
                <div className="text-white/70 leading-relaxed">
                  {data.notes}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Diet & Behavior */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <DietChart dietData={dietComposition} />
        <FishingRecommendations recommendations={fishingRecommendations} />
      </div>

      {/* Spatial Behavior */}
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
        <h4 className="text-2xl font-light text-white mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400/30 to-teal-400/30 rounded-xl flex items-center justify-center">
            <MapPin className="w-5 h-5 text-cyan-400" />
          </div>
          Rumsligt beteende
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 text-center">
            <Target className="w-8 h-8 text-blue-400 mx-auto mb-3" />
            <div className="text-2xl font-bold text-white mb-1">
              <AnimatedCounter 
                value={spatialBehavior.preferred_depth.optimal} 
                duration={1000} 
                formatter={(val) => `${val.toFixed(1)}m`}
              />
            </div>
            <div className="text-sm text-white/60">Optimalt djup</div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 text-center">
            <Activity className="w-8 h-8 text-green-400 mx-auto mb-3" />
            <div className="text-2xl font-bold text-white mb-1">
              <AnimatedCounter 
                value={spatialBehavior.horizontal_movement * 100} 
                duration={1000} 
                formatter={(val) => `${val.toFixed(0)}%`}
              />
            </div>
            <div className="text-sm text-white/60">Horisontell rörelse</div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 text-center">
            <TrendingUp className="w-8 h-8 text-purple-400 mx-auto mb-3" />
            <div className="text-2xl font-bold text-white mb-1">
              <AnimatedCounter 
                value={spatialBehavior.vertical_movement * 100} 
                duration={1000} 
                formatter={(val) => `${val.toFixed(0)}%`}
              />
            </div>
            <div className="text-sm text-white/60">Vertikal rörelse</div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 text-center">
            <Fish className="w-8 h-8 text-orange-400 mx-auto mb-3" />
            <div className="text-2xl font-bold text-white mb-1">
              <AnimatedCounter 
                value={spatialBehavior.aggregation_tendency * 100} 
                duration={1000} 
                formatter={(val) => `${val.toFixed(0)}%`}
              />
            </div>
            <div className="text-sm text-white/60">Stimbenägenhet</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gradient-to-r from-gray-500/10 to-slate-500/10 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-gray-400/30 to-slate-400/30 rounded-xl flex items-center justify-center flex-shrink-0">
            <Gauge className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <h4 className="text-white font-medium text-sm mb-2">Avancerad beräkningsmotor</h4>
            <p className="text-white/70 text-sm leading-relaxed mb-3">
              Resultaten beräknas med matematiska modeller som använder Gaussfunktioner, sigmoidkurvor, 
              och circadianrytmer för att skapa realistiska beteendeprediktioner. Parameter-synergier och 
              biologiska begränsningar tas hänsyn till för maximal noggrannhet.
            </p>
            <div className="flex flex-wrap gap-4 text-xs text-white/60">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Aktivitetsgrad: {(overallActivity * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Uppdateringsfrekvens: Realtid</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span>Parametrar analyserade: {Object.keys(activityBreakdown).length - 1}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 