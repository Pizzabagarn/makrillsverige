//src/app/page.tsx

'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const MapView = dynamic(() => import('./components/Map'), { ssr: false });
const ClockKnob = dynamic(() => import('./components/ClockKnob'), { ssr: false });
const MobileTimeSlider = dynamic(() => import('./components/MobileTimeSlider'), { ssr: false });

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="h-screen w-screen flex flex-col lg:flex-row overflow-hidden">
      {/* SIDEBAR hanteras av layout.tsx */}

      {/* MAIN CONTENT */}
      <div className="flex-1 relative overflow-hidden max-h-[625px] md:max-h-full">

        {/* Hamburger-ikon för mobil */}
        <button
          className="md:hidden fixed top-4 left-4 z-50 bg-black/70 text-white rounded-full p-2 shadow-lg"
          onClick={() => setSidebarOpen(true)}
          aria-label="Öppna meny"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>

        {/* KARTA */}
        <div className="absolute top-0 left-0 right-0 bottom-[112px] md:bottom-0 overflow-hidden">
          <MapView showZoom={false} />
        </div>

        {/* MOBIL: TimeSlider under kartan */}
        <div
          className="md:hidden absolute bottom-0 left-0 right-0 z-10 px-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.45)] border-x border-b border-white/10 ring-1 ring-white/10 flex flex-col justify-center"
          style={{ 
            height: '112px', // Fast 112px (18% av 625px)
            ['--mtscale' as any]: 'calc(112px / 120px)' 
          } as React.CSSProperties}
        >
          <MobileTimeSlider className="backdrop-blur-2xl text-white py-3" />
        </div>
      </div>
    </div>
  );
}
