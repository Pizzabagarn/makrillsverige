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

      <div className="
  absolute bottom-0 left-0 w-full max-w-[440px] mx-auto z-[1000]
  h-[50vh] px-0   /* Default för större enheter */

  iph15promax:h-[50vh]
  iph14promax:h-[50vh]

  iph13pro:h-[46vh] iph13pro:px-2
  iph15pro:h-[46vh] iph15pro:px-2
  iph13_15:h-[44vh] iph13_15:px-2
  iph13mini:h-[42vh] iph13mini:px-3
  iphxr:h-[48vh] iphxr:px-2
  px7:h-[45vh] px7:px-2
  px3xl:h-[44vh] px3xl:px-2
  xs:h-[42vh] xs:px-3
  s8:h-[40vh] s8:px-3
  s5:h-[38vh] s5:px-4

  md:hidden
">
        <div className="w-full h-full bg-black/80 backdrop-blur-md rounded-none md:rounded-t-2xl shadow-xl">
          <ClockKnob />
        </div>
      </div>
    </div>
  );
}
