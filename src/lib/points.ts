// src/lib/points.ts - Användarens specifika koordinater för Öresund

export interface ManualGridPoint {
  lat: number;
  lon: number;
  name: string;
  isManualPoint: true;
}

export const DMI_GRID_POINTS: ManualGridPoint[] = [
  // 🌊 ÖRESUND - Specifika koordinater för bättre datatäckning
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
];




