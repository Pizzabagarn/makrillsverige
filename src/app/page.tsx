//src/app/page.tsx

'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { getLayoutType, shouldShowMobileSlider, type LayoutType } from '../lib/layoutUtils';

// Import MapLibre instead of Leaflet Map
const MapLibreMap = dynamic(() => import('./components/MapLibreMap'), { ssr: false });
const ClockKnob = dynamic(() => import('./components/ClockKnob'), { ssr: false });

export default function Home() {
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');
  
  // Map configuration state - matching MapLibreMap props
  const [activeLayer, setActiveLayer] = useState<'none' | 'temperature' | 'salinity' | 'current' | 'wind' | 'mackerel'>('none');
  const [activeDepth, setActiveDepth] = useState<'surface' | '10m' | '20m' | '30m'>('surface');
  const [showMackerelOverlay, setShowMackerelOverlay] = useState(false);
  const [showCurrentVectors, setShowCurrentVectors] = useState(true); // Enable current vectors by default
  const [showWindVectors, setShowWindVectors] = useState(false);
  const [mackerelThreshold, setMackerelThreshold] = useState(0.7);

  useEffect(() => {
    const checkLayout = () => {
      setLayoutType(getLayoutType());
    };
    
    checkLayout();
    window.addEventListener('resize', checkLayout);
    window.addEventListener('orientationchange', checkLayout);
    
    return () => {
      window.removeEventListener('resize', checkLayout);
      window.removeEventListener('orientationchange', checkLayout);
    };
  }, []);

  return (
    <div className="max-h-dvh h-full w-full flex flex-col lg:flex-row overflow-hidden">
      {/* KARTA - MapLibre implementation */}
      <div 
        className="flex-1 relative overflow-hidden"
        style={{
          paddingBottom: layoutType === 'mobileLandscape' ? '25vh' : '0'
        }}
      >
        <MapLibreMap 
          activeLayer={activeLayer}
          activeDepth={activeDepth}
          showMackerelOverlay={showMackerelOverlay}
          showCurrentVectors={showCurrentVectors}
          showWindVectors={showWindVectors}
          mackerelThreshold={mackerelThreshold}
        />
        
        {/* Layer controls - positioned in top right */}
        <div className="absolute top-4 right-4 z-10 space-y-2">
          <div className="bg-black/60 backdrop-blur-sm text-white p-3 rounded-lg">
            <div className="text-sm font-medium mb-2">Lager</div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveLayer(activeLayer === 'temperature' ? 'none' : 'temperature')}
                className={`block w-full text-left px-2 py-1 rounded text-xs ${
                  activeLayer === 'temperature' ? 'bg-blue-500/50' : 'hover:bg-white/10'
                }`}
              >
                Temperatur
              </button>
              <button
                onClick={() => setShowCurrentVectors(!showCurrentVectors)}
                className={`block w-full text-left px-2 py-1 rounded text-xs ${
                  showCurrentVectors ? 'bg-blue-500/50' : 'hover:bg-white/10'
                }`}
              >
                Havsströmmar
              </button>
              <button
                onClick={() => setShowMackerelOverlay(!showMackerelOverlay)}
                className={`block w-full text-left px-2 py-1 rounded text-xs ${
                  showMackerelOverlay ? 'bg-green-500/50' : 'hover:bg-white/10'
                }`}
              >
                Makrill-hotspots
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MOBIL (PORTRAIT & SMALL LANDSCAPE): ClockKnob under/över kartan */}
      {(layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape') && (
        <div
          className={`w-full px-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.45)] border-x border-b border-white/10 ring-1 ring-white/10 flex flex-col justify-center ${
            layoutType === 'mobileLandscape' 
              ? 'h-[25vh] fixed bottom-0 left-0 right-0 z-[1001]' 
              : 'h-[18vh] z-10'
          }`}
          style={{ ['--mtscale' as any]: `calc(${layoutType === 'mobileLandscape' ? '25vh' : '18vh'} / 120px)` } as React.CSSProperties}
        >
          <ClockKnob />
        </div>
      )}
    </div>
  );
}
