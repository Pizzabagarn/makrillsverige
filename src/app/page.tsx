//src/app/page.tsx

'use client';

import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('./components/Map'), { ssr: false });
const ClockKnob = dynamic(() => import('./components/ClockKnob'), { ssr: false });
const MobileTimeSlider = dynamic(() => import('./components/MobileTimeSlider'), { ssr: false });

export default function Home() {
  return (
    <div className="h-screen w-screen flex flex-col lg:flex-row overflow-hidden">
      {/* SIDEBAR hanteras av layout.tsx */}

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col">

        {/* KARTA */}
        <div className="flex-1 relative overflow-hidden">
          <MapView />
        </div>

        {/* MOBIL: TimeSlider under kartan */}
        <div className="block lg:hidden w-full h-[100px] z-10 bg-black/80">
          <MobileTimeSlider />
        </div>
      </div>
    </div>
  );
} 