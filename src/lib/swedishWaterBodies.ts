// Svenska vattendrag och sjöar - för sökning i väderprognos
// Viktiga fiskevatten i Sverige med koordinater

export interface WaterBody {
  name: string;
  type: 'sjö' | 'älv' | 'å' | 'bäck' | 'sund' | 'fjärd';
  lat: number;
  lon: number;
  region: string;
  description?: string;
  fishSpecies?: string[];
}

export const SWEDISH_WATER_BODIES: WaterBody[] = [
  // STORA SJÖAR
  {
    name: 'Vänern',
    type: 'sjö',
    lat: 58.3943,
    lon: 12.5115,
    region: 'Västra Götaland',
    description: 'Sveriges största sjö',
    fishSpecies: ['gädda', 'abborre', 'gös', 'lake', 'ål']
  },
  {
    name: 'Vättern',
    type: 'sjö', 
    lat: 58.1173,
    lon: 14.7719,
    region: 'Småland/Östergötland',
    description: 'Sveriges näst största sjö',
    fishSpecies: ['öring', 'röding', 'sik', 'abborre', 'gädda']
  },
  {
    name: 'Mälaren',
    type: 'sjö',
    lat: 59.4500,
    lon: 18.2000,
    region: 'Stockholm/Södermanland',
    description: 'Sveriges tredje största sjö',
    fishSpecies: ['gös', 'abborre', 'gädda', 'lake', 'ål']
  },
  {
    name: 'Hjälmaren',
    type: 'sjö',
    lat: 58.7500,
    lon: 14.7000,
    region: 'Närke/Södermanland',
    description: 'Sveriges fjärde största sjö',
    fishSpecies: ['gös', 'abborre', 'gädda', 'braxen']
  },
  {
    name: 'Storsjön',
    type: 'sjö',
    lat: 60.8000,
    lon: 14.8000,
    region: 'Jämtland',
    description: 'Jämtlands största sjö',
    fishSpecies: ['röding', 'öring', 'sik', 'harr']
  },
  {
    name: 'Siljan',
    type: 'sjö',
    lat: 59.4000,
    lon: 13.5000,
    region: 'Dalarna',
    description: 'Populär fiskesjö i Dalarna',
    fishSpecies: ['gös', 'abborre', 'gädda', 'öring']
  },
  {
    name: 'Bolmen',
    type: 'sjö',
    lat: 57.4000,
    lon: 14.4000,
    region: 'Kronoberg',
    description: 'Smålands största sjö',
    fishSpecies: ['gös', 'abborre', 'gädda', 'braxen']
  },
  {
    name: 'Åsnen',
    type: 'sjö',
    lat: 56.9000,
    lon: 14.1000,
    region: 'Kronoberg',
    description: 'Nationalpark och fiskesjö',
    fishSpecies: ['gädda', 'abborre', 'braxen', 'sik']
  },

  // STORA ÄLVAR
  {
    name: 'Dalälven',
    type: 'älv',
    lat: 59.8600,
    lon: 17.0300,
    region: 'Dalarna/Gävleborg',
    description: 'Sveriges längsta älv inom Sverige',
    fishSpecies: ['lax', 'öring', 'harr', 'abborre']
  },
  {
    name: 'Ångermanälven',
    type: 'älv',
    lat: 62.1000,
    lon: 14.6000,
    region: 'Västernorrland/Jämtland',
    description: 'Stor norrlandsälv',
    fishSpecies: ['lax', 'öring', 'harr', 'sik']
  },
  {
    name: 'Indalsälven',
    type: 'älv',
    lat: 63.1700,
    lon: 18.7100,
    region: 'Västernorrland/Jämtland',
    description: 'Viktig laxälv',
    fishSpecies: ['lax', 'öring', 'harr']
  },
  {
    name: 'Luleälven',
    type: 'älv',
    lat: 65.8400,
    lon: 23.1300,
    region: 'Norrbotten',
    description: 'Stor norrlandsälv',
    fishSpecies: ['lax', 'öring', 'harr', 'sik']
  },
  {
    name: 'Torneälven',
    type: 'älv',
    lat: 67.8600,
    lon: 20.2300,
    region: 'Norrbotten',
    description: 'Gränsälv mot Finland',
    fishSpecies: ['lax', 'öring', 'harr', 'sik']
  },
  {
    name: 'Skellefteälven',
    type: 'älv',
    lat: 64.7500,
    lon: 20.9500,
    region: 'Västerbotten',
    description: 'Stor västerbottenälv',
    fishSpecies: ['lax', 'öring', 'harr']
  },
  {
    name: 'Piteälven',
    type: 'älv',
    lat: 65.3200,
    lon: 21.4900,
    region: 'Norrbotten',
    description: 'Friflytande norrlandsälv',
    fishSpecies: ['lax', 'öring', 'harr']
  },

  // ÅAR OCH MINDRE VATTENDRAG
  {
    name: 'Göta älv',
    type: 'älv',
    lat: 57.7500,
    lon: 11.9000,
    region: 'Västra Götaland',
    description: 'Förbinder Vänern med Kattegat',
    fishSpecies: ['lax', 'öring', 'ål', 'abborre']
  },
  {
    name: 'Motala ström',
    type: 'å',
    lat: 58.5000,
    lon: 15.0000,
    region: 'Östergötland',
    description: 'Förbinder Vättern med Östersjön',
    fishSpecies: ['öring', 'abborre', 'gädda']
  },
  {
    name: 'Ljungan',
    type: 'älv',
    lat: 62.0500,
    lon: 17.9400,
    region: 'Västernorrland',
    description: 'Medelstorålv i Västernorrland',
    fishSpecies: ['öring', 'harr', 'sik']
  },
  {
    name: 'Ljusnan',
    type: 'älv',
    lat: 61.7000,
    lon: 16.1000,
    region: 'Gävleborg/Jämtland',
    description: 'Stor älv i Gävleborg',
    fishSpecies: ['lax', 'öring', 'harr']
  },
  {
    name: 'Gävleån',
    type: 'å',
    lat: 60.1200,
    lon: 18.7100,
    region: 'Gävleborg',
    description: 'Stadsnära fiskevatten',
    fishSpecies: ['öring', 'abborre', 'gädda']
  },

  // KUSTVATTEN OCH SUND
  {
    name: 'Öresund',
    type: 'sund',
    lat: 55.7585,
    lon: 12.9069,
    region: 'Skåne',
    description: 'Sund mellan Sverige och Danmark',
    fishSpecies: ['torsk', 'makrill', 'sill', 'plattfisk']
  },
  {
    name: 'Kalmarsund',
    type: 'sund',
    lat: 56.6000,
    lon: 16.4000,
    region: 'Kalmar',
    description: 'Sund mellan fastland och Öland',
    fishSpecies: ['torsk', 'abborre', 'gädda', 'ål']
  },
  {
    name: 'Stockholms skärgård',
    type: 'fjärd',
    lat: 59.3000,
    lon: 18.3000,
    region: 'Stockholm',
    description: 'Stor skärgård med många fiskevatten',
    fishSpecies: ['abborre', 'gädda', 'gös', 'lax', 'öring']
  },
  {
    name: 'Göteborgs skärgård',
    type: 'fjärd',
    lat: 57.6000,
    lon: 11.7000,
    region: 'Västra Götaland',
    description: 'Västkustens skärgård',
    fishSpecies: ['makrill', 'torsk', 'sill', 'abborre']
  }
];

