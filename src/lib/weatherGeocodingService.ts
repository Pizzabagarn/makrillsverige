// Geocoding-tjänst för väder-sök: konverterar områdesnamn till koordinater
// Användare kan söka på stadnamn, kommuner, osv. för att få väderprognos

interface GeoLocation {
  lat: number;
  lon: number;
  displayName: string;
  boundingBox?: [number, number, number, number]; // [min_lat, max_lat, min_lon, max_lon]
}

interface GeoSearchResult {
  locations: GeoLocation[];
  query: string;
  cached: boolean;
}

// Temporär interface för sortering
interface LocationWithScore extends GeoLocation {
  relevanceScore: number;
  rawItem?: any;
}

class WeatherGeocodingService {
  private cache = new Map<string, { results: GeoLocation[]; timestamp: number }>();
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 timme cache för sökningar
  private readonly REQUEST_DELAY = 100; // 100ms mellan requests
  private lastRequestTime = 0;

  // Kontrollera om cache-post är giltig
  private isCacheValid(entry: { results: GeoLocation[]; timestamp: number }): boolean {
    return Date.now() - entry.timestamp < this.CACHE_DURATION;
  }

  // Huvudfunktion för att söka platser
  async searchLocations(query: string, countryCode: string = 'se,no,dk'): Promise<GeoSearchResult> {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Kontrollera cache först
    const cachedEntry = this.cache.get(normalizedQuery);
    if (cachedEntry && this.isCacheValid(cachedEntry)) {
      return {
        locations: cachedEntry.results,
        query,
        cached: true
      };
    }

    try {
      // Rate limiting
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.REQUEST_DELAY) {
        await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY - timeSinceLastRequest));
      }

      this.lastRequestTime = Date.now();

      // 1. Försök med primär sökning först
      let results = await this.performSearch(query, countryCode);
      
      // 2. Om vi fick få resultat och query är kort, försök med fuzzy
      if (results.length < 3 && query.length >= 3) {
        const fuzzyQuery = this.getFuzzyAlternatives(query);
        if (fuzzyQuery && fuzzyQuery !== query) {
          const fuzzyResults = await this.performSearch(fuzzyQuery, countryCode);
          // Kombinera resultat men undvik duplikater
          const existingIds = new Set(results.map(r => r.place_id || `${r.lat}-${r.lon}`));
          fuzzyResults.forEach(item => {
            const id = item.place_id || `${item.lat}-${item.lon}`;
            if (!existingIds.has(id)) {
              results.push(item);
            }
          });
        }
      }

      const locations = this.processSearchResults(results, normalizedQuery);

      // Cacha resultatet
      this.cache.set(normalizedQuery, {
        results: locations,
        timestamp: Date.now()
      });

      return {
        locations,
        query,
        cached: false
      };

    } catch (error) {
      console.warn('Geocoding search failed:', error);
      return { locations: [], query, cached: false };
    }
  }

    // PROFESSIONELL stadsdatabas - eftersom Nominatim är SKIT
  private getSwedishCities(): Array<{name: string, lat: number, lon: number, region: string}> {
    return [
      // STORA STÄDER (viktigt att de kommer först)
      { name: 'malmö', lat: 55.6050, lon: 13.0038, region: 'Skåne län' },
      { name: 'stockholm', lat: 59.3293, lon: 18.0686, region: 'Stockholms län' },
      { name: 'göteborg', lat: 57.7089, lon: 11.9746, region: 'Västra Götalands län' },
      { name: 'uppsala', lat: 59.8586, lon: 17.6389, region: 'Uppsala län' },
      { name: 'västerås', lat: 59.6162, lon: 16.5528, region: 'Västmanlands län' },
      { name: 'örebro', lat: 59.2741, lon: 15.2066, region: 'Örebro län' },
      { name: 'linköping', lat: 58.4108, lon: 15.6214, region: 'Östergötlands län' },
      { name: 'helsingborg', lat: 56.0465, lon: 12.6945, region: 'Skåne län' },
      { name: 'jönköping', lat: 57.7826, lon: 14.1618, region: 'Jönköpings län' },
      { name: 'norrköping', lat: 58.5877, lon: 16.1924, region: 'Östergötlands län' },
      { name: 'lund', lat: 55.7047, lon: 13.1910, region: 'Skåne län' },
      { name: 'umeå', lat: 63.8258, lon: 20.2630, region: 'Västerbottens län' },
      { name: 'gävle', lat: 60.6749, lon: 17.1413, region: 'Gävleborgs län' },
      { name: 'borås', lat: 57.7210, lon: 12.9401, region: 'Västra Götalands län' },
      { name: 'eskilstuna', lat: 59.3706, lon: 16.5077, region: 'Södermanlands län' },
      { name: 'sundsvall', lat: 62.3908, lon: 17.3069, region: 'Västernorrlands län' },
      { name: 'karlstad', lat: 59.3793, lon: 13.5036, region: 'Värmlands län' },
      { name: 'växjö', lat: 56.8777, lon: 14.8091, region: 'Kronobergs län' },
      { name: 'halmstad', lat: 56.6745, lon: 12.8580, region: 'Hallands län' },
      { name: 'östersund', lat: 63.1792, lon: 14.6357, region: 'Jämtlands län' },
      
      // MELLANSTORA STÄDER
      { name: 'malung', lat: 60.6807, lon: 13.7112, region: 'Dalarnas län' },
      { name: 'mariefred', lat: 59.2593, lon: 17.2273, region: 'Södermanlands län' },
      { name: 'mariestad', lat: 58.7095, lon: 13.8239, region: 'Västra Götalands län' },
      { name: 'kristianstad', lat: 56.0294, lon: 14.1567, region: 'Skåne län' },
      { name: 'karlskrona', lat: 56.1612, lon: 15.5869, region: 'Blekinge län' },
      { name: 'kalmar', lat: 56.6634, lon: 16.3567, region: 'Kalmar län' },
      { name: 'visby', lat: 57.6348, lon: 18.2948, region: 'Gotlands län' },
      { name: 'luleå', lat: 65.5848, lon: 22.1547, region: 'Norrbottens län' },
      { name: 'kiruna', lat: 67.8558, lon: 20.2253, region: 'Norrbottens län' },
      { name: 'höganäs', lat: 56.2015, lon: 12.5592, region: 'Skåne län' },
      { name: 'lysekil', lat: 58.2836, lon: 11.9289, region: 'Västra Götalands län' },
      
      // NORSKA OCH DANSKA STÄDER  
      { name: 'oslo', lat: 59.9139, lon: 10.7522, region: 'Norge' },
      { name: 'bergen', lat: 60.3913, lon: 5.3221, region: 'Norge' },
      { name: 'trondheim', lat: 63.4305, lon: 10.3951, region: 'Norge' },
      { name: 'köpenhamn', lat: 55.6761, lon: 12.5683, region: 'Danmark' },
      { name: 'århus', lat: 56.1629, lon: 10.2039, region: 'Danmark' }
    ];
  }

  // SMART sökning i vår egen databas
  private searchInDatabase(query: string): GeoLocation[] {
    const cities = this.getSwedishCities();
    const normalizedQuery = query.toLowerCase().trim();
    
    const matches = cities
      .filter(city => {
        // Exakt match eller börjar med query
        return city.name === normalizedQuery || city.name.startsWith(normalizedQuery);
      })
      .map(city => ({
        lat: city.lat,
        lon: city.lon,
        displayName: `${city.name.charAt(0).toUpperCase() + city.name.slice(1)}, ${city.region}`,
        score: city.name === normalizedQuery ? 1000 : 900 // Exakt match får högst poäng
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(city => ({
        lat: city.lat,
        lon: city.lon,
        displayName: city.displayName
      }));
    
    return matches;
  }

  // Gör en enskild API-sökning (BACKUP till vår databas)
  private async performSearch(searchQuery: string, countryCode: string): Promise<any[]> {
    // FÖRSTA: Försök vår egna databas (SNABBT och FUNGERAR)
    const dbResults = this.searchInDatabase(searchQuery);
    if (dbResults.length > 0) {
      // Konvertera till Nominatim-format för kompatibilitet
      return dbResults.map(result => ({
        lat: result.lat.toString(),
        lon: result.lon.toString(),
        display_name: result.displayName,
        place_id: `db_${result.lat}_${result.lon}`,
        importance: 0.9, // Våra databas-resultat är alltid viktiga
        place_rank: 12,  // Högt rankade
        address: {
          city: result.displayName.split(',')[0],
          county: result.displayName.split(',')[1]?.trim()
        }
      }));
    }
    
    // BACKUP: Om vår databas inte har träff, försök Nominatim (men den är skit)
    const exactUrl = new URL('https://nominatim.openstreetmap.org/search');
    exactUrl.searchParams.set('q', searchQuery);
    exactUrl.searchParams.set('countrycodes', countryCode);
    exactUrl.searchParams.set('format', 'json');
    exactUrl.searchParams.set('addressdetails', '1');
    exactUrl.searchParams.set('accept-language', 'en');
    exactUrl.searchParams.set('limit', '5');
    exactUrl.searchParams.set('dedupe', '1');

    try {
      const response = await fetch(exactUrl.toString(), {
        headers: {
          'User-Agent': 'MakrillSverige Weather Search/1.0 (https://makrillsverige.se)'
        }
      });

      if (response.ok) {
        const results = await response.json();
        return results;
      }
    } catch (error) {
      console.warn('Nominatim backup misslyckades:', error);
    }

    return [];
  }

  // Fuzzy alternatives för vanliga svenska städer
  private getFuzzyAlternatives(query: string): string | null {
    const alternatives: { [key: string]: string } = {
      'höga': 'höganäs',
      'malm': 'malmö', 
      'stock': 'stockholm',
      'göte': 'göteborg',
      'lul': 'luleå',
      'osl': 'oslo',
      'upps': 'uppsala',
      'link': 'linköping',
      'norrk': 'norrköping',
      'hels': 'helsingborg',
      'jönk': 'jönköping',
      'väst': 'västerås',
      'öre': 'örebro',
      'esk': 'eskilstuna',
      'sunds': 'sundsvall',
      'gav': 'gävle',
      'bor': 'borås',
      'lund': 'lund',
      'karl': 'karlstad',
      'falk': 'falköping'
    };

    return alternatives[query] || null;
  }

  // Professionell bearbetning av sökresultat
  private processSearchResults(data: any[], searchQuery: string): GeoLocation[] {
    if (!Array.isArray(data)) {
      return [];
    }

    // Konvertera och filtrera resultat
    const locations = data
      .filter(item => item.lat && item.lon && item.display_name)
      .map(item => {
        const location: LocationWithScore = {
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          displayName: this.formatDisplayName(item.display_name, item.address),
          relevanceScore: 0,
          rawItem: item
        };

        // Lägg till bounding box om den finns
        if (item.boundingbox && Array.isArray(item.boundingbox) && item.boundingbox.length === 4) {
          const [minLat, maxLat, minLon, maxLon] = item.boundingbox.map(parseFloat);
          location.boundingBox = [minLat, maxLat, minLon, maxLon];
        }

        return location;
      })
      .filter(location => 
        // Filtrera till skandinaviska området (inklusive Danmark och Norge)
        location.lat >= 54.5 && location.lat <= 71.2 &&
        location.lon >= 4.0 && location.lon <= 31.5
      );

    // Sortera efter relevans
    return this.sortByRelevance(locations, searchQuery);
  }

  // Förbättrad relevanssortering med importance-based prioritering
  private sortByRelevance(locations: LocationWithScore[], searchQuery: string): GeoLocation[] {
    const query = searchQuery.toLowerCase().trim();
    
    const scored = locations
      .map(location => {
        const displayName = location.displayName.toLowerCase();
        const mainPlace = displayName.split(',')[0].trim();
        
        let score = 0;
        
        // 1. Exakt matchning av huvudnamn (högsta poäng)
        if (mainPlace === query) {
          score = 1000;
        }
        // 2. Huvudnamn börjar med query
        else if (mainPlace.startsWith(query)) {
          score = 900;
        }
        // 3. Improved fuzzy match från vårt alternatives-system
        else if (this.getFuzzyAlternatives(query) && mainPlace.startsWith(this.getFuzzyAlternatives(query)!)) {
          score = 850;
        }
        // 4. Något ord börjar med query
        else if (displayName.split(/[\s,]+/).some((word: string) => word.startsWith(query))) {
          score = 800;
        }
        // 5. Huvudnamn innehåller query
        else if (mainPlace.includes(query)) {
          score = 700;
        }
        // 6. Hela namnet innehåller query
        else if (displayName.includes(query)) {
          score = 600;
        }
        // 7. FÖRBÄTTRAD fuzzy matching - fungerar för allt
        else if (this.advancedFuzzyMatch(query, mainPlace)) {
          score = 550;
        }
        // 8. Levenshtein-baserad similarity för typos
        else if (this.calculateSimilarity(mainPlace, query) > 0.7) {
          score = 400;
        }
        else {
          score = 0;
        }

        // VIKTIGT: Bonus baserat på importance från Nominatim (större städer)
        const item = location.rawItem;
        if (item?.importance) {
          const importanceBonus = Math.round(item.importance * 200); // 0-1 → 0-200 poäng
          score += importanceBonus;
        }

        // Extra bonus för place_rank (lägre = viktigare)
        if (item?.place_rank) {
          const rankBonus = Math.max(0, 50 - item.place_rank); // Lägre rank = högre bonus
          score += rankBonus;
        }

        return { location, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    return scored.map(item => item.location);
  }

  // FÖRBÄTTRAD fuzzy matching som fungerar för alla ord
  private advancedFuzzyMatch(query: string, target: string): boolean {
    if (query.length < 3) return false;
    
    // 1. Subsequence matching (alla tecken i query måste finnas i rätt ordning)
    if (this.isSubsequence(query, target)) {
      return true;
    }
    
    // 2. N-gram matching (delar av query måste finnas)
    const queryChunks = this.createNGrams(query, 3);
    const targetChunks = this.createNGrams(target, 3);
    
    let matches = 0;
    for (const chunk of queryChunks) {
      if (targetChunks.some(targetChunk => targetChunk.includes(chunk))) {
        matches++;
      }
    }
    
    // Om minst 50% av query-chunks matchar
    return matches / queryChunks.length >= 0.5;
  }

  // Skapa N-grams för bättre matching
  private createNGrams(text: string, n: number): string[] {
    const grams: string[] = [];
    for (let i = 0; i <= text.length - n; i++) {
      grams.push(text.substring(i, i + n));
    }
    return grams;
  }

  // Enkel subsequence matching - kolla om alla tecken i query finns i target i rätt ordning
  private isSubsequence(query: string, target: string): boolean {
    let queryIndex = 0;
    for (let targetIndex = 0; targetIndex < target.length && queryIndex < query.length; targetIndex++) {
      if (query[queryIndex] === target[targetIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === query.length;
  }

  // Beräkna likhet mellan två strängar (Levenshtein-baserad)
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  // Levenshtein-distans för fuzzy matching
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,     // deletion
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Formatera visningsnamn för bättre presentation - UTAN KOORDINATER
  private formatDisplayName(displayName: string, address?: any): string {
    if (!displayName) return 'Okänd plats';

    // Rensa bort onödiga delar
    const cleanName = displayName
      .replace(/,\s*Sverige$/i, '')
      .replace(/,\s*Sweden$/i, '')
      .replace(/,\s*Norge$/i, '')
      .replace(/,\s*Norway$/i, '')
      .replace(/,\s*Danmark$/i, '')
      .replace(/,\s*Denmark$/i, '');

    const parts = cleanName.split(',').map(part => part.trim());
    
    if (address) {
      // Prioritera viktiga platsinformation
      const importantParts = [
        address.city,
        address.town,
        address.village,
        address.municipality,
        address.county,
        address.state
      ].filter(Boolean);

      if (importantParts.length > 0) {
        const mainPlace = importantParts[0];
        const region = address.county || address.state;
        
        // Returnera bara platsnamn, INGA koordinater
        if (region && region !== mainPlace) {
          return `${mainPlace}, ${region}`;
        } else {
          return mainPlace;
        }
      }
    }

    // Fallback: använd de bästa delarna av display_name
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`;
    }

    return parts[0] || displayName.split(',')[0];
  }

  // Föreslå populära platser för snabb access
  getPopularLocations(): GeoLocation[] {
    return [
      {
        lat: 59.3293,
        lon: 18.0686,
        displayName: 'Stockholm, Stockholms län'
      },
      {
        lat: 57.7089,
        lon: 11.9746,
        displayName: 'Göteborg, Västra Götalands län'
      },
      {
        lat: 55.6050,
        lon: 13.0038,
        displayName: 'Malmö, Skåne län'
      },
      {
        lat: 58.4108,
        lon: 15.6214,
        displayName: 'Linköping, Östergötlands län'
      },
      {
        lat: 58.2836,
        lon: 11.9289,
        displayName: 'Lysekil, Västra Götalands län'
      },
      {
        lat: 56.0465,
        lon: 12.6945,
        displayName: 'Helsingborg, Skåne län'
      },
      {
        lat: 63.8258,
        lon: 20.2630,
        displayName: 'Umeå, Västerbottens län'
      },
      {
        lat: 59.8586,
        lon: 17.6389,
        displayName: 'Uppsala, Uppsala län'
      }
    ];
  }

  // Rensa gammal cache
  cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isCacheValid(entry)) {
        this.cache.delete(key);
      }
    }
  }

  // Få cache-statistik
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Singleton instance
export const weatherGeocodingService = new WeatherGeocodingService();

// Export interfaces
export type { GeoLocation, GeoSearchResult }; 