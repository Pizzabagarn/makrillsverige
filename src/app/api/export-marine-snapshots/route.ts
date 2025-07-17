import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validera data
    if (!data.snapshots || !Array.isArray(data.snapshots)) {
      return NextResponse.json({ error: 'Invalid snapshots data' }, { status: 400 });
    }
    
    console.log(`📤 Exporterar ${data.snapshots.length} marine data snapshots`);
    
    // Spara som JSON-fil i public/data
    const outputPath = join(process.cwd(), 'public', 'data', 'marine_data_snapshots.json');
    
    const exportData = {
      snapshots: data.snapshots,
      exportedAt: new Date().toISOString(),
      format: 'marine_data_snapshots_v1',
      metadata: {
        totalSnapshots: data.snapshots.length,
        totalDataPoints: data.snapshots.reduce((sum: number, s: any) => sum + s.marineData.length, 0),
        dateRange: data.snapshots.length > 0 ? {
          start: Math.min(...data.snapshots.map((s: any) => new Date(s.createdAt).getTime())),
          end: Math.max(...data.snapshots.map((s: any) => new Date(s.createdAt).getTime()))
        } : null
      }
    };
    
    writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    
    console.log(`✅ Marine data snapshots exporterade till: ${outputPath}`);
    
    return NextResponse.json({ 
      success: true, 
      path: outputPath,
      count: data.snapshots.length,
      totalDataPoints: exportData.metadata.totalDataPoints
    });
    
  } catch (error) {
    console.error('❌ Fel vid export av marine snapshots:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
} 