//src/app/page.tsx

'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { getLayoutType, shouldShowMobileSlider, type LayoutType } from '../lib/layoutUtils';

const MapView = dynamic(() => import('./components/Map'), { ssr: false });
const ClockKnob = dynamic(() => import('./components/ClockKnob'), { ssr: false });
const LayerToggleControls = dynamic(() => import('./components/LayerToggleControls'), { ssr: false });

export default function Home() {
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');
  
  // Layer visibility state
  const [showCurrentMagnitude, setShowCurrentMagnitude] = useState(true);
  const [showCurrentVectors, setShowCurrentVectors] = useState(true);
  const [currentMagnitudeOpacity, setCurrentMagnitudeOpacity] = useState(0.8);

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
      {/* KARTA */}
      <div 
        className="flex-1 relative overflow-hidden"
        style={{
          paddingBottom: layoutType === 'mobileLandscape' ? '25vh' : '0'
        }}
      >
        <MapView 
          showZoom={false}
          showCurrentMagnitude={showCurrentMagnitude}
          showCurrentVectors={showCurrentVectors}
          currentMagnitudeOpacity={currentMagnitudeOpacity}
        />
        
        {/* Layer Controls - Desktop: top-left, Mobile: overlay */}
        <LayerToggleControls
          showCurrentMagnitude={showCurrentMagnitude}
          showCurrentVectors={showCurrentVectors}
          onToggleCurrentMagnitude={setShowCurrentMagnitude}
          onToggleCurrentVectors={setShowCurrentVectors}
          currentMagnitudeOpacity={currentMagnitudeOpacity}
          onOpacityChange={setCurrentMagnitudeOpacity}
          className={`absolute z-10 ${
            layoutType === 'desktop' 
              ? 'top-4 left-4' 
              : 'top-2 left-2 right-2'
          }`}
        />
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
