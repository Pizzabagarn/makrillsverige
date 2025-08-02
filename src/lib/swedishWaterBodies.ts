// Svenska vattendrag och sjöar - för sökning i väderprognos
// Viktiga fiskevatten i Sverige med koordinater

import { supabase } from './supabase';

export interface WaterBody {
  name: string;
  type: 'sjö' | 'älv' | 'å' | 'bäck' | 'sund' | 'fjärd';
  lat: number;
  lon: number;
  region: string;
  description?: string;
  fishSpecies?: string[];
  tags?: any; // OSM tags for region calculation
}

// Databas-vattenområde (från Supabase med GeoJSON geometri)
export interface DatabaseWaterBody {
  id: number;
  osm_id: number;
  name: string;
  water_type: string;
  area_km2?: number;
  tags?: any;
  geometry?: any;  // GeoJSON geometri som parsas i JavaScript
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

// LOKAL sökfunktion för viktiga vattendrag (snabb)
export function searchWaterBodies(query: string): WaterBody[] {
  const searchTerm = query.toLowerCase().trim();
  
  if (searchTerm.length < 2) return [];
  
  return SWEDISH_WATER_BODIES.filter(water => 
    water.name.toLowerCase().includes(searchTerm) ||
    water.type.toLowerCase().includes(searchTerm) ||
    water.region.toLowerCase().includes(searchTerm) ||
    water.description?.toLowerCase().includes(searchTerm) ||
    water.fishSpecies?.some(fish => fish.toLowerCase().includes(searchTerm))
  ).map(water => ({
    ...water,
    region: getCountryFromCoordinates(water.lat, water.lon) // Konvertera till land för konsistens
  })).slice(0, 10); // Max 10 resultat
}

// DATABAS-sökfunktion för ALLA 294,741 vattendrag (omfattande)
export async function searchWaterBodiesDatabase(query: string): Promise<WaterBody[]> {
  const searchTerm = query.toLowerCase().trim();
  
  if (searchTerm.length < 2) return [];
  
  try {
    // Sök i Supabase databas och hämta geometri för JavaScript-parsing
    const { data: dbResults, error } = await supabase
      .from('water_bodies')
      .select('id, osm_id, name, water_type, area_km2, tags, geometry')
      .not('name', 'is', null)  // Bara vattenområden med namn
      .not('geometry', 'is', null)  // Bara med geometri
      .ilike('name', `%${searchTerm}%`)  // Case-insensitive sökning
      .order('area_km2', { ascending: false, nullsLast: true })  // Större sjöar först
      .limit(15);

    if (error) {
      console.warn('⚠️ Supabase water search failed:', error);
      return [];
    }

    if (!dbResults || dbResults.length === 0) {
      return [];
    }

    // Extrahera koordinater från GeoJSON geometri och konvertera till WaterBody format
    const processedResults = dbResults
      .map((water: any) => {
        const coords = extractCoordinatesFromGeometry(water.geometry);
        if (!coords) return null;
        
        const swedishType = mapWaterTypeToSwedish(water.water_type);
        
        return {
          name: water.name,
          type: swedishType,
          lat: coords.lat,
          lon: coords.lon,
          region: getCountryFromCoordinates(coords.lat, coords.lon), // Snabb land-detektion för sökresultat
          description: water.area_km2 ? `${water.area_km2.toFixed(1)} km²` : undefined,
          fishSpecies: [],  // Kunde utökas med fiskarter från databas
          tags: water.tags  // Spara för senare exakt region-beräkning
        } as WaterBody;
      })
      .filter((water): water is WaterBody => water !== null); // Ta bort null värden
    
    return processedResults.slice(0, 10);
      
  } catch (error) {
    console.warn('⚠️ Database water search error:', error);
    return [];
  }
}

// KOMBINERAD sökfunktion - lokala + databas resultat med geosortierung
export async function searchAllWaterBodies(
  query: string, 
  userLocation?: { lat: number; lon: number }
): Promise<WaterBody[]> {
  // 1. Hämta snabba lokala resultat först
  const localResults = searchWaterBodies(query);
  
  try {
    // 2. Hämta databas-resultat snabbt
    const databaseResults = await searchWaterBodiesDatabase(query);
    
    // 3. SNABB kombinering - lokala först, sedan databas (max 15 totalt)
    const combined = [...localResults, ...databaseResults];
    
    // 4. Snabb deduplicering och begränsning
    const deduplicated = deduplicateWaterBodies(combined);
    
    return deduplicated.slice(0, 15);
    
  } catch (error) {
    // Vid fel, returnera bara lokala resultat (snabbt)
    return localResults;
  }
}

// Extrahera koordinater från PostGIS/GeoJSON geometri
function extractCoordinatesFromGeometry(geometry: any): { lat: number, lon: number } | null {
  if (!geometry || !geometry.coordinates) {
    return null;
  }

  try {
    switch (geometry.type) {
      case 'Point':
        // Point: coordinates = [lon, lat]
        const [lon, lat] = geometry.coordinates;
        return { lat: parseFloat(lat), lon: parseFloat(lon) };
        
      case 'Polygon':
        // Polygon: coordinates = [[[lon, lat], [lon, lat], ...]]
        // Ta första koordinaten från första ringen
        const firstRing = geometry.coordinates[0];
        if (firstRing && firstRing.length > 0) {
          const [lon, lat] = firstRing[0];
          return { lat: parseFloat(lat), lon: parseFloat(lon) };
        }
        break;
        
      case 'MultiPolygon':
        // MultiPolygon: coordinates = [[[[lon, lat], ...]]]
        // Ta första koordinaten från första polygonen
        const firstPolygon = geometry.coordinates[0];
        if (firstPolygon && firstPolygon[0] && firstPolygon[0].length > 0) {
          const [lon, lat] = firstPolygon[0][0];
          return { lat: parseFloat(lat), lon: parseFloat(lon) };
        }
        break;
        
      case 'LineString':
        // LineString: coordinates = [[lon, lat], ...]
        // Ta mitten av linjen
        const coords = geometry.coordinates;
        if (coords && coords.length > 0) {
          const middleIndex = Math.floor(coords.length / 2);
          const [lon, lat] = coords[middleIndex];
          return { lat: parseFloat(lat), lon: parseFloat(lon) };
        }
        break;
        
      default:
        console.warn(`Unknown geometry type: ${geometry.type}`);
    }
  } catch (error) {
    console.warn('Error parsing geometry:', error);
  }
  
  return null;
}

// Hjälpfunktioner
function mapWaterTypeToSwedish(osmType: string): WaterBody['type'] {
  switch (osmType.toLowerCase()) {
    case 'water':
    case 'lake':
      return 'sjö';
    case 'river':
      return 'älv';  
    case 'stream':
    case 'brook':
      return 'å';
    case 'canal':
      return 'kanal' as any;
    case 'bay':
      return 'fjärd';
    case 'strait':
      return 'sund';
    default:
      return 'sjö';
  }
}

// Formattera vattentyp med stor bokstav
function formatWaterType(type: WaterBody['type']): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// Beräkna avstånd mellan två punkter i km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Jordens radie i km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// SNABB och ENKEL deduplicering - bara ta första träffen per namn
function deduplicateWaterBodies(waterBodies: WaterBody[]): WaterBody[] {
  const seen = new Set<string>();
  const filtered: WaterBody[] = [];
  
  waterBodies.forEach(wb => {
    const name = wb.name.toLowerCase().trim();
    if (!seen.has(name)) {
      seen.add(name);
      filtered.push(wb);
    }
  });
  
  return filtered;
}

// Extrahera area från description text
function extractAreaFromDescription(description?: string): number | null {
  if (!description) return null;
  const match = description.match(/\((\d+\.?\d*)\s*km²\)/);
  return match ? parseFloat(match[1]) : null;
}

// Extrahera region från OSM tags (mest tillförlitligt)
export function getRegionFromOSMTags(tags: any): string | null {
  if (!tags) return null;
  
  // Svenska län från OSM
  if (tags['addr:county'] || tags.county) {
    const county = tags['addr:county'] || tags.county;
    if (county.includes('Skåne')) return 'Skåne län';
    if (county.includes('Blekinge')) return 'Blekinge län';
    if (county.includes('Halland')) return 'Hallands län';
    if (county.includes('Kronoberg')) return 'Kronobergs län';
    if (county.includes('Kalmar')) return 'Kalmar län';
    if (county.includes('Gotland')) return 'Gotlands län';
    if (county.includes('Östergötland')) return 'Östergötlands län';
    if (county.includes('Jönköping')) return 'Jönköpings län';
    if (county.includes('Västra Götaland')) return 'Västra Götalands län';
    if (county.includes('Stockholm')) return 'Stockholms län';
    if (county.includes('Uppsala')) return 'Uppsala län';
    if (county.includes('Södermanland')) return 'Södermanlands län';
    if (county.includes('Örebro')) return 'Örebro län';
    if (county.includes('Värmland')) return 'Värmlands län';
    if (county.includes('Dalarna')) return 'Dalarnas län';
    if (county.includes('Gävleborg')) return 'Gävleborgs län';
    if (county.includes('Västernorrland')) return 'Västernorrlands län';
    if (county.includes('Jämtland')) return 'Jämtlands län';
    if (county.includes('Västerbotten')) return 'Västerbottens län';
    if (county.includes('Norrbotten')) return 'Norrbottens län';
  }
  
  // Land från OSM
  if (tags.country || tags['addr:country']) {
    const country = (tags.country || tags['addr:country']).toLowerCase();
    if (country === 'se' || country === 'sweden' || country === 'sverige') {
      return null; // Låt koordinat-logiken hantera svenska regioner
    }
    if (country === 'no' || country === 'norway' || country === 'norge') {
      return tags.state ? `${tags.state}, Norge` : 'Norge';
    }
    if (country === 'dk' || country === 'denmark' || country === 'danmark') {
      return tags.state ? `${tags.state}, Danmark` : 'Danmark';
    }
  }
  
  // Norska regioner
  if (tags.state && (tags.country === 'NO' || tags.country === 'no')) {
    return `${tags.state}, Norge`;
  }
  
  // Danska regioner  
  if (tags.state && (tags.country === 'DK' || tags.country === 'dk')) {
    return `${tags.state}, Danmark`;
  }
  
  return null;
}

export function getRegionFromCoordinates(lat: number, lon: number): string {
  // SVERIGE FÖRST - mest precisa gränser
  if (lon >= 11.0 && lon <= 24.5 && lat >= 55.0 && lat <= 69.5) {
    // Norrbottens län
    if (lat >= 66.0) return 'Norrbottens län';
    // Västerbottens län  
    if (lat >= 64.0) return 'Västerbottens län';
    // Jämtlands län
    if (lat >= 62.0 && lon <= 17.0) return 'Jämtlands län';
    // Västernorrlands län
    if (lat >= 61.5) return 'Västernorrlands län';
    // Gävleborgs län
    if (lat >= 60.0) return 'Gävleborgs län';
    // Dalarnas län
    if (lat >= 59.5 && lon <= 16.0) return 'Dalarnas län';
    // Uppsala län
    if (lat >= 59.4 && lon >= 16.5 && lon <= 18.5) return 'Uppsala län';
    // Stockholms län
    if (lat >= 58.8 && lon >= 17.0) return 'Stockholms län';
    // Västmanlands län
    if (lat >= 59.0 && lon >= 15.5 && lon <= 17.0) return 'Västmanlands län';
    // Örebro län
    if (lat >= 58.5 && lon >= 14.0 && lon <= 16.5) return 'Örebro län';
    // Värmlands län
    if (lat >= 58.5 && lon <= 14.5) return 'Värmlands län';
    // Södermanlands län
    if (lat >= 58.5 && lat <= 59.5 && lon >= 16.0) return 'Södermanlands län';
    // Östergötlands län  
    if (lat >= 57.5 && lat <= 59.0 && lon >= 14.5 && lon <= 16.5) return 'Östergötlands län';
    // Västra Götalands län
    if (lat >= 57.0 && lat <= 59.5 && lon <= 14.0) return 'Västra Götalands län';
    // Jönköpings län
    if (lat >= 56.5 && lat <= 58.0 && lon >= 13.0 && lon <= 15.5) return 'Jönköpings län';
    // Kronobergs län
    if (lat >= 56.0 && lat <= 57.5 && lon >= 13.5 && lon <= 15.5) return 'Kronobergs län';
    // Kalmar län
    if (lat >= 56.0 && lat <= 58.0 && lon >= 15.5) return 'Kalmar län';
    // Gotlands län
    if (lat >= 56.5 && lat <= 58.0 && lon >= 18.0) return 'Gotlands län';
    // Hallands län
    if (lat >= 56.0 && lat <= 57.5 && lon >= 12.0 && lon <= 13.5) return 'Hallands län';  
    // Blekinge län
    if (lat >= 55.8 && lat <= 56.5 && lon >= 14.5 && lon <= 16.0) return 'Blekinge län';
    // Skåne län
    if (lat >= 55.0 && lat <= 56.5 && lon >= 12.5 && lon <= 14.5) return 'Skåne län';
    
    return 'Sverige'; // Fallback för svenska koordinater
  }
  
  // NORWAY - mer restriktiva gränser för att undvika svenska områden
  if (lon >= 4.5 && lon <= 12.0 && lat >= 57.8 && lat <= 71.5) {
    // Unkervatnet är på 65.51°N, 14.20°E - detta är på svenska gränsen men tillhör Norge
    if (lat >= 70) return 'Finnmark, Norge';
    if (lat >= 69) return 'Troms, Norge';  
    if (lat >= 67) return 'Nordland, Norge';
    if (lat >= 65) return 'Nord-Trøndelag, Norge';
    if (lat >= 63) return 'Sør-Trøndelag, Norge';
    if (lat >= 61) return 'Møre og Romsdal, Norge';
    if (lat >= 60) return 'Sogn og Fjordane, Norge';
    if (lat >= 59) return 'Hordaland, Norge';
    return 'Sør-Norge';
  }
  
  // SPECIAL CASE för Unkervatnet som ligger precis på gränsen
  if (lat >= 65.0 && lat <= 66.0 && lon >= 13.5 && lon <= 15.0) {
    return 'Nord-Trøndelag, Norge'; // Unkervatnet
  }
  
  // DANMARK - mer restriktiva gränser
  if (lon >= 8.0 && lon <= 12.5 && lat >= 54.5 && lat <= 57.8) {
    if (lat >= 57) return 'Nordjylland, Danmark';
    if (lat >= 56) return 'Midtjylland, Danmark';
    if (lat >= 55.5) return 'Syddanmark, Danmark';
    return 'Sjælland, Danmark';
  }
    
  return 'Skandinavien';
}

// SNABB land-detektion för sökresultat (endast Sverige/Norge/Danmark)
function getCountryFromCoordinates(lat: number, lon: number): string {
  // NORGE - latitud-beroende gränser (smalare i söder, bredare i norr)
  if (lat >= 65.0 && lon >= 4.5 && lon <= 15.0) {
    // Norra Norge - Unkervatnet område (65.51°N, 14.20°E)
    return 'Norge';
  } else if (lat >= 60.0 && lon >= 4.5 && lon <= 12.0) {
    // Mellersta Norge - smalare
    return 'Norge';
  } else if (lat >= 57.8 && lon >= 4.5 && lon <= 11.0) {
    // Södra Norge - smalast
    return 'Norge';
  }
  
  // SVERIGE - efter Norge-kontroll
  if (lon >= 11.0 && lon <= 24.5 && lat >= 55.0 && lat <= 69.5) {
    return 'Sverige';
  }
  
  // DANMARK - mer restriktiva gränser
  if (lon >= 8.0 && lon <= 12.5 && lat >= 54.5 && lat <= 57.8) {
    return 'Danmark';
  }
  
  return 'Skandinavien';
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