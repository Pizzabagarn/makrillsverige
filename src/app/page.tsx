//src/app/page.tsx

'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { getLayoutType, shouldShowMobileSlider, type LayoutType } from '../lib/layoutUtils';

const MapView = dynamic(() => import('./components/Map'), { ssr: false });
const MobileTimeSlider = dynamic(() => import('./components/MobileTimeSlider'), { ssr: false });

export default function Home() {
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

  return (
    <div className="w-full h-full flex flex-col">
      {/* KARTA */}
      <div className="flex-1 relative overflow-hidden">
        <MapView showZoom={false} />
      </div>

      {/* MOBIL PORTRAIT: TimeSlider under kartan */}
      {layoutType === 'mobilePortrait' && (
        <div
          className="w-full z-10 px-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.45)] border-x border-b border-white/10 ring-1 ring-white/10 h-[18vh] flex flex-col justify-center"
          style={{ ['--mtscale' as any]: 'calc(18vh / 120px)' } as React.CSSProperties}
        >
          <MobileTimeSlider className="backdrop-blur-2xl text-white py-3" />
        </div>
      )}
    </div>
  );
}
