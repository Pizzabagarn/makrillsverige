//src/app/components/SidebarLayout.tsx

'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';

export default function SidebarWithToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative h-screen w-full">
      {/* Bakgrundsbild + dim */}
      <div className="absolute inset-0 bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 bg-black/30 z-0" />

      {/* Layout-wrapper */}
      <div className="relative z-10 flex h-full">
        {/* SIDEBAR – desktop + mobil-landskap */}
        <div className="hidden md:block landscape:block w-64 shrink-0">
          <Sidebar />
        </div>

        {/* HAMBURGER – endast mobil-porträtt */}
        <div className="md:hidden fixed top-4 left-4 z-50 landscape:hidden">
          <button
            onClick={() => setOpen(!open)}
            className="bg-white/20 backdrop-blur-md p-2 rounded-md text-white"
          >
            ☰
          </button>
        </div>

        {/* MOBIL-SIDEBAR POPUP */}
        {open && (
          <div className="fixed top-0 left-0 z-[9999] h-full w-[80vw] max-w-[280px] bg-black/90 backdrop-blur-md p-6 text-white shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 text-xl font-bold"
            >
              ✕
            </button>
            <Sidebar />
          </div>
        )}

        {/* HUVUDINNEHÅLL – karta m.m. */}
        <main className="flex-1 h-full overflow-hidden">{children}</main>
      </div>
    </div>
  );
}




// Note: This component is designed to be used as a wrapper around the main content
// in your application, providing a responsive sidebar layout with a toggleable sidebar for mobile devices.