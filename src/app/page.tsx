// src/app/page.tsx
'use client';

import dynamic from 'next/dynamic';
const MapView = dynamic(() => import('./components/Map'), { ssr: false });
import ClockKnob from './components/ClockKnob';

export default function Home() {
  return (
    <div className="h-screen w-full bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center flex flex-col items-center px-2 pt-6">
      <div className="absolute top-0 left-0 right-0 h-[100px] bg-gradient-to-b from-black/40 to-transparent z-10" />

      <div className="text-center text-white mb-2 px-2 z-20">
        <h1 className="text-3xl font-extrabold drop-shadow-lg">Makrill-Sverige</h1>
        <p className="text-sm mt-1 drop-shadow-sm">
          Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
        </p>
      </div>

      <MapView />

      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-[92%] md:hidden">
        <ClockKnob />
      </div>
    </div>
  );
}
