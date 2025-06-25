/**
 * Makrillprognos-algoritm baserad på vetenskaplig litteratur
 * Implementerar habitat suitability index för atlantisk makrill (Scomber scombrus)
 * enligt specifikationen som beaktar temperatur, salthalt och strömförhållanden
 */

export interface MackerelSuitabilityInput {
  temperature: number; // Vattentemperatur i °C
  salinity: number;    // Salthalt i psu (‰)
  currentSpeed?: number; // Strömhastighet i m/s (valfri)
  depth?: number;      // Djup i meter (valfri)
  month?: number;      // Månad 1-12 för säsongsvariation
}

export interface MackerelHotspot {
  lat: number;
  lon: number;
  suitability: number; // 0-1 sannolikhetsskattning
  temperature: number;
  salinity: number;
  currentSpeed?: number;
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Huvudfunktion för att beräkna makrillens местообитаниеchiktheid
 * Enligt specifikationen: optimala förhållanden = salthalt 30-35 psu, temp 10-18°C
 */
export function calculateMackerelSuitability(input: MackerelSuitabilityInput): number {
  const { temperature, salinity, currentSpeed, month } = input;
  
  // Hårda gränser: under dessa är sannolikheten 0
  if (salinity < 20) return 0.0;  // För lite salt, orealistiskt för makrill
  if (temperature < 8) return 0.0; // För kallt, makrill ej aktiv
  if (temperature > 22) return 0.0; // För varmt för Östersjö/Kattegatt-makrill
  
  let score = 0;
  
  // 1. TEMPERATURKOMPONENT (vikt: 40%)
  // Optimum vid ~14°C enligt specifikationen, tolerans 10-18°C
  const tempOptimum = 14;
  const tempTolerance = 6; // ±6°C från optimum ger gradvis minskning
  const tempDiff = Math.abs(temperature - tempOptimum);
  
  let tempScore = 0;
  if (tempDiff <= tempTolerance) {
    // Gaussisk kurva runt optimum
    tempScore = Math.exp(-Math.pow(tempDiff / (tempTolerance / 2), 2));
  }
  score += tempScore * 0.4;
  
  // 2. SALTHALTSKOMPONENT (vikt: 40%)
  // Optimum vid 30-35 psu enligt specifikationen
  let salinityScore = 0;
  if (salinity >= 30) {
    salinityScore = 1.0; // Optimalt område
  } else if (salinity >= 25) {
    // Linjär ökning från 25 till 30 psu
    salinityScore = (salinity - 25) / 5;
  } else {
    // Under 25 psu, kraftig minskning men inte noll (redan filtrerat <20)
    salinityScore = Math.max(0, (salinity - 20) / 5) * 0.3;
  }
  score += salinityScore * 0.4;
  
  // 3. STRÖMKOMPONENT (vikt: 15%)
  // Enligt specifikationen: måttliga strömmar (0.1-0.5 m/s) är gynnsamma
  let currentScore = 0.75; // Default om ingen strömdata
  if (currentSpeed !== undefined) {
    if (currentSpeed >= 0.1 && currentSpeed <= 0.5) {
      currentScore = 1.0; // Optimal strömhastighet
    } else if (currentSpeed < 0.1) {
      currentScore = 0.5; // Stillastående vatten, mindre blandning/föda
    } else if (currentSpeed <= 1.0) {
      currentScore = 0.7; // Måttligt stark ström, fortfarande ok
    } else {
      currentScore = 0.3; // Mycket stark ström, energikrävande för makrill
    }
  }
  score += currentScore * 0.15;
  
  // 4. SÄSONGSKOMPONENT (vikt: 5%)
  // Makrill finns främst maj-september i våra vatten
  let seasonScore = 1.0; // Default för okänd månad
  if (month !== undefined) {
    if (month >= 6 && month <= 8) {
      seasonScore = 1.0; // Högsäsong (juni-augusti)
    } else if (month === 5 || month === 9) {
      seasonScore = 0.8; // Tidig/sen säsong
    } else if (month === 4 || month === 10) {
      seasonScore = 0.4; // Möjlig men osannolik
    } else {
      seasonScore = 0.1; // Vintertid, mycket osannolikt
    }
  }
  score += seasonScore * 0.05;
  
  // Normalisera till [0,1] och kläm
  return Math.max(0, Math.min(1, score));
}

/**
 * Beräkna konfidensgrad baserat på data kvalitet och värden
 */
function calculateConfidence(input: MackerelSuitabilityInput, suitability: number): 'low' | 'medium' | 'high' {
  const { temperature, salinity, currentSpeed } = input;
  
  // Hög konfidiens: alla parametrar inom optimala intervall
  if (suitability > 0.7 && temperature >= 12 && temperature <= 16 && salinity >= 30) {
    return 'high';
  }
  
  // Medel konfidiens: rimliga värden
  if (suitability > 0.4 && temperature >= 10 && temperature <= 18 && salinity >= 25) {
    return 'medium';
  }
  
  // Låg konfidiens: extrema värden eller låg suitability
  return 'low';
}

/**
 * Filtrera och skapa hotspots från miljödata
 * Endast områden över tröskelvärdet inkluderas som hotspots
 */
export function generateMackerelHotspots(
  environmentalData: Array<{
    lat: number;
    lon: number;
    temperature: number;
    salinity: number;
    currentSpeed?: number;
  }>,
  threshold: number = 0.5, // Minimum suitability för att kvalificera som hotspot
  month?: number
): MackerelHotspot[] {
  const hotspots: MackerelHotspot[] = [];
  
  for (const point of environmentalData) {
    const suitability = calculateMackerelSuitability({
      temperature: point.temperature,
      salinity: point.salinity,
      currentSpeed: point.currentSpeed,
      month
    });
    
    // Endast områden över tröskeln inkluderas
    if (suitability >= threshold) {
      hotspots.push({
        lat: point.lat,
        lon: point.lon,
        suitability,
        temperature: point.temperature,
        salinity: point.salinity,
        currentSpeed: point.currentSpeed,
        confidence: calculateConfidence(point, suitability)
      });
    }
  }
  
  // Sortera efter suitability (bästa först)
  return hotspots.sort((a, b) => b.suitability - a.suitability);
}

/**
 * Utility: Klassificera hotspot-styrka för visualisering
 */
export function classifyHotspotStrength(suitability: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (suitability >= 0.8) return 'excellent';
  if (suitability >= 0.65) return 'good';
  if (suitability >= 0.5) return 'fair';
  return 'poor';
}

/**
 * Utility: Få färg för hotspot-visualisering
 */
export function getHotspotColor(suitability: number): string {
  const strength = classifyHotspotStrength(suitability);
  switch (strength) {
    case 'excellent': return '#00ff00'; // Grön
    case 'good': return '#80ff00';      // Gulgrön  
    case 'fair': return '#ffff00';      // Gul
    case 'poor': return '#ff8000';      // Orange
    default: return '#ff0000';          // Röd
  }
} 