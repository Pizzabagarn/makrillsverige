// src/components/Sidebar.tsx

'use client';

import ClockKnob from './ClockKnob';

export default function Sidebar() {
  return (
    <div className="h-full w-full md:w-64 backdrop-blur-sm bg-black/30 text-white p-6 flex flex-col justify-between border-r border-white/10">
      <div>
        {/* RUBRIK & TEXT HÄR ISTÄLLET */}
        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-200 via-yellow-300 to-pink-300 bg-clip-text text-transparent drop-shadow mb-2">
          Makrill-Sverige
        </h1>
        <p className="text-sm text-white/90 leading-snug mb-4">
          Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
        </p>

        <ul className="space-y-2 text-sm">
          <li><a href="#" className="hover:underline">Karta</a></li>
          <li><a href="#" className="hover:underline">Prognoser</a></li>
          <li><a href="#" className="hover:underline">Statistik</a></li>
          <li><a href="#" className="hover:underline">Om</a></li>
        </ul>
      </div>

      {/* ClockKnob visas i sidebar på desktop och landscape/ipads */}
      <div className="mt-6 hidden md:block">
        <ClockKnob />
      </div>
    </div>
  );
}