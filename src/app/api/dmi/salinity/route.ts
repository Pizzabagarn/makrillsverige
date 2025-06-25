import { NextRequest, NextResponse } from 'next/server';
import { fetchSalinityGrid, SalinityData } from '../salinity';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = searchParams.get('bbox') || '10.5,54.5,14.5,58.5';
    const depth = searchParams.get('depth') || 'surface';
    
    const salinityData = await fetchSalinityGrid(bbox, depth);
    
    return NextResponse.json({
      success: true,
      data: salinityData,
      metadata: {
        bbox,
        depth,
        dataPoints: salinityData.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Salinity API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch salinity data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 