// src/components/Sidebar.tsx

'use client';

import ClockKnob from './ClockKnob';

export default function Sidebar() {
  return (
    <div className="h-full w-full md:w-64 backdrop-blur-sm bg-black/30 text-white p-6 flex flex-col justify-between border-r border-white/10">
      <div>
        {/* Rubrik – visas alltid, men olika storlek */}
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-extrabold bg-gradient-to-r from-orange-200 via-yellow-300 to-pink-300 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(255,170,100,0.5)] leading-tight">
            Makrill-Sverige
          </h1>
          <p className="text-xs lg:text-sm mt-1 text-white/90 leading-snug drop-shadow-[0_1px_4px_rgba(255,190,120,0.25)]">
            Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
          </p>
        </div>

        {/* Meny */}
        <ul className="space-y-2 text-sm">
          <li><a href="#" className="hover:underline">Karta</a></li>
          <li><a href="#" className="hover:underline">Prognoser</a></li>
          <li><a href="#" className="hover:underline">Statistik</a></li>
          <li><a href="#" className="hover:underline">Om</a></li>
        </ul>
      </div>

      {/* Clock hidden on mobile */}
      <div className="mt-6 hidden md:block">
        <ClockKnob />
      </div>
    </div>
  );
}
