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
      <div className="flex-1 flex flex-col">

        {/* Hamburger-ikon för mobil */}
        <button
          className="md:hidden fixed top-4 left-4 z-50 bg-black/70 text-white rounded-full p-2 shadow-lg"
          onClick={() => setSidebarOpen(true)}
          aria-label="Öppna meny"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>

        {/* KARTA */}
        <div className="flex-1 relative overflow-hidden">
          <MapView showZoom={false} />
        </div>

        {/* MOBIL: TimeSlider under kartan */}
        <div className="block md:hidden w-full z-10 bg-black/80 px-2">
          <MobileTimeSlider className="bg-black/80 backdrop-blur-xl text-white py-3" />
        </div>
      </div>
    </div>
  );
}
