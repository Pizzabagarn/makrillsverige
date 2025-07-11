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

// Hardkodade färgskalor från legend-komponenterna för snabbare åtkomst
const COLORMAP_DATA = {
  current: [
    { value: 0.000, color: '#000066' },
    { value: 0.068, color: '#0033CC' },
    { value: 0.137, color: '#0066CC' },
    { value: 0.205, color: '#00CCFF' },
    { value: 0.274, color: '#00FFCC' },
    { value: 0.342, color: '#00FF66' },
    { value: 0.411, color: '#33FF33' },
    { value: 0.479, color: '#66FF00' },
    { value: 0.547, color: '#99FF00' },
    { value: 0.616, color: '#CCFF00' },
    { value: 0.684, color: '#FFFF00' },
    { value: 0.753, color: '#FFCC00' },
    { value: 0.821, color: '#FF9900' },
    { value: 0.889, color: '#FF6600' },
    { value: 0.958, color: '#FF3300' },
    { value: 1.026, color: '#CC0000' },
    { value: 1.095, color: '#990000' },
    { value: 1.163, color: '#660000' },
    { value: 1.232, color: '#330000' },
    { value: 1.300, color: '#220000' }
  ],
  temperature: [
    { value: 6.974, color: '#000066' },
    { value: 8.000, color: '#000099' },
    { value: 10.000, color: '#0033CC' },
    { value: 11.031, color: '#0066FF' },
    { value: 12.000, color: '#0099FF' },
    { value: 12.676, color: '#00CCFF' },
    { value: 13.500, color: '#00FFCC' },
    { value: 14.500, color: '#33FF99' },
    { value: 15.330, color: '#66FF66' },
    { value: 15.805, color: '#99FF33' },
    { value: 16.281, color: '#CCFF00' },
    { value: 16.699, color: '#FFFF00' },
    { value: 17.117, color: '#FFCC00' },
    { value: 17.500, color: '#FF9900' },
    { value: 17.883, color: '#FF6600' },
    { value: 18.328, color: '#FF3300' },
    { value: 19.000, color: '#CC0000' },
    { value: 20.000, color: '#990000' },
    { value: 20.980, color: '#660000' }
  ],
  salinity: [
    { value: 0.000, color: '#67001F' },
    { value: 2.000, color: '#B2182B' },
    { value: 4.000, color: '#D6604D' },
    { value: 6.000, color: '#F4A582' },
    { value: 7.094, color: '#FDDBC7' },
    { value: 7.250, color: '#F7F7F7' },
    { value: 7.391, color: '#D1E5F0' },
    { value: 10.000, color: '#92C5DE' },
    { value: 12.375, color: '#4393C3' },
    { value: 15.000, color: '#2166AC' },
    { value: 17.359, color: '#053061' },
    { value: 20.000, color: '#042A50' },
    { value: 20.234, color: '#032441' },
    { value: 23.109, color: '#021E32' },
    { value: 25.000, color: '#011823' },
    { value: 28.312, color: '#001214' },
    { value: 29.094, color: '#000C0F' },
    { value: 30.188, color: '#00060A' }
  ]
};

/**
 * Hämta färg för ett specifikt parametervärde baserat på färgskalan
 */
export function getColorForValue(parameter: 'current' | 'temperature' | 'salinity', value: number): string {
  const colormap = COLORMAP_DATA[parameter];
  
  if (!colormap || colormap.length === 0) {
    return '#666666'; // Fallback färg
  }
  
  // Om värdet är mindre än minsta värdet
  if (value <= colormap[0].value) {
    return colormap[0].color;
  }
  
  // Om värdet är större än största värdet
  if (value >= colormap[colormap.length - 1].value) {
    return colormap[colormap.length - 1].color;
  }
  
  // Hitta de två närmaste färgerna och interpolera
  for (let i = 0; i < colormap.length - 1; i++) {
    const current = colormap[i];
    const next = colormap[i + 1];
    
    if (value >= current.value && value <= next.value) {
      // Enkelt: returnera den närmaste färgen
      const distToCurrent = Math.abs(value - current.value);
      const distToNext = Math.abs(value - next.value);
      
      return distToCurrent <= distToNext ? current.color : next.color;
    }
  }
  
  // Fallback
  return colormap[0].color;
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