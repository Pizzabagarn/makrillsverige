import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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

    // Sätt sökväg till public/data/mackerel_calibration.json
    const outputPath = path.join(process.cwd(), 'public', 'data', 'mackerel_calibration.json');
    
    // Säkerställ att katalogen finns
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    // Skriv kalibrering till fil
    await fs.writeFile(outputPath, JSON.stringify(calibrationData, null, 2), 'utf-8');
    
    const { calibration } = calibrationData;
    
    console.log('🎯 Automatisk kalibrering exporterad via API:', {
      path: outputPath,
      totalReports: calibration.totalReports,
      intercept: calibration.recommendedIntercept?.toFixed(3),
      useSlopeCalibration: calibration.useSlopeCalibration,
      confidence: calibration.confidence,
      timestamp: calibration.lastUpdated
    });

    return NextResponse.json({
      success: true,
      path: outputPath,
      totalReports: calibration.totalReports,
      useSlopeCalibration: calibration.useSlopeCalibration,
      confidence: calibration.confidence
    });

  } catch (error) {
    console.error('❌ Export calibration API error:', error);
    return NextResponse.json(
      { error: 'Failed to export calibration data' },
      { status: 500 }
    );
  }
} 