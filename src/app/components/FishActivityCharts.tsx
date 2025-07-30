'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Clock, Thermometer, CloudRain, Moon, Gauge } from 'lucide-react';
import { processActivityData, FishBehaviorData, getActivityColor } from '@/lib/fishBehaviorData';

// Dynamic import for ApexCharts to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface FishActivityChartsProps {
  fishData: FishBehaviorData;
}

export default function FishActivityCharts({ fishData }: FishActivityChartsProps) {
  const [activityData, setActivityData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (fishData) {
      const processed = processActivityData(fishData);
      setActivityData(processed);
      setIsLoading(false);
    }
  }, [fishData]);

  if (isLoading || !activityData) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Daily rhythm chart configuration
  const getDailyRhythmChart = () => {
    const timeLabels = ['Gryning', 'Dag', 'Skymning', 'Natt'];
    const timeData = [0.3, 0.6, 0.9, 0.4]; // Base activity levels
    
    // Map actual data if available
    const mappedData = timeLabels.map(label => {
      const englishTime = {
        'Gryning': 'dawn',
        'Dag': 'day', 
        'Skymning': 'dusk',
        'Natt': 'night'
      }[label];
      
      const found = activityData.timeOfDay.find((t: any) => t.time === englishTime);
      return found ? found.activityLevel : 0.3;
    });

    return {
      series: [
        {
          name: 'Aktivitetsnivå',
          data: mappedData.map(val => Math.round(val * 100))
        }
      ],
      options: {
        chart: {
          type: 'bar' as const,
          height: 250,
          background: 'transparent',
          toolbar: { show: false }
        },
        plotOptions: {
          bar: {
            horizontal: false,
            columnWidth: '55%',
            borderRadius: 4,
            colors: {
              ranges: mappedData.map((val, idx) => ({
                from: idx,
                to: idx,
                color: getActivityColor(val)
              }))
            }
          }
        },
        dataLabels: { enabled: false },
        xaxis: {
          categories: timeLabels,
          labels: {
            style: { colors: '#e2e8f0', fontSize: '12px' }
          }
        },
        yaxis: {
          labels: {
            style: { colors: '#e2e8f0', fontSize: '11px' },
            formatter: (value: number) => `${value}%`
          },
          min: 0,
          max: 100
        },
        grid: {
          borderColor: '#374151',
          strokeDashArray: 2
        },
        theme: { mode: 'dark' as const },
        tooltip: {
          theme: 'dark',
          y: {
            formatter: (value: number) => `${value}% aktivitet`
          }
        }
      }
    };
  };

  // Temperature gauge chart
  const getTemperatureChart = () => {
    if (!activityData.temperature) return null;

    const temp = activityData.temperature;
    return {
      series: [temp.optimal],
      options: {
        chart: {
          type: 'radialBar' as const,
          height: 200
        },
        plotOptions: {
          radialBar: {
            startAngle: -135,
            endAngle: 135,
            hollow: {
              margin: 0,
              size: '70%',
              background: 'transparent',
              position: 'front' as const
            },
            track: {
              background: '#374151',
              strokeWidth: '67%',
              margin: 0
            },
            dataLabels: {
              show: true,
              name: {
                offsetY: -10,
                show: true,
                color: '#e2e8f0',
                fontSize: '13px'
              },
              value: {
                color: '#22d3ee',
                fontSize: '30px',
                show: true,
                formatter: () => `${temp.optimal}°C`
              }
            }
          }
        },
        fill: {
          type: 'gradient',
          gradient: {
            shade: 'dark',
            type: 'horizontal',
            shadeIntensity: 0.5,
            gradientToColors: ['#06b6d4'],
            inverseColors: true,
            opacityFrom: 1,
            opacityTo: 1,
            stops: [0, 100]
          }
        },
        stroke: { lineCap: 'round' as const },
        labels: ['Optimal temp']
      }
    };
  };

  // Weather conditions chart
  const getWeatherChart = () => {
    const weatherLabels = ['Klart', 'Soligt', 'Mulet', 'Lätt regn', 'Regn'];
    const weatherData = [0.3, 0.4, 0.8, 0.9, 0.7]; // Default values
    
    // Map actual data if available
    const mappedWeatherData = weatherLabels.map(label => {
      const englishWeather = {
        'Klart': 'clear',
        'Soligt': 'sunny',
        'Mulet': 'overcast',
        'Lätt regn': 'light_rain',
        'Regn': 'rain'
      }[label];
      
      const found = activityData.weather.find((w: any) => w.condition === englishWeather);
      return found ? found.activityLevel : 0.3;
    });

    return {
      series: [
        {
          name: 'Aktivitet',
          data: mappedWeatherData.map(val => Math.round(val * 100))
        }
      ],
      options: {
        chart: {
          type: 'radar' as const,
          height: 250,
          background: 'transparent'
        },
        xaxis: {
          categories: weatherLabels,
          labels: {
            style: { colors: '#e2e8f0', fontSize: '11px' }
          }
        },
        yaxis: {
          show: false,
          min: 0,
          max: 100
        },
        plotOptions: {
          radar: {
            size: 90,
            polygons: {
              strokeColor: '#374151',
              fill: { colors: ['transparent'] }
            }
          }
        },
        colors: ['#06b6d4'],
        markers: {
          size: 4,
          colors: ['#06b6d4'],
          strokeColor: '#ffffff',
          strokeWidth: 2
        },
        tooltip: {
          theme: 'dark',
          y: {
            formatter: (value: number) => `${value}% aktivitet`
          }
        }
      }
    };
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light text-white mb-2">Aktivitetsmönster</h2>
        <p className="text-white/60">När {fishData.svenskt_namn.toLowerCase()} är mest aktiv</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Rhythm */}
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Dygnsrytm</h3>
              <p className="text-white/60 text-sm">Aktivitet över dygnet</p>
            </div>
          </div>
          
          {typeof window !== 'undefined' && (
            <Chart
              options={getDailyRhythmChart().options}
              series={getDailyRhythmChart().series}
              type="bar"
              height={250}
            />
          )}
          
          <div className="mt-4 p-3 bg-white/5 rounded-lg">
            <p className="text-white/80 text-sm leading-relaxed">
              {activityData.timeOfDay[0]?.notes || 
               'Aktiviteten varierar med ljusförhållanden och födotillgång under dygnet.'}
            </p>
          </div>
        </div>

        {/* Temperature Gauge */}
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-red-400/20 to-orange-400/20 rounded-xl flex items-center justify-center">
              <Thermometer className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Vattentemperatur</h3>
              <p className="text-white/60 text-sm">Optimal temperatur</p>
            </div>
          </div>
          
          {typeof window !== 'undefined' && activityData.temperature && (
            <Chart
              options={getTemperatureChart()?.options}
              series={getTemperatureChart()?.series}
              type="radialBar"
              height={200}
            />
          )}
          
          {activityData.temperature && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/60">Intervall:</span>
                <span className="text-white">
                  {activityData.temperature.min}-{activityData.temperature.max}°C
                </span>
              </div>
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-white/80 text-sm leading-relaxed">
                  {activityData.temperature.notes}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Weather Radar */}
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-xl flex items-center justify-center">
              <CloudRain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Väderpåverkan</h3>
              <p className="text-white/60 text-sm">Aktivitet vid olika väder</p>
            </div>
          </div>
          
          {typeof window !== 'undefined' && (
            <Chart
              options={getWeatherChart().options}
              series={getWeatherChart().series}
              type="radar"
              height={250}
            />
          )}
        </div>

        {/* Environmental Factors */}
        <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400/20 to-emerald-400/20 rounded-xl flex items-center justify-center">
              <Gauge className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Miljöfaktorer</h3>
              <p className="text-white/60 text-sm">Påverkande faktorer</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Air Pressure */}
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-400/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L13.5 6.5H18L14.5 9.5L16 14L12 11L8 14L9.5 9.5L6 6.5H10.5L12 2Z"/>
                  </svg>
                </div>
                <span className="text-white text-sm">Lufttryck</span>
              </div>
              <div className="text-right">
                <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                <span className="text-white/60 text-xs">Fallande bäst</span>
              </div>
            </div>

            {/* Moon Phase */}
            {activityData.moonPhase.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-400/20 rounded-lg flex items-center justify-center">
                    <Moon className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-white text-sm">Månfas</span>
                </div>
                <div className="text-right">
                  <div className="flex gap-1">
                    {activityData.moonPhase.map((phase: any, idx: number) => (
                      <div 
                        key={idx}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getActivityColor(phase.activityLevel) }}
                      ></div>
                    ))}
                  </div>
                  <span className="text-white/60 text-xs">Varierande påverkan</span>
                </div>
              </div>
            )}

            {/* Salinity */}
            {activityData.salinity && (
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-cyan-400/20 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2M21 9V7L12 2L3 7V9H21M21 10H3V21C3 21.6 3.4 22 4 22H20C20.6 22 21 21.6 21 21V10Z"/>
                    </svg>
                  </div>
                  <span className="text-white text-sm">Salthalt</span>
                </div>
                <div className="text-right">
                  <span className="text-white text-sm">
                    {activityData.salinity.min}-{activityData.salinity.max}{activityData.salinity.unit}
                  </span>
                  <div className="text-white/60 text-xs">Toleransområde</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 