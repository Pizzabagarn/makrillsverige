'use client';

import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('./components/Map'), { ssr: false });
const ClockKnob = dynamic(() => import('./components/ClockKnob'), { ssr: false });

export default function Home() {
  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      {/* Karta (70%) */}
      <div className="flex-1 min-h-0">
        <MapView />
      </div>

      {/* KLOCKA (absolut över kartan längst ner) */}
      <div className="md:hidden absolute bottom-0 left-0 w-full h-[50vh] z-[1000]">
        <div className="w-full h-full bg-black/80 backdrop-blur-md rounded-none md:rounded-t-2xl shadow-xl">
          <ClockKnob />
        </div>
      </div>
    </div>
  );
}
