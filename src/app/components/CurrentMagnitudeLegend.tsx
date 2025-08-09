'use client';

import { useMemo } from 'react';

// 🌊 BALANSERAD FÖRDELNING av färger från 0.0 till 1.3 m/s (20 steg)
// Varje färgkategori får ungefär lika mycket utrymme
const CURRENT_COLORS = [
  '#000066', // 0.000 m/s - Mörkblå
  '#0033CC', // 0.065 m/s - Blå
  '#0066CC', // 0.130 m/s - Ljusblå
  '#00CCFF', // 0.195 m/s - Cyan (0.2)
  '#00FFCC', // 0.260 m/s - Cyan-grön
  '#00FF66', // 0.325 m/s - Grön (0.3)
  '#33FF33', // 0.390 m/s - Ljusgrön (0.4)
  '#66FF00', // 0.455 m/s - Gul-grön övergång (0.5)
  '#99FF00', // 0.520 m/s - Ljusare gul-grön
  '#CCFF00', // 0.585 m/s - Gul-grön
  '#FFFF00', // 0.650 m/s - Ren gul
  '#FFCC00', // 0.715 m/s - Gul-orange (0.7)
  '#FF9900', // 0.780 m/s - Orange (0.8)
  '#FF6600', // 0.845 m/s - Orange-röd
  '#FF3300', // 0.910 m/s - Röd (0.9)
  '#CC0000', // 0.975 m/s - Mörkröd (1.0)
  '#990000', // 1.040 m/s - Mörkare röd (1.1)
  '#660000', // 1.105 m/s - Mycket mörkröd (1.1)
  '#330000', // 1.170 m/s - Extremt mörkröd (1.2)
  '#220000'  // 1.235-1.300 m/s - Mycket mörk röd för extremvärden (1.3)
];

const CURRENT_COLORMAP = [
  { value: 0.0, color: '#000066', label: '0.0' },
  { value: 0.4, color: '#33FF33', label: '0.4' },
  { value: 0.8, color: '#FF9900', label: '0.8' },
  { value: 1.3, color: '#000000', label: '1.3+' }
];

interface CurrentMagnitudeLegendProps {
  visible?: boolean;
  className?: string;
}

export default function CurrentMagnitudeLegend({ 
  visible = true, 
  className = "" 
}: CurrentMagnitudeLegendProps) {
  
  const colors = useMemo(() => {
    // Jämn fördelning - varje färg får lika stor plats
    return CURRENT_COLORS.map((color, index) => {
      const progress = index / (CURRENT_COLORS.length - 1);
      return {
        color,
        position: progress * 100
      };
    });
  }, []);

  if (!visible) return null;

  return (
    <div className={`backdrop-blur-md bg-black/80 border border-white/20 rounded-lg shadow-xl text-white max-[380px]:p-2 p-3 sm:p-4 max-[380px]:w-32 w-44 lg:w-56 ${className}`}>
      {/* Titel */}
              <div className="flex items-center mb-2 sm:mb-3 w-full relative">
        <div className="max-[380px]:w-3 max-[380px]:h-3 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-r from-blue-900 via-cyan-400 via-green-400 via-yellow-400 via-orange-500 to-red-900 rounded-full flex items-center justify-center flex-shrink-0">
        </div>
        <h3 className="max-[380px]:text-[10px] text-xs sm:text-sm font-semibold absolute inset-0 flex items-center justify-center">Strömstyrka</h3>
      </div>
      
      {/* Balanserad färgfördelning */}
      <div className="space-y-1">
        {/* Gradient bar - balanserad fördelning */}
        <div 
          className="w-full max-[380px]:h-3 h-5 sm:h-6 rounded border border-gray-600 shadow-inner"
          style={{
            background: `linear-gradient(to right, ${colors.map(c => `${c.color} ${c.position}%`).join(', ')})`
          }}
        />
        
        {/* Tick marks och labels */}
        <div className="relative mt-1 sm:mt-2">
                      <div className="flex justify-between items-start max-[380px]:text-[10px] text-xs">
              {CURRENT_COLORMAP.map((item, index) => (
                <div key={item.label} className="flex flex-col items-center">
                  {/* Tick mark */}
                  <div className="w-px max-[380px]:h-1 h-1.5 bg-gray-400 mb-0.5" />
                  {/* Label */}
                  <span className="max-[380px]:text-[10px] text-xs text-gray-300 leading-none">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
        </div>
        
        {/* Enhet */}
        <div className="text-center mt-1">
          <span className="max-[380px]:text-[9px] text-xs text-gray-300">m/s</span>
        </div>
      </div>
    </div>
  );
} 