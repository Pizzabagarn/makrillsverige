export type LayoutType = 'desktop' | 'tablet' | 'mobileLandscape' | 'mobilePortrait';

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
  
  // 2. Mobiler i landscape: Kompakt layout för landscape-enheter
  if (isLandscape && height <= 600 && width <= 1000) {
    console.log('-> mobileLandscape');
    return 'mobileLandscape';
  }
  
  // 3. Små mobiler i portrait: Smal bredd OCH portrait
  if (isPortrait && width <= 600) {
    console.log('-> mobilePortrait');
    return 'mobilePortrait';
  }
  
  // 4. Allt annat: Tablets, mellanstorlekar, bredare enheter
  console.log('-> tablet');
  return 'tablet';
}

export function shouldShowSidebar(layoutType: LayoutType): boolean {
  return layoutType === 'desktop' || layoutType === 'mobileLandscape';
}

export function shouldShowHamburger(layoutType: LayoutType): boolean {
  return layoutType === 'tablet';
}

export function shouldShowMobileSlider(layoutType: LayoutType): boolean {
  return layoutType === 'mobilePortrait';
} 