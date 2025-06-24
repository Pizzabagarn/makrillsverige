export type LayoutType = 'desktop' | 'tablet' | 'tabletLandscape' | 'mobileLandscape' | 'mobilePortrait';

export function getLayoutType(): LayoutType {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;
  const isPortrait = height > width;
  
  console.log(`Layout Debug: ${width}x${height}, landscape: ${isLandscape}, portrait: ${isPortrait}`);
  
  // 1. Desktop: Stora skärmar (≥1200px bredd)
  if (width >= 1200) {
    console.log('-> desktop');
    return 'desktop';
  }
  
  // 2. Tablet med sidebar: Större enheter som iPads (≥768px bredd ELLER ≥768px höjd)
  if (Math.max(width, height) >= 720 && Math.min(width, height) >= 500) {
    console.log('-> tabletLandscape');
    return 'tabletLandscape';
  }
  
  // 3. Små mobiler i landscape: Kompakt layout för små landscape-enheter
  if (isLandscape && height <= 500) {
    console.log('-> mobileLandscape');
    return 'mobileLandscape';
  }
  
  // 4. Små mobiler i portrait: Smal bredd OCH portrait
  if (isPortrait && width <= 600) {
    console.log('-> mobilePortrait');
    return 'mobilePortrait';
  }
  
  // 5. Allt annat: Mellanstorlekar som inte passar ovan
  console.log('-> tablet');
  return 'tablet';
}

export function shouldShowSidebar(layoutType: LayoutType): boolean {
  return layoutType === 'desktop' || layoutType === 'tabletLandscape';
}

export function shouldShowHamburger(layoutType: LayoutType): boolean {
  return layoutType === 'tablet' || layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape';
}

export function shouldShowMobileSlider(layoutType: LayoutType): boolean {
  return layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape';
} 