'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Layers, Waves } from 'lucide-react';
import { processSpatialData, FishBehaviorData } from '@/lib/fishBehaviorData';

// Dynamic import for ApexCharts to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface SpatialDistributionChartsProps {
  fishData: FishBehaviorData;
}

export default function SpatialDistributionCharts({ fishData }: SpatialDistributionChartsProps) {
  const [spatialData, setSpatialData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (fishData) {
      const processed = processSpatialData(fishData);
      setSpatialData(processed);
      setIsLoading(false);
    }
  }, [fishData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (spatialData.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-gradient-to-br from-gray-400/20 to-gray-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
          <MapPin className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-white/60">Ingen rumslig fördelningsinformation tillgänglig för {fishData.svenskt_namn.toLowerCase()}</p>
      </div>
    );
  }

  // Generate depth interval chart
  const getDepthIntervalChart = () => {
    const categories = spatialData.map(item => item.scenario);
    const depthRanges = spatialData.map(item => [item.depth.min, item.depth.max]);
    
    return {
      series: [
        {
          name: 'Djupintervall',
          data: depthRanges
        }
      ],
      options: {
        chart: {
          type: 'rangeBar' as const,
          height: 300,
          background: 'transparent',
          toolbar: { show: false }
        },
        plotOptions: {
          bar: {
            horizontal: true,
            barHeight: '60%',
            rangeBarOverlap: false,
            colors: {
              ranges: [{
                from: 0,
                to: 50,
                color: '#06b6d4'
              }]
            }
          }
        },
        dataLabels: {
          enabled: true,
          formatter: function(val: any) {
            return `${val[0]}-${val[1]}m`;
          },
          style: {
            colors: ['#ffffff'],
            fontSize: '11px'
          }
        },
        xaxis: {
          type: 'numeric' as const,
          labels: {
            style: { colors: '#e2e8f0', fontSize: '11px' },
            formatter: (value: string) => `${value}m`
          },
          title: {
            text: 'Djup (meter)',
            style: { color: '#e2e8f0', fontSize: '12px' }
          }
        },
        yaxis: {
          categories: categories,
          labels: {
            style: { colors: '#e2e8f0', fontSize: '11px' }
          }
        },
        grid: {
          borderColor: '#374151',
          strokeDashArray: 2
        },
        colors: ['#06b6d4'],
        tooltip: {
          theme: 'dark' as const,
          x: {
            formatter: (val: any, opts: any) => {
              const category = categories[opts.dataPointIndex];
              return category;
            }
          },
          y: {
            formatter: (val: any) => `${val}m djup`
          }
        }
      }
    };
  };

  // Get zone color
  const getZoneColor = (zone: string) => {
    switch (zone.toLowerCase()) {
      case 'kustnära': return 'text-green-400 bg-green-400/20';
      case 'utomskärs': return 'text-blue-400 bg-blue-400/20';
      default: return 'text-gray-400 bg-gray-400/20';
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light text-white mb-2">Rumslig fördelning</h2>
        <p className="text-white/60">Var {fishData.svenskt_namn.toLowerCase()} håller till vid olika tider</p>
      </div>

      {/* Depth Intervals Chart */}
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400/20 to-blue-400/20 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Djupintervall per säsong/tid</h3>
            <p className="text-white/60 text-sm">Typiska djup för olika perioder</p>
          </div>
        </div>

        {typeof window !== 'undefined' && spatialData.length > 0 && (
          <Chart
            options={getDepthIntervalChart().options}
            series={getDepthIntervalChart().series}
            type="rangeBar"
            height={300}
          />
        )}
      </div>

      {/* Detailed Spatial Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {spatialData.map((item, index) => (
          <div key={index} className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-white font-medium text-base">{item.scenario}</h4>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getZoneColor(item.zone)}`}>
                {item.zone}
              </span>
            </div>

            {/* Depth visualization */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Waves className="w-4 h-4 text-blue-400" />
                <span className="text-white/80 text-sm">Djupområde</span>
              </div>
              
              <div className="relative">
                {/* Depth scale background */}
                <div className="h-8 bg-gradient-to-r from-cyan-400/20 via-blue-400/20 to-indigo-400/20 rounded-lg overflow-hidden">
                  {/* Depth range indicator */}
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-400 to-blue-400 rounded-lg flex items-center justify-center"
                    style={{
                      width: `${Math.min((item.depth.max - item.depth.min) / Math.max(...spatialData.map(d => d.depth.max)) * 100, 100)}%`,
                      marginLeft: `${(item.depth.min / Math.max(...spatialData.map(d => d.depth.max))) * 100}%`
                    }}
                  >
                    <span className="text-white text-xs font-medium">
                      {item.depth.min}-{item.depth.max}m
                    </span>
                  </div>
                </div>
                
                {/* Depth labels */}
                <div className="flex justify-between text-xs text-white/60 mt-1">
                  <span>0m (yta)</span>
                  <span>{Math.max(...spatialData.map(d => d.depth.max))}m (djup)</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="p-3 bg-white/5 rounded-lg">
              <p className="text-white/80 text-sm leading-relaxed">
                {item.notes}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Habitat Insights */}
      <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 backdrop-blur-sm rounded-3xl border border-purple-400/20 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-400/30 to-indigo-400/30 rounded-xl flex items-center justify-center">
            <MapPin className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Habitattips</h3>
            <p className="text-white/60 text-sm">Var du troligtvis hittar fisken</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Depth strategy */}
          <div className="space-y-3">
            <h4 className="text-purple-400 font-medium text-sm">🎯 Djupstrategi:</h4>
            <div className="space-y-2">
              {spatialData.slice(0, 2).map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-purple-400 rounded-full flex-shrink-0"></div>
                  <span className="text-white/90">{item.scenario}:</span>
                  <span className="text-purple-300">{item.depth.min}-{item.depth.max}m</span>
                </div>
              ))}
            </div>
          </div>

          {/* Zone preferences */}
          <div className="space-y-3">
            <h4 className="text-blue-400 font-medium text-sm">🌊 Områdespreferenser:</h4>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(spatialData.map(item => item.zone))).map((zone, idx) => (
                <span key={idx} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${getZoneColor(zone)}`}>
                  {zone}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* General habitat advice */}
        <div className="mt-4 p-4 bg-white/5 rounded-xl">
          <p className="text-white/80 text-sm leading-relaxed">
            <strong className="text-purple-400">Fisketips:</strong> Observera djup- och områdesförändringar mellan säsonger. 
            Många fiskar följer temperaturskikt och födotillgång, vilket påverkar var de håller hus under året.
          </p>
        </div>
      </div>

      {/* Depth legend */}
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
        <h4 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          Djupguide
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-cyan-300 rounded-full"></div>
            <span className="text-white/80">0-5m: Grund</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
            <span className="text-white/80">5-15m: Medel</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
            <span className="text-white/80">15-30m: Djup</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-indigo-700 rounded-full"></div>
            <span className="text-white/80">30m+: Mycket djup</span>
          </div>
        </div>
      </div>
    </div>
  );
} 