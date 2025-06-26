'use client';

import React from 'react';
import { COLOR_SCALES } from './RasterOverlay';

interface MapLegendProps {
  activeLayer: 'none' | 'temperature' | 'salinity' | 'current' | 'wind' | 'mackerel';
  showCurrentVectors: boolean;
  showWindVectors: boolean;
  className?: string;
}

interface LegendItemProps {
  title: string;
  colorScale: typeof COLOR_SCALES.temperature;
  unit: string;
}

function ColorScaleLegend({ title, colorScale, unit }: LegendItemProps) {
  const { min, max, colors, labels } = colorScale;
  
  // Skapa CSS gradient från färgarray
  const gradientStops = colors.map((color, index) => {
    const percent = (index / (colors.length - 1)) * 100;
    return `${color} ${percent}%`;
  }).join(', ');
  
  return (
    <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-200">
      <div className="font-semibold text-sm text-gray-800 mb-2">{title}</div>
      
      {/* Färgskala enligt guidens specifikation */}
      <div className="flex items-center space-x-2">
        <span className="text-xs text-gray-600 font-mono">{min}{unit}</span>
        
        <div 
          className="h-3 w-32 rounded-sm border border-gray-300"
          style={{
            background: `linear-gradient(to right, ${gradientStops})`
          }}
        />
        
        <span className="text-xs text-gray-600 font-mono">{max}{unit}</span>
      </div>
      
      {/* Detaljerade etiketter om utrymme finns */}
      <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
        {labels.slice(0, 3).map((label, index) => (
          <span key={index} className="font-mono">{label}</span>
        ))}
      </div>
    </div>
  );
}

function VectorLegend({ type }: { type: 'current' | 'wind' }) {
  const titles = {
    current: 'Strömriktning & hastighet',
    wind: 'Vindriktning & hastighet'
  };
  
  const units = {
    current: 'm/s',
    wind: 'm/s'
  };
  
  return (
    <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-200">
      <div className="font-semibold text-sm text-gray-800 mb-2">{titles[type]}</div>
      
      <div className="flex items-center space-x-3">
        {/* Pilikon som exempel */}
        <div className="flex items-center space-x-1">
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            className="text-blue-600"
            style={{ transform: 'rotate(45deg)' }}
          >
            <path 
              d="M12 2L12 22M19 9L12 2L5 9" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span className="text-xs text-gray-600">Riktning</span>
        </div>
        
        {/* Färgförklaring för hastighet */}
        <div className="flex items-center space-x-1">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
          </div>
          <span className="text-xs text-gray-600">Hastighet ({units[type]})</span>
        </div>
      </div>
      
      <div className="text-xs text-gray-500 mt-1">
        Pilarnas färg indikerar hastighet enligt färgskalan
      </div>
    </div>
  );
}

function MackerelLegend() {
  return (
    <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-200">
      <div className="font-semibold text-sm text-gray-800 mb-2">Makrill hotspots</div>
      
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-xs text-gray-600">Utmärkt (80-100%)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-lime-400 rounded-full"></div>
          <span className="text-xs text-gray-600">Bra (65-80%)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
          <span className="text-xs text-gray-600">Rimlig (50-65%)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-orange-400 rounded-full"></div>
          <span className="text-xs text-gray-600">Låg (&lt;50%)</span>
        </div>
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        Sannolikhet baserad på temperatur, salthalt & ström
      </div>
    </div>
  );
}

export default function MapLegend({ 
  activeLayer, 
  showCurrentVectors, 
  showWindVectors,
  className = "absolute bottom-4 left-4"
}: MapLegendProps) {
  
  // Bestäm vilka legender som ska visas baserat på aktiva lager
  const showTemperatureLegend = activeLayer === 'temperature';
  const showSalinityLegend = activeLayer === 'salinity';
  const showCurrentLegend = activeLayer === 'current' || showCurrentVectors;
  const showMackerelLegend = activeLayer === 'mackerel';
  
  // Om inga lager är aktiva, visa ingen legend
  if (!showTemperatureLegend && !showSalinityLegend && !showCurrentLegend && 
      !showWindVectors && !showMackerelLegend) {
    return null;
  }
  
  return (
    <div className={`${className} z-10 pointer-events-none`}>
      <div className="space-y-2 max-w-xs">
        {/* Temperatur legend */}
        {showTemperatureLegend && (
          <ColorScaleLegend
            title="Havstemperatur"
            colorScale={COLOR_SCALES.temperature}
            unit="°C"
          />
        )}
        
        {/* Salthalt legend */}
        {showSalinityLegend && (
          <ColorScaleLegend
            title="Salthalt"
            colorScale={COLOR_SCALES.salinity}
            unit=" psu"
          />
        )}
        
        {/* Strömhastighet legend (när det visas som raster) */}
        {activeLayer === 'current' && (
          <ColorScaleLegend
            title="Strömhastighet"
            colorScale={COLOR_SCALES.currentSpeed}
            unit=" m/s"
          />
        )}
        
        {/* Ström-vektor legend */}
        {showCurrentLegend && activeLayer !== 'current' && (
          <VectorLegend type="current" />
        )}
        
        {/* Vind-vektor legend */}
        {showWindVectors && (
          <VectorLegend type="wind" />
        )}
        
        {/* Makrill legend */}
        {showMackerelLegend && (
          <MackerelLegend />
        )}
        
        {/* Informationstext längst ner */}
        <div className="bg-black/50 backdrop-blur-sm p-2 rounded text-xs text-white">
          Data från DMI DKSS-modellen • Uppdateras var 6:e timme
        </div>
      </div>
    </div>
  );
}