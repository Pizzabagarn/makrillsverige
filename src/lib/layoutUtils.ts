export type LayoutType = 'desktop' | 'tablet' | 'mobileLandscape' | 'mobilePortrait';

export function getLayoutType(): LayoutType {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;
  const isPortrait = height > width;
  
  // 1. Desktop: Stora skärmar (≥1200px bredd)
  if (width >= 1200) {
    return 'desktop';
  }
  
  // 2. Små mobiler i landscape: Mycket låg höjd när roterad
  if (isLandscape && height <= 450) {
    return 'mobileLandscape';
  }
  
  // 3. Små mobiler i portrait: Smal bredd OCH portrait
  if (isPortrait && width <= 600) {
    return 'mobilePortrait';
  }
  
  // 4. Allt annat: Tablets, mellanstorlekar, bredare enheter
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