// src/components/Sidebar.tsx

'use client';

import { useEffect, useState } from 'react';
import ClockKnob from './ClockKnob';
import { getLayoutType, type LayoutType } from '../../lib/layoutUtils';

interface SidebarProps {
  isHamburgerMenu?: boolean;
}

export default function Sidebar({ isHamburgerMenu = false }: SidebarProps) {
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

  const isMobileLandscape = layoutType === 'mobileLandscape';
  const isMobilePortrait = layoutType === 'mobilePortrait';
  const isTabletLandscape = layoutType === 'tabletLandscape';
  const isMobile = isMobilePortrait || isMobileLandscape; // Only small mobile orientations
  
  // Responsiv styling baserat på om det är hamburgermenyn eller vanlig sidebar
  const getResponsiveStyles = () => {
    if (isHamburgerMenu) {
      // Specifik styling för hamburgermenyn - mycket kompakt
      return {
        padding: '0',
        titleSize: 'text-lg',
        titleMargin: 'mb-3',
        showDescription: false,
        menuTextSize: 'text-sm',
        menuSpacing: 'space-y-3',
        showClock: false,
        titleText: 'Makrill'
      };
    } else if (isMobileLandscape || isTabletLandscape) {
      return {
        padding: 'clamp(0.25rem, 1vh, 0.75rem)',
        titleSize: 'text-sm',
        titleMargin: 'mb-1',
        showDescription: false,
        menuTextSize: 'text-xs',
        menuSpacing: 'space-y-1',
        showClock: true,
        titleText: 'Makrill'
      };
    } else {
      return {
        padding: '1.5rem',
        titleSize: 'text-2xl',
        titleMargin: 'mb-2',
        showDescription: true,
        menuTextSize: 'text-sm',
        menuSpacing: 'space-y-2',
        showClock: true,
        titleText: 'Makrill-Sverige'
      };
    }
  };

  const styles = getResponsiveStyles();
  
  return (
    <div 
      className={`h-full w-full ${!isHamburgerMenu ? 'backdrop-blur-sm bg-black/30 border-r border-white/10' : ''} text-white flex flex-col justify-between`} 
      style={{ padding: styles.padding }}
    >
      <div>
        {/* RUBRIK & TEXT */}
        <h1 className={`font-bold bg-gradient-to-r from-orange-200 via-yellow-300 to-pink-300 bg-clip-text text-transparent drop-shadow ${styles.titleSize} ${styles.titleMargin}`}>
          {styles.titleText}
        </h1>
        
        {styles.showDescription && (
          <p className="text-sm text-white/90 leading-snug mb-4">
            Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
          </p>
        )}

        <ul className={`${styles.menuSpacing} ${styles.menuTextSize}`}>
          <li><a href="#" className="hover:underline block py-1">Karta</a></li>
          <li><a href="#" className="hover:underline block py-1">Prognoser</a></li>
          <li><a href="#" className="hover:underline block py-1">Statistik</a></li>
          <li><a href="#" className="hover:underline block py-1">Om</a></li>
        </ul>
      </div>

      {/* Clock - dölj för små mobila lägen och hamburgermenyn */}
      {styles.showClock && !isMobile && (
        <div className={`${(isMobileLandscape || isTabletLandscape) ? 'mt-1' : 'mt-6'}`}>
          <ClockKnob />
        </div>
      )}
    </div>
  );
}