// src/app/page.tsx
'use client';

import dynamic from 'next/dynamic';
const MapView = dynamic(() => import('./components/Map'), { ssr: false });
import ClockKnob from './components/ClockKnob';

export default function Home() {
  return (
    <div className="h-screen w-full flex flex-col lg:flex-row relative overflow-hidden glow-pulse">
      {/* Sidebar hanteras redan av layout.tsx */}

      {/* Main content – fyll hela utrymmet */}
      <div className="flex-1 flex flex-col relative">
        {/* Header + Text */}
        <div className="z-30 flex flex-col items-center justify-center text-center min-h-[120px] pt-12 md:pt-[4vh] mb-2 px-4">
          <h1 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-orange-200 via-yellow-300 to-pink-300 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(255,170,100,0.5)] leading-tight">
            Makrill-Sverige
          </h1>
          <p className="text-sm md:text-lg text-white/90 mt-2 max-w-xs md:max-w-xl drop-shadow-[0_1px_4px_rgba(255,190,120,0.25)] leading-snug">
            Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
          </p>
        </div>

        {/* Karta – ta allt utom ClockKnob på mobil */}
        <div className="relative flex-1 min-h-0">
          <MapView />
        </div>

        {/* Mobil: ClockKnob sticky längst ner */}
        <div className="block lg:hidden fixed bottom-0 left-0 w-full z-50">
          <ClockKnob />
        </div>
      </div>
    </div>
  );
}
