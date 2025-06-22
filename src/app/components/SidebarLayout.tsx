// src/app/components/SidebarLayout.tsx
'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

export default function SidebarWithToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Mät verklig viewport-höjd och sätt CSS-variabeln --vh
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty(
        '--vh',
        `${window.innerHeight * 0.01}px`
      );
    };
    setVh();
    window.addEventListener('resize', setVh);
    return () => window.removeEventListener('resize', setVh);
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* Bakgrund + dim */}
      <div className="absolute inset-0 bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 bg-black/30 z-0" />

      {/* Layout-wrapper */}
      <div className="relative z-10 flex h-full">
        {/* Stationär sidebar */}
        <div className="hidden md:block landscape:block w-64 shrink-0">
          <Sidebar />
        </div>

        {/* Hamburger för mobil */}
        <div className="md:hidden fixed top-4 left-4 z-1001 landscape:hidden">
          <button
            onClick={() => setOpen(!open)}
            className="bg-white/20 backdrop-blur-md p-2 rounded-md text-white"
          >
            ☰
          </button>
        </div>

        {/* Mobil-popup-sidebar */}
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

        {/* Huvudinnehåll */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
