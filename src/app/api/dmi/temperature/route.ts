import { NextRequest, NextResponse } from 'next/server';
import { fetchTemperatureGrid, TemperatureData } from '../temperature';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = searchParams.get('bbox') || '10.5,54.5,14.5,58.5';
    const depth = searchParams.get('depth') || 'surface';
    
    const temperatureData = await fetchTemperatureGrid(bbox, depth);
    
    return NextResponse.json({
      success: true,
      data: temperatureData,
      metadata: {
        bbox,
        depth,
        dataPoints: temperatureData.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Temperature API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch temperature data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 