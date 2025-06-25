import { NextRequest, NextResponse } from 'next/server';
import { fetchTemperatureGrid } from '../../dmi/temperature';
import { fetchSalinityGrid } from '../../dmi/salinity';
import { generateMackerelHotspots } from '../../../../lib/mackerelAlgorithm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = searchParams.get('bbox') || '11.5,55.5,13.0,56.5';
    const depth = searchParams.get('depth') || 'surface';
    const threshold = parseFloat(searchParams.get('threshold') || '0.5');
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : new Date().getMonth() + 1;
    
    // Hämta parallellt temperatur och salthalt data enligt specifikationens rekommendation
    const [temperatureData, salinityData] = await Promise.all([
      fetchTemperatureGrid(bbox, depth),
      fetchSalinityGrid(bbox, depth)
    ]);
    
    // Kombinera data för samma koordinater och tidpunkter
    const combinedData = combineEnvironmentalData(temperatureData, salinityData);
    
    // Generera makrill-hotspots med algoritmen
    const hotspots = generateMackerelHotspots(combinedData, threshold, month);
    
    return NextResponse.json({
      success: true,
      data: hotspots,
      metadata: {
        bbox,
        depth,
        threshold,
        month,
        totalHotspots: hotspots.length,
        highConfidenceHotspots: hotspots.filter(h => h.confidence === 'high').length,
        averageSuitability: hotspots.length > 0 
          ? hotspots.reduce((sum, h) => sum + h.suitability, 0) / hotspots.length 
          : 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Mackerel hotspots API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate mackerel hotspots',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Kombinera temperatur och salthalt data för samma koordinater och tidpunkter
 * Enligt specifikationen behöver vi matcha data från olika parametrar
 */
function combineEnvironmentalData(
  temperatureData: Array<{lat: number, lon: number, temperature: number, time: string}>,
  salinityData: Array<{lat: number, lon: number, salinity: number, time: string}>
) {
  const combinedMap = new Map<string, any>();
  
  // Lägg till temperaturdata
  for (const tempPoint of temperatureData) {
    const key = `${tempPoint.lat.toFixed(4)}_${tempPoint.lon.toFixed(4)}_${tempPoint.time}`;
    combinedMap.set(key, {
      lat: tempPoint.lat,
      lon: tempPoint.lon,
      temperature: tempPoint.temperature,
      time: tempPoint.time
    });
  }
  
  // Matcha med salthaltsdata
  for (const saltPoint of salinityData) {
    const key = `${saltPoint.lat.toFixed(4)}_${saltPoint.lon.toFixed(4)}_${saltPoint.time}`;
    const existing = combinedMap.get(key);
    if (existing) {
      existing.salinity = saltPoint.salinity;
    }
  }
  
  // Returnera endast punkter som har både temperatur och salthalt
  return Array.from(combinedMap.values()).filter(point => 
    point.temperature !== undefined && point.salinity !== undefined
  );
} 