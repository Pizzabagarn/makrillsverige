'use client';

import { useState } from 'react';

export type LayerType = 'none' | 'temperature' | 'salinity' | 'current' | 'wind' | 'mackerel';
export type DepthLevel = 'surface' | '10m' | '20m' | '30m';

interface LayerControlsProps {
  activeLayer: LayerType;
  onLayerChange: (layer: LayerType) => void;
  activeDepth: DepthLevel;
  onDepthChange: (depth: DepthLevel) => void;
  showMackerelPrediction: boolean;
  onMackerelToggle: (show: boolean) => void;
  showCurrentVectors: boolean;
  onCurrentVectorsToggle: (show: boolean) => void;
  showWindVectors: boolean;
  onWindVectorsToggle: (show: boolean) => void;
}

const layerLabels: Record<LayerType, string> = {
  none: 'Ingen',
  temperature: 'Vattentemperatur',
  salinity: 'Salthalt', 
  current: 'Havsströmmar',
  wind: 'Vind',
  mackerel: 'Makrill-hotspots'
};

const depthLabels: Record<DepthLevel, string> = {
  surface: 'Yta',
  '10m': '10m djup',
  '20m': '20m djup', 
  '30m': '30m djup'
};

export default function LayerControls({
  activeLayer,
  onLayerChange,
  activeDepth,
  onDepthChange,
  showMackerelPrediction,
  onMackerelToggle,
  showCurrentVectors,
  onCurrentVectorsToggle,
  showWindVectors,
  onWindVectorsToggle
}: LayerControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-black/60 backdrop-blur-sm text-white rounded-lg shadow-lg">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="font-semibold text-sm">🗺️ Kartlager</h3>
        <svg 
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          
          {/* Grundläggande datalager - endast ett åt gången enligt specifikationen */}
          <div>
            <label className="block text-xs font-medium text-white/90 mb-2">
              Grundlager (välj ett)
            </label>
            <div className="space-y-2">
              {Object.entries(layerLabels).map(([key, label]) => (
                <label key={key} className="flex items-center space-x-2 text-sm">
                  <input
                    type="radio"
                    name="layer"
                    value={key}
                    checked={activeLayer === key}
                    onChange={(e) => onLayerChange(e.target.value as LayerType)}
                    className="text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-white/90">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Djupnivå - endast för temperatur och salthalt */}
          {(activeLayer === 'temperature' || activeLayer === 'salinity') && (
            <div>
              <label className="block text-xs font-medium text-white/90 mb-2">
                Djupnivå
              </label>
              <select
                value={activeDepth}
                onChange={(e) => onDepthChange(e.target.value as DepthLevel)}
                className="w-full bg-black/40 border border-white/20 rounded text-sm p-2 text-white"
              >
                {Object.entries(depthLabels).map(([key, label]) => (
                  <option key={key} value={key} className="bg-gray-800">
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Överlagringar - kan kombineras med grundlager */}
          <div>
            <label className="block text-xs font-medium text-white/90 mb-2">
              Överlagringar
            </label>
            <div className="space-y-2">
              
              {/* Makrill-prognos enligt specifikationen */}
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={showMackerelPrediction}
                  onChange={(e) => onMackerelToggle(e.target.checked)}
                  className="text-green-500 focus:ring-green-500"
                />
                <span className="text-white/90">Makrill-prognos</span>
              </label>

              {/* Strömvektorer */}
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={showCurrentVectors}
                  onChange={(e) => onCurrentVectorsToggle(e.target.checked)}
                  className="text-blue-500 focus:ring-blue-500"
                />
                <span className="text-white/90">Strömpilar</span>
              </label>

              {/* Vindvektorer */}
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={showWindVectors}
                  onChange={(e) => onWindVectorsToggle(e.target.checked)}
                  className="text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-white/90">Vindpilar</span>
              </label>
            </div>
          </div>
          
          {/* Legend för aktivt lager */}
          {activeLayer !== 'none' && (
            <div className="border-t border-white/20 pt-3">
              <div className="text-xs font-medium text-white/90 mb-2">
                Legend: {layerLabels[activeLayer]}
              </div>
              <div className="flex justify-between text-xs text-white/70">
                {activeLayer === 'temperature' && (
                  <>
                    <span>5°C</span>
                    <div className="flex-1 h-3 mx-2 bg-gradient-to-r from-blue-500 via-green-500 to-red-500 rounded"></div>
                    <span>20°C</span>
                  </>
                )}
                {activeLayer === 'salinity' && (
                  <>
                    <span>20‰</span>
                    <div className="flex-1 h-3 mx-2 bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 rounded"></div>
                    <span>35‰</span>
                  </>
                )}
                {activeLayer === 'mackerel' && (
                  <>
                    <span>Låg</span>
                    <div className="flex-1 h-3 mx-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded"></div>
                    <span>Hög</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 