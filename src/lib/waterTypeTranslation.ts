/**
 * Intelligent Water Type Translation
 * Analyzes water body names to provide accurate Swedish translations
 * Works with all water sources: OSM, SMHI, SVAR, etc.
 */

export interface WaterTypeTranslation {
  swedish: string;
  category: 'natural' | 'artificial' | 'coastal' | 'infrastructure';
  size: 'small' | 'medium' | 'large';
}

/**
 * Intelligent Swedish water type detection based on name analysis
 * This works for ALL water bodies from any data source (OSM, SMHI, SVAR, etc.)
 */
export function getSwedishWaterType(name: string, osmType?: string): WaterTypeTranslation {
  const nameLower = name.toLowerCase().trim();
  
  // SVENSKA MÖNSTER (mest specifika först, använd ordgränser för att undvika felklassificering)
  
  // Bäckar (mest specifika först)
  if (nameLower.includes('bäck') || nameLower.includes('bäcken')) {
    return { swedish: 'bäck', category: 'natural', size: 'small' };
  }
  
  // Älvar (stora vattendrag)
  if (nameLower.includes('älv') || nameLower.includes('älven')) {
    return { swedish: 'älv', category: 'natural', size: 'large' };
  }
  
  // Åar - var mycket försiktig här! Kolla ordslut och hela ord
  if (nameLower.endsWith('å') || nameLower.endsWith('ån') || 
      nameLower.includes(' å ') || nameLower.includes(' ån ') ||
      nameLower.startsWith('å ') || nameLower.startsWith('ån ') ||
      // Typiska svenska ånamn
      /\w+å$/.test(nameLower) || /\w+ån$/.test(nameLower)) {
    return { swedish: 'å', category: 'natural', size: 'medium' };
  }
  
  // Sjöar
  if (nameLower.includes('sjö') || nameLower.includes('sjön')) {
    return { swedish: 'sjö', category: 'natural', size: 'large' };
  }
  
  // Dammar
  if (nameLower.includes('damm') || nameLower.includes('dammen') || nameLower.includes('dammar')) {
    return { swedish: 'damm', category: 'artificial', size: 'small' };
  }
  
  // Tjärnar (små sjöar)
  if (nameLower.includes('tjärn') || nameLower.includes('tjärnen')) {
    return { swedish: 'tjärn', category: 'natural', size: 'small' };
  }
  
  // Träsk (små sjöar/våtmarker)
  if (nameLower.includes('träsk') || nameLower.includes('träsket')) {
    return { swedish: 'träsk', category: 'natural', size: 'medium' };
  }
  
  // Kanaler
  if (nameLower.includes('kanal') || nameLower.includes('kanalen')) {
    return { swedish: 'kanal', category: 'artificial', size: 'medium' };
  }
  
  // Kustvatten
  if (nameLower.includes('sund') || nameLower.includes('sundet')) {
    return { swedish: 'sund', category: 'coastal', size: 'large' };
  }
  if (nameLower.includes('fjärd') || nameLower.includes('fjärden')) {
    return { swedish: 'fjärd', category: 'coastal', size: 'large' };
  }
  if (nameLower.includes('vik') || nameLower.includes('viken')) {
    return { swedish: 'vik', category: 'coastal', size: 'medium' };
  }
  if (nameLower.includes('hamn') || nameLower.includes('hamnen')) {
    return { swedish: 'hamn', category: 'infrastructure', size: 'medium' };
  }
  
  // NORSKA MÖNSTER
  if (nameLower.includes('bekk') || nameLower.includes('bekken')) {
    return { swedish: 'bäck', category: 'natural', size: 'small' };
  }
  if (nameLower.includes('elv') || nameLower.includes('elva')) {
    return { swedish: 'älv', category: 'natural', size: 'large' };
  }
  if (nameLower.includes('vatn') || nameLower.includes('vatnet')) {
    return { swedish: 'sjö', category: 'natural', size: 'large' };
  }
  if (nameLower.includes('fjord') || nameLower.includes('fjorden')) {
    return { swedish: 'fjord', category: 'coastal', size: 'large' };
  }
  if (nameLower.includes('øy') || nameLower.includes('øya')) {
    return { swedish: 'ö', category: 'coastal', size: 'small' };
  }
  
  // DANSKA MÖNSTER  
  if (nameLower.includes('bæk') || nameLower.includes('bækken')) {
    return { swedish: 'bäck', category: 'natural', size: 'small' };
  }
  if (nameLower.includes('sø') || nameLower.includes('søen')) {
    return { swedish: 'sjö', category: 'natural', size: 'large' };
  }
  if (nameLower.includes('å') || nameLower.includes('åen')) {
    return { swedish: 'å', category: 'natural', size: 'medium' };
  }
  
  // FINSKA MÖNSTER
  if (nameLower.includes('järvi')) {
    return { swedish: 'sjö', category: 'natural', size: 'large' };
  }
  if (nameLower.includes('joki')) {
    return { swedish: 'älv', category: 'natural', size: 'large' };
  }
  if (nameLower.includes('puro')) {
    return { swedish: 'bäck', category: 'natural', size: 'small' };
  }
  if (nameLower.includes('lahti')) {
    return { swedish: 'vik', category: 'coastal', size: 'medium' };
  }
  if (nameLower.includes('selkä')) {
    return { swedish: 'sjö', category: 'natural', size: 'large' };
  }
  
  // FALLBACK TILL OSM-TYP (om tillgänglig) - Förbättrad svensk översättning
  if (osmType) {
    const type = osmType.toLowerCase();
    
    // Stora vattendrag
    if (type === 'river') {
      return { swedish: 'älv', category: 'natural', size: 'large' };
    }
    
    // Mindre vattendrag - bättre klassificering
    if (type === 'stream') {
      return { swedish: 'å', category: 'natural', size: 'medium' };
    }
    if (type === 'brook') {
      return { swedish: 'bäck', category: 'natural', size: 'small' };
    }
    
    // Sjöar och vatten
    if (type === 'water' || type === 'lake') {
      return { swedish: 'sjö', category: 'natural', size: 'large' };
    }
    
    // Konstgjorda
    if (type === 'canal') {
      return { swedish: 'kanal', category: 'artificial', size: 'medium' };
    }
    if (type === 'reservoir') {
      return { swedish: 'reservoar', category: 'artificial', size: 'large' };
    }
    if (type === 'pond') {
      return { swedish: 'damm', category: 'artificial', size: 'small' };
    }
    
    // Kustvatten
    if (type === 'bay') {
      return { swedish: 'fjärd', category: 'coastal', size: 'large' };
    }
    if (type === 'strait') {
      return { swedish: 'sund', category: 'coastal', size: 'large' };
    }
    if (type === 'cove') {
      return { swedish: 'vik', category: 'coastal', size: 'medium' };
    }
  }
  
  // ABSOLUT FALLBACK
  return { swedish: 'sjö', category: 'natural', size: 'medium' };
}

/**
 * Simple function that just returns the Swedish type (for backwards compatibility)
 */
export function getSwedishWaterTypeName(name: string, osmType?: string): string {
  return getSwedishWaterType(name, osmType).swedish;
}

/**
 * Format water type with proper capitalization
 */
export function formatWaterType(swedishType: string): string {
  return swedishType.charAt(0).toUpperCase() + swedishType.slice(1);
}

/**
 * Get display name for water body (Name + Type)
 */
export function getWaterBodyDisplayName(name: string, osmType?: string): string {
  const typeInfo = getSwedishWaterType(name, osmType);
  const formattedType = formatWaterType(typeInfo.swedish);
  return `${name} (${formattedType})`;
}