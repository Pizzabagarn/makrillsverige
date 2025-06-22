// src/app/page.tsx
// src/app/page.tsx
'use client';

import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('./components/Map'), { ssr: false });
const ClockKnob = dynamic(() => import('./components/ClockKnob'), { ssr: false });

export default function Home() {
  return (
    <div className="h-screen w-full flex flex-col lg:flex-row relative overflow-hidden">
      <div className="flex-1 flex flex-col relative">
        {/* KARTA */}
        <div className="relative flex-1 min-h-0 z-0">
          <MapView />
        </div>

        {/* Mobil: ClockKnob längst ner, max 30vh */}
        <div className="block md:hidden fixed bottom-0 left-0 w-full z-50">
          <div className="w-full max-w-screen overflow-hidden bg-black/80 backdrop-blur-md rounded-t-2xl shadow-xl h-[30vh]">
            <ClockKnob />
          </div>
        </div>
      </div>
    </div>
  );
}

