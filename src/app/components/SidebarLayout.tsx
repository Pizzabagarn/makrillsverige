//src/app/components/SidebarLayout.tsx

'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { getLayoutType, shouldShowSidebar, shouldShowHamburger, type LayoutType } from '../../lib/layoutUtils';

export default function SidebarWithToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');

  useEffect(() => {
    const checkLayout = () => {
      setLayoutType(getLayoutType());
    };
    
    checkLayout();
    window.addEventListener('resize', checkLayout);
    window.addEventListener('orientationchange', checkLayout);
    
    return () => {
      window.removeEventListener('resize', checkLayout);
      window.removeEventListener('orientationchange', checkLayout);
    };
  }, []);

  return (
    <div className="relative h-screen w-full">
      {/* Bakgrundsbild & dim */}
      <div className="absolute inset-0 bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 bg-black/30 z-0" />

      {/* Innehåll i desktop */}
      <div className="relative z-10 flex h-full">
        {/* Sidebar för desktop och mobil landscape */}
        {shouldShowSidebar(layoutType) && (
          <div 
            className="block w-64" 
            style={{ width: layoutType === 'mobileLandscape' ? 'clamp(200px, 25vh, 280px)' : undefined }}
          >
            <Sidebar />
          </div>
        )}

        {/* Hamburger-knapp för tablets och andra mellanstorlekar */}
        {shouldShowHamburger(layoutType) && (
          <div className="fixed top-4 left-4 z-1000">
            <button
              onClick={() => setOpen(!open)}
              className="bg-white/20 backdrop-blur-md p-2 rounded-md text-white"
            >
              ☰
            </button>
          </div>
        )}

        {/* Popup-sidebar mobil */}
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


        {/* Main content */}
        <main className="flex-1 h-full overflow-hidden">{children}</main>
      </div>
    </div>
  );
}


// Note: This component is designed to be used as a wrapper around the main content
// in your application, providing a responsive sidebar layout with a toggleable sidebar for mobile devices.