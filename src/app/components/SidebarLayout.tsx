//src/app/components/SidebarLayout.tsx

'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { getLayoutType, shouldShowSidebar, shouldShowHamburger, type LayoutType } from '../../lib/layoutUtils';
import { useLayer } from '../context/LayerContext';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export default function SidebarWithToggle({ children }: SidebarLayoutProps) {
  const {
    showCurrentMagnitude,
    showCurrentVectors,
    setShowCurrentMagnitude,
    setShowCurrentVectors
  } = useLayer();
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

  // Close menu when layout changes
  useEffect(() => {
    if (layoutType === 'desktop' || layoutType === 'tabletLandscape') {
      setOpen(false);
    }
  }, [layoutType]);

  return (
    <div className="relative h-dvh w-full">
      {/* Bakgrundsbild & dim */}
      <div className="absolute inset-0 bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 bg-black/30 z-0" />

      {/* Innehåll i desktop */}
      <div className="relative z-10 flex h-full">
        {/* Sidebar - visa för desktop och tabletLandscape */}
        {(layoutType === 'desktop' || layoutType === 'tabletLandscape') && (
          <div 
            className="block flex-shrink-0"
            style={{
              width: layoutType === 'tabletLandscape' 
                ? 'clamp(200px, 20vw, 300px)'  // Mer responsiv bredd för tablets
                : '256px'
            }}
          >
            <Sidebar 
              showCurrentMagnitude={showCurrentMagnitude}
              showCurrentVectors={showCurrentVectors}
              onToggleCurrentMagnitude={setShowCurrentMagnitude}
              onToggleCurrentVectors={setShowCurrentVectors}
            />
          </div>
        )}

        {/* Hamburgerknapp - förbättrad design */}
        {(layoutType === 'tablet' || layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape') && (
          <div className="fixed top-4 left-4 z-[1001]">
            <button
              onClick={() => setOpen(!open)}
              className={`
                relative overflow-hidden
                bg-gradient-to-br from-white/25 via-white/20 to-white/15 
                backdrop-blur-md border border-white/30
                p-3 rounded-xl text-white text-lg font-medium
                shadow-lg hover:shadow-xl
                transition-all duration-300 ease-out
                hover:scale-105 hover:bg-white/30
                active:scale-95
                ${open ? 'bg-white/30 scale-105' : ''}
              `}
              aria-label="Toggle menu"
            >
              <div className={`transition-transform duration-300 ease-out ${open ? 'rotate-90' : ''}`}>
                {open ? '✕' : '☰'}
              </div>
            </button>
          </div>
        )}

        {/* Backdrop overlay med smooth transition */}
        <div 
          className={`
            fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm
            transition-all duration-300 ease-out
            ${open ? 'opacity-100 visible' : 'opacity-0 invisible'}
          `}
          onClick={() => setOpen(false)}
        />

        {/* Popup-sidebar mobil - BREDARE för att få plats med kartlager (65% av skärmbredden) */}
        <div 
          className={`
            fixed top-0 left-0 z-[9999] h-full 
            w-[65%]
            bg-gradient-to-br from-black/95 via-black/90 to-black/85
            backdrop-blur-xl border-r border-white/20
            text-white shadow-2xl
            transition-all duration-300 ease-out
            ${open 
              ? 'translate-x-0 opacity-100' 
              : '-translate-x-full opacity-0'
            }
          `}
        >
          {/* Stängknapp */}
          <button
            onClick={() => setOpen(false)}
            className="
              absolute top-4 right-4 
              w-8 h-8 rounded-full
              bg-white/20 hover:bg-white/30
              border border-white/30
              text-white text-sm font-bold
              transition-all duration-200 ease-out
              hover:scale-110 active:scale-95
              flex items-center justify-center
            "
            aria-label="Close menu"
          >
            ✕
          </button>

          {/* Sidebar innehåll med padding för stängknappen - nu med kartlager som huvudinnehåll */}
          <div className="h-full pt-16 pb-6 px-4">
            <Sidebar 
              isHamburgerMenu={true}
              showCurrentMagnitude={showCurrentMagnitude}
              showCurrentVectors={showCurrentVectors}
              onToggleCurrentMagnitude={setShowCurrentMagnitude}
              onToggleCurrentVectors={setShowCurrentVectors}
            />
                    </div>
        </div>

        {/* Main content */}
        <main className="flex-1 h-full overflow-hidden">{children}</main>
      </div>
    </div>
  );
}


// Note: This component is designed to be used as a wrapper around the main content
// in your application, providing a responsive sidebar layout with a toggleable sidebar for mobile devices.