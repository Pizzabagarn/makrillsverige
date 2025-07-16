import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface ManualGridPoint {
  id?: string;
  lat: number;
  lon: number;
  name: string;
  isManualPoint: true;
  createdAt?: string;
}

export async function POST(request: Request) {
  try {
    const { points } = await request.json() as { points: ManualGridPoint[] };
    
    if (!Array.isArray(points)) {
      return NextResponse.json({ error: 'Invalid points data' }, { status: 400 });
    }

    // Generate the new points.ts file content
    const fileContent = `// src/lib/points.ts - Auto-generated manual points for DMI data fetching
// This file is updated automatically when manual points are added via UI

export interface ManualGridPoint {
  id?: string;
  lat: number;
  lon: number;
  name: string;
  isManualPoint: true;
  createdAt?: string;
}

export const DMI_GRID_POINTS: ManualGridPoint[] = [
  // 🌊 ÖRESUND - Ursprungliga specifika koordinater för bättre datatäckning
  { lat: 56.030646, lon: 12.676845, name: 'Öresund Nord', isManualPoint: true },
  { lat: 56.075782, lon: 12.571651, name: 'Öresund Väst', isManualPoint: true },
  { lat: 56.050565, lon: 12.611470, name: 'Öresund Central 1', isManualPoint: true },
  { lat: 56.020683, lon: 12.685760, name: 'Öresund Öst', isManualPoint: true },
  { lat: 56.089047, lon: 12.629894, name: 'Öresund Central 2', isManualPoint: true },
  { lat: 56.006397, lon: 12.602555, name: 'Öresund Syd', isManualPoint: true },
  { lat: 55.995430, lon: 12.656638, name: 'Öresund Sydöst', isManualPoint: true },
  { lat: 56.092031, lon: 12.584726, name: 'Öresund Nordväst', isManualPoint: true },
  { lat: 56.047029, lon: 12.677629, name: 'Öresund Central 3', isManualPoint: true },
  { lat: 56.066859, lon: 12.659960, name: 'Öresund Central 4', isManualPoint: true },
  { lat: 56.095156, lon: 12.615138, name: 'Öresund Central 5', isManualPoint: true },
  
  // 🎯 ANVÄNDARDEFINIERADE PUNKTER - Läggs till interaktivt via UI
${points.map(point => 
  `  { lat: ${point.lat}, lon: ${point.lon}, name: '${point.name}', isManualPoint: true${point.id ? `, id: '${point.id}'` : ''}${point.createdAt ? `, createdAt: '${point.createdAt}'` : ''} },`
).join('\n')}
];

export const USER_ADDED_MANUAL_POINTS = ${JSON.stringify(points, null, 2)};
`;

    // Write the updated file
    const filePath = path.join(process.cwd(), 'src', 'lib', 'points.ts');
    await fs.writeFile(filePath, fileContent, 'utf8');

    console.log(`✅ Updated points.ts with ${points.length} user-added manual points`);

    return NextResponse.json({ 
      success: true, 
      message: `Updated points.ts with ${points.length} manual points`,
      totalPoints: 11 + points.length // Original 11 + new points
    });

  } catch (error) {
    console.error('Error updating points.ts:', error);
    return NextResponse.json({ 
      error: 'Failed to update points file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Read current points from file
    const filePath = path.join(process.cwd(), 'src', 'lib', 'points.ts');
    const fileContent = await fs.readFile(filePath, 'utf8');
    
    // Extract user-added points (simple regex - could be improved)
    const userPointsMatch = fileContent.match(/export const USER_ADDED_MANUAL_POINTS = ([\s\S]*?);/);
    const userPoints = userPointsMatch ? JSON.parse(userPointsMatch[1]) : [];
    
    return NextResponse.json({ 
      success: true,
      userPoints,
      totalUserPoints: userPoints.length
    });

  } catch (error) {
    console.error('Error reading points.ts:', error);
    return NextResponse.json({ 
      error: 'Failed to read points file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 