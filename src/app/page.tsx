// src/app/page.tsx
'use client';

import dynamic from 'next/dynamic';
const MapView = dynamic(() => import('./components/Map'), { ssr: false });
import ClockKnob from './components/ClockKnob';

export default function Home() {
  return (
    <div className="h-screen w-full bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center flex flex-col items-center px-2 pt-6">
      <div className="absolute top-0 left-0 right-0 h-[100px] bg-gradient-to-b from-black/40 to-transparent z-10" />

      <div className="z-30 relative flex flex-col items-center justify-center text-center min-h-[120px] pt-12 md:pt-[4vh] mb-4 px-4">
        <h1 className="text-3xl md:text-5xl font-extrabold bg-gradient-to-r from-orange-200 via-yellow-300 to-pink-300 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(255,170,100,0.5)] leading-tight">
          Makrill-Sverige
        </h1>
        <p className="text-sm md:text-lg text-white/90 mt-2 max-w-xs md:max-w-xl drop-shadow-[0_1px_4px_rgba(255,190,120,0.25)] leading-snug">
          Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
        </p>
      </div>

      <MapView />

      <div className="fixed bottom-[140px] left-1/2 transform -translate-x-1/2 z-50 w-[90%] md:hidden">
        <ClockKnob />
      </div>
    </div>
  );
} 