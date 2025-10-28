import { NextResponse } from 'next/server';
import { findSJOID } from '@/lib/svarLookupService';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!name || !lat || !lon) {
    return NextResponse.json(
      { error: 'Missing required parameters: name, lat, lon' },
      { status: 400 }
    );
  }

  try {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    const result = findSJOID(name, latitude, longitude, 10); // 10km max distance

    if (!result) {
      return NextResponse.json(
        { error: 'No matching lake found', sjoid: null },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sjoid: result.sjoid,
      vyid: result.vyid,
      name: result.name,
      confidence: result.confidence,
      distance_km: result.distance_km,
    });

  } catch (error) {
    console.error('SVAR lookup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

