'use client';

import { Fish, Clock, Thermometer, Gauge, Target } from 'lucide-react';
import { FishBehaviorData, getMethodTimingIcon } from '@/lib/fishBehaviorData';

interface FishingTipsCardsProps {
  fishData: FishBehaviorData;
}

export default function FishingTipsCards({ fishData }: FishingTipsCardsProps) {
  // Get method timing icon
  const getTimingIcon = (timing?: string[]) => {
    if (!timing || timing.length === 0) return '🎣';
    if (timing.includes('dawn') || timing.includes('dusk')) return '🌅';
    if (timing.includes('night')) return '🌙';
    if (timing.includes('day')) return '☀️';
    return '🎣';
  };

  // Get temperature range color
  const getTempColor = (temp?: { min: number; max: number }) => {
    if (!temp) return 'text-blue-400';
    const avg = (temp.min + temp.max) / 2;
    if (avg <= 8) return 'text-blue-400';
    if (avg <= 16) return 'text-green-400';
    return 'text-orange-400';
  };

  // Get speed indicator color
  const getSpeedColor = (speed: string) => {
    switch (speed.toLowerCase()) {
      case 'very slow': return 'text-blue-400';
      case 'slow': return 'text-cyan-400'; 
      case 'moderate': return 'text-green-400';
      case 'fast': return 'text-orange-400';
      case 'very fast': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light text-white mb-2">Fisketips & Metoder</h2>
        <p className="text-white/60">Rekommenderade tekniker för {fishData.svenskt_namn.toLowerCase()}</p>
      </div>

      {/* Recommended Methods */}
      {fishData.recommended_methods && fishData.recommended_methods.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Fish className="w-5 h-5 text-green-400" />
            Rekommenderade metoder
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fishData.recommended_methods.map((method, index) => (
              <div key={index} className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-5 hover:bg-white/10 transition-all duration-300">
                <div className="flex items-start gap-3 mb-3">
                  <div className="text-2xl flex-shrink-0 mt-1">
                    {getTimingIcon(method.best_time)}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-medium text-base mb-1">
                      {method.method}
                    </h4>
                    
                    {/* Timing indicators */}
                    {method.best_time && method.best_time.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {method.best_time.map((time, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 rounded-lg text-xs text-blue-300">
                            <Clock className="w-3 h-3" />
                            {time === 'dawn' ? 'Gryning' : 
                             time === 'day' ? 'Dag' :
                             time === 'dusk' ? 'Skymning' : 
                             time === 'night' ? 'Natt' : time}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* Temperature range */}
                    {method.best_temp && (
                      <div className="flex items-center gap-1 mb-2">
                        <Thermometer className={`w-3 h-3 ${getTempColor(method.best_temp)}`} />
                        <span className={`text-xs ${getTempColor(method.best_temp)}`}>
                          {method.best_temp.min}-{method.best_temp.max}{method.best_temp.unit}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <p className="text-white/80 text-sm leading-relaxed">
                  {method.notes}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fishing Tactics */}
      {fishData.fishing_tactics && fishData.fishing_tactics.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-400" />
            Fisketaktik & Hastighet
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fishData.fishing_tactics.map((tactic, index) => (
              <div key={index} className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-blue-400" />
                    <span className="text-white font-medium text-sm">
                      {tactic.parameter === 'water_temperature' ? 'Vattentemperatur' :
                       tactic.parameter === 'season' ? 'Säsong' : tactic.parameter}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Gauge className={`w-4 h-4 ${getSpeedColor(tactic.retrieve_speed)}`} />
                    <span className={`text-sm font-medium ${getSpeedColor(tactic.retrieve_speed)}`}>
                      {tactic.retrieve_speed === 'very slow' ? 'Mycket långsam' :
                       tactic.retrieve_speed === 'slow' ? 'Långsam' :
                       tactic.retrieve_speed === 'moderate' ? 'Måttlig' :
                       tactic.retrieve_speed === 'fast' ? 'Snabb' :
                       tactic.retrieve_speed === 'very fast' ? 'Mycket snabb' : tactic.retrieve_speed}
                    </span>
                  </div>
                </div>
                
                {/* Condition range */}
                <div className="mb-3 p-2 bg-white/5 rounded-lg">
                  <span className="text-white/60 text-xs">Förhållanden: </span>
                  <span className="text-white text-sm">
                    {tactic.range?.min !== undefined && tactic.range?.max !== undefined ? 
                      `${tactic.range.min}-${tactic.range.max}${tactic.range.unit || ''}` :
                      Array.isArray(tactic.range) ? tactic.range.join(', ') :
                      tactic.range?.values ? tactic.range.values.join(', ') :
                      'Generellt'
                    }
                  </span>
                </div>
                
                <p className="text-white/80 text-sm leading-relaxed">
                  {tactic.notes}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Tips Summary */}
      <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm rounded-3xl border border-green-400/20 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-green-400/30 to-emerald-400/30 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Snabbtips</h3>
            <p className="text-white/60 text-sm">Viktiga punkter att komma ihåg</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Method summary */}
          {fishData.recommended_methods && fishData.recommended_methods.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-green-400 font-medium text-sm">🎯 Bästa metoderna:</h4>
              <ul className="space-y-1">
                {fishData.recommended_methods.slice(0, 2).map((method, idx) => (
                  <li key={idx} className="text-white/80 text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0"></div>
                    {method.method}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Timing summary */}
          <div className="space-y-2">
            <h4 className="text-blue-400 font-medium text-sm">⏰ Bästa tiderna:</h4>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(
                fishData.recommended_methods?.flatMap(m => m.best_time || []) || []
              )).map((time, idx) => (
                <span key={idx} className="px-2 py-1 bg-blue-500/20 rounded text-xs text-blue-300">
                  {time === 'dawn' ? 'Gryning' : 
                   time === 'day' ? 'Dag' :
                   time === 'dusk' ? 'Skymning' : 
                   time === 'night' ? 'Natt' : time}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Regulations Notice */}
      {fishData.regulations && (
        <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 backdrop-blur-sm rounded-3xl border border-yellow-400/20 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400/30 to-orange-400/30 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Fiskeregler</h3>
              <p className="text-white/60 text-sm">Viktigt att veta</p>
            </div>
          </div>
          
          <div className="space-y-2">
            {fishData.regulations.closed_season && fishData.regulations.closed_season.length > 0 && (
              <div>
                <h4 className="text-yellow-400 font-medium text-sm mb-2">🚫 Fredningsperioder:</h4>
                {fishData.regulations.closed_season.map((period, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-white/80 mb-1">
                    <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full flex-shrink-0"></div>
                    <span>{period.start} - {period.end}</span>
                    <span className="text-white/60">({period.area})</span>
                  </div>
                ))}
              </div>
            )}
            
            {fishData.regulations.notes && (
              <p className="text-white/80 text-sm leading-relaxed mt-3 p-3 bg-white/5 rounded-lg">
                {fishData.regulations.notes}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 