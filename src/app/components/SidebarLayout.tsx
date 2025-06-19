// src/components/SidebarLayout.tsx

'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';

export default function SidebarWithToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative h-screen w-full bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center bg-no-repeat">
      {/* Bakgrundsdim */}
      <div className="absolute inset-0 bg-black/30 z-0" />

      {/* Innehåll */}
      <div className="relative z-10 flex h-full">
        {/* Sidebar för desktop */}
        <div className="hidden md:block w-48">
          <Sidebar />
        </div>

        {/* Hamburger för mobil */}
        <div className="md:hidden fixed top-4 left-4 z-20">
          <button
            onClick={() => setOpen(!open)}
            className="bg-white/20 backdrop-blur-md p-2 rounded-md text-white"
          >
            ☰
          </button>

          {open && (
            <div className="absolute top-12 left-0 w-48 bg-black/70 backdrop-blur-md rounded-md z-50">
              <Sidebar />
            </div>
          )}
        </div>
        

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
