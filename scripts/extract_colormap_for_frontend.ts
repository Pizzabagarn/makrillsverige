#!/usr/bin/env node
/**
 * Extraherar färgskalor från Python-genererade metadata.json filer
 * och formaterar dem för frontend legend-komponenter med förenklade labels
 */

import * as fs from 'fs';
import * as path from 'path';

interface MetadataColorEntry {
  0: number;  // value
  1: string;  // color hex
}

interface Metadata {
  colormap: MetadataColorEntry[];
  resolution: number;
  interpolation_method: string;
  generated_at: string;
}

interface FrontendColorEntry {
  value: number;
  color: string;
  label: string;
}

/**
 * Läs metadata från en parameter-mapp
 */
function readMetadata(parameterDir: string): Metadata | null {
  const metadataPath = path.join(parameterDir, 'metadata.json');
  
  if (!fs.existsSync(metadataPath)) {
    console.warn(`⚠️ Metadata saknas: ${metadataPath}`);
    return null;
  }
  
  try {
    const content = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Fel vid läsning av ${metadataPath}:`, error);
    return null;
  }
}

/**
 * Hämta förenklade labels för renare legender
 */
function getSimplifiedLabels(parameterName: string): string[] {
  const labelMap: Record<string, string[]> = {
    current: ['0.0', '0.25', '0.5', '1.0', '1.5+'],
    temperature: ['7°C', '12°C', '16°C', '21°C'],
    salinity: ['0', '10', '20', '30']
  };
  
  return labelMap[parameterName] || [];
}

/**
 * Formatera färgskala för frontend med förenklade labels
 */
function formatColormapForFrontend(
  metadata: Metadata, 
  parameterName: string
): FrontendColorEntry[] {
  const colormap = metadata.colormap;
  
  return colormap.map((entry) => {
    const value = entry[0];
    const color = entry[1];
    
    return {
      value: parseFloat(value.toFixed(3)),
      color: color,
      label: ''  // Alla labels tomma - vi använder hardkodade simplified labels
    };
  });
}

/**
 * Generera TypeScript kod för en legend-komponent
 */
function generateLegendCode(
  parameterName: string,
  colormap: FrontendColorEntry[],
  metadata: Metadata
): string {
  const parameterInfo = {
    current: {
      title: 'REVOLUTIONÄR FÄRGSKALA',
      description: 'Samma som Python-scriptet',
      unit: 'm/s',
      displayName: 'Strömstyrka',
      constantName: 'REVOLUTIONARY_CURRENT_COLORMAP'
    },
    temperature: {
      title: 'REVOLUTIONÄR TEMPERATUR FÄRGSKALA',
      description: 'Samma som Python-scriptet',
      unit: '°C',
      displayName: 'Vattentemperatur',
      constantName: 'REVOLUTIONARY_TEMPERATURE_COLORMAP'
    },
    salinity: {
      title: 'REVOLUTIONÄR SALTHALT FÄRGSKALA',
      description: 'Samma som Python-scriptet',
      unit: 'PSU',
      displayName: 'Salthalt',
      constantName: 'REVOLUTIONARY_SALINITY_COLORMAP'
    }
  };
  
  const info = parameterInfo[parameterName as keyof typeof parameterInfo];
  const minVal = colormap[0].value;
  const maxVal = colormap[colormap.length - 1].value;
  const simplifiedLabels = getSimplifiedLabels(parameterName);
  
  const colormapCode = colormap.map(entry => {
    return `  { value: ${entry.value}, color: '${entry.color}', label: '${entry.label}' }`;
  }).join(',\n');
  
  const labelsCode = simplifiedLabels.map(label => `'${label}'`).join(', ');
  
  return `// ${info.title} - ${info.description} (${minVal}-${maxVal} ${info.unit}, ${colormap.length} färgsteg)
const ${info.constantName} = [
${colormapCode}
];

// FÖRENKLADE LABELS för renare legend (bara ${simplifiedLabels.length} viktiga värden)
const SIMPLIFIED_LABELS = [${labelsCode}];`;
}

/**
 * Huvudfunktion
 */
function main(): void {
  console.log('🎨 Extraherar färgskalor från metadata...\n');
  
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const parameters = ['current-magnitude-images', 'temperature-images', 'salinity-images'];
  const parameterNames = ['current', 'temperature', 'salinity'];
  
  for (let i = 0; i < parameters.length; i++) {
    const parameterDir = path.join(dataDir, parameters[i]);
    const parameterName = parameterNames[i];
    
    console.log(`📊 Processar ${parameterName}...`);
    
    const metadata = readMetadata(parameterDir);
    if (!metadata) {
      continue;
    }
    
    const frontendColormap = formatColormapForFrontend(metadata, parameterName);
    const legendCode = generateLegendCode(parameterName, frontendColormap, metadata);
    const simplifiedLabels = getSimplifiedLabels(parameterName);
    
    console.log(`\n=== ${parameterName.toUpperCase()} LEGEND CODE ===`);
    console.log(legendCode);
    console.log(`\n✅ ${frontendColormap.length} färgsteg extraherade för ${parameterName}`);
    console.log(`📈 Range: ${frontendColormap[0].value} - ${frontendColormap[frontendColormap.length - 1].value}`);
    console.log(`🎯 Simplified labels: ${simplifiedLabels.join(', ')}`);
    console.log(`🧹 Cleaner legend: ${simplifiedLabels.length} labels instead of ${frontendColormap.length}\n`);
  }
  
  console.log('🏁 Klar! Kopiera koden ovan till dina legend-komponenter.');
  console.log('💡 Tips: Använd SIMPLIFIED_LABELS i map() för renare utseende!');
}

if (require.main === module) {
  main();
} 