/**
 * Utilities för att hantera färgskalor från Python-genererade metadata
 */

export interface ColorMapEntry {
  value: number;
  color: string;
  label: string;
}

export interface MetadataColormap {
  colormap: [number, string][];
  resolution: number;
  interpolation_method: string;
  generated_at: string;
}

/**
 * Läs och parsa metadata från public/data katalog
 */
export async function loadColormapFromMetadata(parameter: 'current' | 'temperature' | 'salinity'): Promise<ColorMapEntry[] | null> {
  try {
    const dirMap = {
      current: 'current-magnitude-images',
      temperature: 'temperature-images',
      salinity: 'salinity-images'
    };
    
    const response = await fetch(`/data/${dirMap[parameter]}/metadata.json`);
    if (!response.ok) {
      console.warn(`Kunde inte ladda metadata för ${parameter}`);
      return null;
    }
    
    const metadata: MetadataColormap = await response.json();
    return createSimplifiedColormap(metadata.colormap, parameter);
    
  } catch (error) {
    console.error(`Fel vid laddning av metadata för ${parameter}:`, error);
    return null;
  }
}

/**
 * Skapa förenklad färgskala med smarta labels
 */
function createSimplifiedColormap(colormap: [number, string][], parameter: string): ColorMapEntry[] {
  return colormap.map(([value, color]) => ({
    value,
    color,
    label: ''  // Tom label - vi använder hardkodade labels för tydlighet
  }));
}

/**
 * Hämta förenklade labels för olika parametrar
 */
export function getSimplifiedLabels(parameter: 'current' | 'temperature' | 'salinity'): string[] {
  const labelMap = {
    current: ['0.0', '0.25', '0.5', '1.0', '1.5+'],
    temperature: ['7°C', '12°C', '16°C', '21°C'],
    salinity: ['0', '10', '20', '30']
  };
  
  return labelMap[parameter];
}

/**
 * Hämta dataområde från färgskala
 */
export function getDataRange(colormap: ColorMapEntry[]): { min: number; max: number } {
  if (colormap.length === 0) {
    return { min: 0, max: 1 };
  }
  
  return {
    min: colormap[0].value,
    max: colormap[colormap.length - 1].value
  };
}

/**
 * Skapa CSS gradient från färgskala
 */
export function createGradientStyle(colormap: ColorMapEntry[]): { background: string } {
  const gradientStops = colormap.map((item, index) => {
    const position = (index / (colormap.length - 1)) * 100;
    return `${item.color} ${position}%`;
  }).join(', ');
  
  return {
    background: `linear-gradient(to right, ${gradientStops})`
  };
} 