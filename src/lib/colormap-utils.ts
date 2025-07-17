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
  ],
  mackerel: [
    // MATCHAR LEGENDEN EXAKT: Svart → Mörkbrun → Gyllene färger
    // Samma färgprogression som MackerelLegend.tsx
    
    // === SVART BAS FÖR LÅGA VÄRDEN ===
    { value: -39.0, color: '#000000' },  // Absolut minimum - svart
    { value: -20.0, color: '#000000' },  // Svart
    { value: 0.0, color: '#000000' },    // Svart vid neutral punkt
    
    // === SMIDIG PROGRESSION TILL BRUN (MATCHAR LEGENDEN) ===
    { value: 20.0, color: '#0A0800' },   // Mycket mörk brun
    { value: 25.0, color: '#151000' },   // Mörk brun
    { value: 30.0, color: '#201800' },   // Mörkbrun
    { value: 35.0, color: '#2B2000' },   // Mörkbrun
    { value: 40.0, color: '#362800' },   // Mörkbrun
    { value: 45.0, color: '#413000' },   // Mörkbrun
    { value: 50.0, color: '#4C3800' },   // Mörkbrun
    { value: 52.0, color: '#574000' },   // Brun
    { value: 55.0, color: '#624800' },   // Brun
    { value: 58.0, color: '#6D5000' },   // Brun
    { value: 60.0, color: '#785800' },   // Brun
    { value: 62.0, color: '#836000' },   // Brun-gul
    { value: 65.0, color: '#8E6800' },   // Brun-gul
    { value: 67.0, color: '#997000' },   // Brun-gul
    { value: 69.0, color: '#A47800' },   // Gul-brun
    { value: 70.0, color: '#BB8800' },   // Guld-brun
    { value: 72.0, color: '#CC9900' },   // Orange-guld
    { value: 75.0, color: '#DDAA00' },   // Ljus orange
    { value: 77.0, color: '#EEBB00' },   // Gul-orange
    { value: 80.0, color: '#FFCC00' },   // Gul-orange
    { value: 82.0, color: '#FFDD11' },   // Gul
    { value: 85.0, color: '#FFEE22' },   // Ljus gul
    { value: 87.0, color: '#FFFF33' },   // Gul
    { value: 90.0, color: '#FFFF55' },   // Ljus gul
    { value: 92.0, color: '#FFFF77' },   // Mycket ljus gul
    { value: 95.0, color: '#FFFF99' },   // Nästan vit-gul
    { value: 97.0, color: '#FFFFAA' },   // Ljus vit-gul
    { value: 100.0, color: '#FFFFCC' },  // Nästan vit
    { value: 102.2, color: '#FFFFFF' }   // Absolut maximum - vit
  ]
};

/**
 * Hämta färg för ett specifikt parametervärde baserat på färgskalan
 */
export function getColorForValue(parameter: 'current' | 'temperature' | 'salinity' | 'mackerel', value: number): string {
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
export async function loadColormapFromMetadata(parameter: 'current' | 'temperature' | 'salinity' | 'mackerel'): Promise<ColorMapEntry[] | null> {
  try {
    const dirMap = {
      current: 'current-magnitude-images',
      temperature: 'temperature-images',
      salinity: 'salinity-images',
      mackerel: 'mackerel-probability-images-mercator'
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