// src/components/Sidebar.tsx

'use client';

import ClockKnob from './ClockKnob';

export default function Sidebar() {
  return (
    <div className="h-full w-full md:w-64 backdrop-blur-sm bg-black/30 text-white p-6 flex flex-col justify-between border-r border-white/10">
      <div>
        <h2 className="text-xl font-bold mb-4">Makrill</h2>
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