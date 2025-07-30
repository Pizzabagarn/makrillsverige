'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { PieChart } from 'lucide-react';
import { processDietData, FishBehaviorData } from '@/lib/fishBehaviorData';

// Dynamic import for ApexCharts to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface FishDietChartsProps {
  fishData: FishBehaviorData;
}

export default function FishDietCharts({ fishData }: FishDietChartsProps) {
  const [dietScenarios, setDietScenarios] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (fishData) {
      const processed = processDietData(fishData);
      setDietScenarios(processed);
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

  if (dietScenarios.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-gradient-to-br from-gray-400/20 to-gray-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
          <PieChart className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-white/60">Ingen detaljerad dietinformation tillgänglig för {fishData.svenskt_namn.toLowerCase()}</p>
      </div>
    );
  }

  // Generate pie chart configuration
  const getPieChartConfig = (scenario: any) => {
    const colors = [
      '#10b981', // Emerald
      '#3b82f6', // Blue  
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#8b5cf6', // Purple
      '#06b6d4', // Cyan
      '#84cc16', // Lime
      '#f97316'  // Orange
    ];

    return {
      series: scenario.dietData.map((item: any) => item.value),
      options: {
        chart: {
          type: 'donut' as const,
          background: 'transparent'
        },
        colors: colors.slice(0, scenario.dietData.length),
        labels: scenario.dietData.map((item: any) => item.name),
        plotOptions: {
          pie: {
            donut: {
              size: '45%',
              labels: {
                show: true,
                name: {
                  show: true,
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#e2e8f0'
                },
                value: {
                  show: true,
                  fontSize: '14px',
                  color: '#94a3b8',
                  formatter: (val: string) => `${val}%`
                },
                total: {
                  show: true,
                  showAlways: false,
                  label: 'Total',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#e2e8f0'
                }
              }
            }
          }
        },
        dataLabels: {
          enabled: false
        },
        legend: {
          show: true,
          position: 'bottom' as const,
          labels: {
            colors: '#e2e8f0',
            useSeriesColors: false
          },
          markers: {
            width: 8,
            height: 8,
            strokeWidth: 0,
            radius: 2
          }
        },
        stroke: {
          width: 2,
          colors: ['#1e293b']
        },
        tooltip: {
          theme: 'dark' as const,
          y: {
            formatter: (value: number) => `${value}% av dieten`
          }
        },
        responsive: [
          {
            breakpoint: 768,
            options: {
              legend: {
                position: 'bottom' as const,
                fontSize: '12px'
              }
            }
          }
        ]
      }
    };
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light text-white mb-2">Födopreferenser</h2>
        <p className="text-white/60">Vad {fishData.svenskt_namn.toLowerCase()} äter under olika förhållanden</p>
      </div>
      
      <div className={`grid gap-6 ${dietScenarios.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
        {dietScenarios.map((scenario, index) => {
          const chartConfig = getPieChartConfig(scenario);
          
          return (
            <div key={index} className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full mb-3">
                  <PieChart className="w-4 h-4 text-blue-400" />
                  <span className="text-white font-medium text-sm">{scenario.condition}</span>
                </div>
                <h3 className="text-lg font-light text-white">{scenario.scenario}</h3>
              </div>
              
              {typeof window !== 'undefined' && (
                <div className="mb-4">
                  <Chart
                    options={chartConfig.options}
                    series={chartConfig.series}
                    type="donut"
                    height={280}
                  />
                </div>
              )}
              
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-white/80 text-sm leading-relaxed">
                  {scenario.notes}
                </p>
              </div>
              
              {/* Diet composition summary */}
              <div className="mt-4 space-y-2">
                <h4 className="text-white font-medium text-sm">Huvudsaklig föda:</h4>
                <div className="flex flex-wrap gap-2">
                  {scenario.dietData
                    .sort((a: any, b: any) => b.value - a.value)
                    .slice(0, 3)
                    .map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: chartConfig.options.colors[scenario.dietData.indexOf(item)] }}
                        ></div>
                        <span className="text-white/90 text-xs font-medium">
                          {item.name} ({item.value}%)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Diet insights */}
      {dietScenarios.length > 1 && (
        <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 backdrop-blur-sm rounded-3xl border border-emerald-400/20 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400/30 to-green-400/30 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Dietinsikter</h3>
              <p className="text-white/60 text-sm">Viktiga samband för fiskaren</p>
            </div>
          </div>
          
          <div className="text-white/80 leading-relaxed space-y-2">
            <p className="text-sm">
              <strong className="text-emerald-400">Tips för beteagin:</strong> 
              {' '}Välj bete som matchar fiskens naturliga föda vid aktuella förhållanden.
            </p>
            
            {/* Generate diet tips based on data */}
            {dietScenarios.some((s: any) => s.dietData.some((d: any) => d.name.includes('Fisk'))) && (
              <p className="text-sm">
                <strong className="text-blue-400">Rovfiskstips:</strong>
                {' '}Denna art jagar aktivt fisk - använd rörliga beten som imiterar småfisk.
              </p>
            )}
            
            {dietScenarios.some((s: any) => s.dietData.some((d: any) => d.name.includes('Insekter'))) && (
              <p className="text-sm">
                <strong className="text-purple-400">Insektsdiet:</strong>
                {' '}Flugor och maskar kan vara mycket effektiva beten, särskilt under kläckningsperioder.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 