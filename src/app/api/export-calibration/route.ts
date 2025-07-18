import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const calibrationData = await request.json();
    
    // Verifiera att data har rätt struktur
    if (!calibrationData.calibration || !calibrationData.reports) {
      return NextResponse.json(
        { error: 'Invalid calibration data structure' },
        { status: 400 }
      );
    }

    const { calibration } = calibrationData;
    
    console.log('🎯 Kalibrering exporterad via API:', {
      totalReports: calibration.totalReports,
      intercept: calibration.recommendedIntercept?.toFixed(3),
      useSlopeCalibration: calibration.useSlopeCalibration,
      confidence: calibration.confidence,
      timestamp: calibration.lastUpdated
    });

    // Returnera kalibrering-data istället för att skriva till fil
    // Detta undviker att Vercel bundlar hela public-mappen
    return NextResponse.json({
      success: true,
      calibrationData: calibrationData,
      totalReports: calibration.totalReports,
      useSlopeCalibration: calibration.useSlopeCalibration,
      confidence: calibration.confidence,
      message: 'Calibration data exported successfully'
    });

  } catch (error) {
    console.error('❌ Export calibration API error:', error);
    return NextResponse.json(
      { error: 'Failed to export calibration data' },
      { status: 500 }
    );
  }
} 