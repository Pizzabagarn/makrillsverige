// src/components/Sidebar.tsx

'use client';

import { useEffect, useState } from 'react';
import ClockKnob from './ClockKnob';
import { getLayoutType, type LayoutType } from '../../lib/layoutUtils';

export default function Sidebar() {
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');

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

  const isMobileLandscape = layoutType === 'mobileLandscape';
  const isMobilePortrait = layoutType === 'mobilePortrait';
  const isTabletLandscape = layoutType === 'tabletLandscape';
  const isMobile = isMobilePortrait || isMobileLandscape; // Only small mobile orientations
  const compactPadding = (isMobileLandscape || isTabletLandscape) ? 'clamp(0.25rem, 1vh, 0.75rem)' : '1.5rem';
  
  return (
    <div className="h-full w-full backdrop-blur-sm bg-black/30 text-white flex flex-col justify-between border-r border-white/10" style={{ padding: compactPadding }}>
      <div>
        {/* RUBRIK & TEXT */}
        <h1 className={`font-bold bg-gradient-to-r from-orange-200 via-yellow-300 to-pink-300 bg-clip-text text-transparent drop-shadow ${(isMobileLandscape || isTabletLandscape) ? 'text-sm mb-1' : 'text-2xl mb-2'}`}>
          {(isMobileLandscape || isTabletLandscape) ? 'Makrill' : 'Makrill-Sverige'}
        </h1>
        {!isMobileLandscape && !isTabletLandscape && (
          <p className="text-sm text-white/90 leading-snug mb-4">
            Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
          </p>
        )}

        <ul className={`space-y-2 ${(isMobileLandscape || isTabletLandscape) ? 'text-xs space-y-1' : 'text-sm'}`}>
          <li><a href="#" className="hover:underline">Karta</a></li>
          <li><a href="#" className="hover:underline">Prognoser</a></li>
          <li><a href="#" className="hover:underline">Statistik</a></li>
          <li><a href="#" className="hover:underline">Om</a></li>
        </ul>
      </div>

      {/* Clock - dölj bara för små mobila lägen (där MobileTimeSlider visas) */}
      {!isMobile && (
        <div className={`${(isMobileLandscape || isTabletLandscape) ? 'mt-1' : 'mt-6'}`}>
          <ClockKnob />
        </div>
      )}
    </div>
  );
}