// Sökfunktion för vattendrag
export function searchWaterBodies(query: string): WaterBody[] {
  const searchTerm = query.toLowerCase().trim();
  
  if (searchTerm.length < 2) return [];
  
  return SWEDISH_WATER_BODIES.filter(water => 
    water.name.toLowerCase().includes(searchTerm) ||
    water.type.toLowerCase().includes(searchTerm) ||
    water.region.toLowerCase().includes(searchTerm) ||
    water.description?.toLowerCase().includes(searchTerm) ||
    water.fishSpecies?.some(fish => fish.toLowerCase().includes(searchTerm))
  ).slice(0, 10); // Max 10 resultat
}

// Hitta närmaste vattendrag
export function findNearestWaterBody(lat: number, lon: number, maxDistance: number = 0.5): WaterBody | null {
  let nearest: WaterBody | null = null;
  let minDistance = Infinity;
  
  for (const water of SWEDISH_WATER_BODIES) {
    const distance = Math.sqrt(
      Math.pow(lat - water.lat, 2) + Math.pow(lon - water.lon, 2)
    );
    
    if (distance < minDistance && distance <= maxDistance) {
      minDistance = distance;
      nearest = water;
    }
  }
  
  return nearest;
}

// Hämta alla vattendrag i en region
export function getWaterBodiesByRegion(region: string): WaterBody[] {
  return SWEDISH_WATER_BODIES.filter(water => 
    water.region.toLowerCase().includes(region.toLowerCase())
  );
}

// Hämta vattendrag efter typ
export function getWaterBodiesByType(type: WaterBody['type']): WaterBody[] {
  return SWEDISH_WATER_BODIES.filter(water => water.type === type);
} 