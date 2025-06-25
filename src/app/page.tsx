//src/app/page.tsx

'use client';

import { Suspense, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getLayoutType, shouldShowMobileSlider, type LayoutType } from '../lib/layoutUtils';
import { TimeSliderProvider } from './context/TimeSliderContext';
import LayerControls from './components/LayerControls';

// Import nya MapLibre GL-kartan istället för Leaflet
const MapLibreMap = dynamic(() => import('./components/MapLibreMap'), { ssr: false });
const ClockKnob = dynamic(() => import('./components/ClockKnob'), { ssr: false });

export default function Home() {
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');
  
  // Layer control states enligt specifikationen
  const [activeLayer, setActiveLayer] = useState<'none' | 'temperature' | 'salinity' | 'current' | 'wind' | 'mackerel'>('none');
  const [activeDepth, setActiveDepth] = useState<'surface' | '10m' | '20m' | '30m'>('surface');
  const [showMackerelOverlay, setShowMackerelOverlay] = useState(false);
  const [showCurrentVectors, setShowCurrentVectors] = useState(false);
  const [showWindVectors, setShowWindVectors] = useState(false);
  const [mackerelThreshold, setMackerelThreshold] = useState(0.6);

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
    <TimeSliderProvider>
      <div className="max-h-dvh h-full w-full flex flex-col lg:flex-row overflow-hidden">
        {/* KARTA - fyller hela skärmen för desktop, anpassas för mobil */}
        <div 
          className="flex-1 relative overflow-hidden"
          style={{
            paddingBottom: layoutType === 'mobileLandscape' ? '25vh' : '0'
          }}
        >
          <Suspense fallback={
            <div className="w-full h-full bg-blue-900 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
                <p>Laddar avancerad kartvisualisering...</p>
              </div>
            </div>
          }>
            <MapLibreMap
              activeLayer={activeLayer}
              activeDepth={activeDepth}
              showMackerelOverlay={showMackerelOverlay}
              showCurrentVectors={showCurrentVectors}
              showWindVectors={showWindVectors}
              mackerelThreshold={mackerelThreshold}
            />
          </Suspense>
          
          {/* Enkla Lagerkontroller som overlay i högerhörnet */}
          <div className="absolute top-4 right-4 z-40">
            <LayerControls
              activeLayer={activeLayer}
              onLayerChange={setActiveLayer}
              activeDepth={activeDepth}
              onDepthChange={setActiveDepth}
              showMackerelPrediction={showMackerelOverlay}
              onMackerelToggle={setShowMackerelOverlay}
              showCurrentVectors={showCurrentVectors}
              onCurrentVectorsToggle={setShowCurrentVectors}
              showWindVectors={showWindVectors}
              onWindVectorsToggle={setShowWindVectors}
            />
          </div>

          {/* Alla visualiseringar är nu integrerade i MapLibreMap */}
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
    </TimeSliderProvider>
  );
}
