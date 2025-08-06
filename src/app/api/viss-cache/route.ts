import { NextRequest, NextResponse } from 'next/server';
import { WaterBodyDataFetcher } from '@/lib/waterBodyDataFetcher';

// CDN CACHE för VISS-data - cachar i 7 dagar
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800, s-maxage=604800', // 7 dagar CDN + browser
  'CDN-Cache-Control': 'max-age=2592000', // 30 dagar CDN
  'Vercel-CDN-Cache-Control': 'max-age=2592000', // 30 dagar Vercel
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const waterBodyName = searchParams.get('name');
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!waterBodyName) {
      return NextResponse.json(
        { error: 'Missing waterBodyName parameter' },
        { status: 400 }
      );
    }

    const coordinates = lat && lon ? 
      { lat: parseFloat(lat), lon: parseFloat(lon) } : 
      undefined;

    console.log(`🔍 VISS CDN Cache: Hämtar data för "${waterBodyName}"`);

    const fetcher = new WaterBodyDataFetcher();
    const vissData = await fetcher.fetchWaterBodyDataWithValidation(
      waterBodyName, 
      coordinates
    );

    if (!vissData) {
      return NextResponse.json(
        { error: 'No VISS data found', waterBodyName },
        { 
          status: 404,
          headers: {
            ...CACHE_HEADERS,
            'Cache-Control': 'public, max-age=3600', // Cacha 404 i 1 timme bara
          }
        }
      );
    }

    console.log(`✅ VISS CDN Cache: Hittade data för "${waterBodyName}"`);

    return NextResponse.json(
      {
        waterBodyName,
        coordinates,
        vissData,
        cached_at: new Date().toISOString(),
        cache_duration: '30 days'
      },
      { 
        status: 200,
        headers: CACHE_HEADERS
      }
    );

  } catch (error) {
    console.error('VISS CDN Cache error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache', // Cacha inte errors
        }
      }
    );
  }
}