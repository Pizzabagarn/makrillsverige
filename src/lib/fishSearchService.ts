// Generic fish type - måste ha svenskt_namn och latinskt_namn
interface BaseFishData {
  svenskt_namn: string;
  latinskt_namn: string;
}

interface FishSearchResult<T extends BaseFishData> {
  fish: T;
  relevanceScore: number;
  matchReason: string;
}

class FishSearchService {
  // POPULÄRA FISKAR - kommer alltid först i resultaten
  private getPopularityScore(fishName: string): number {
    const popularFish: { [key: string]: number } = {
      'abborre': 100,
      'gädda': 95,
      'lax': 90,
      'gös': 85,
      'öring': 80,
      'torsk': 75,
      'makrill': 70,
      'ål': 65,
      'karp': 60,
      'braxen': 55,
      'ruda': 50,
      'id': 45,
      'mört': 40,
      'regnbåge': 35,
      'havsöring': 30,
      'sik': 25,
      'harr': 20,
      'lake': 15,
      'nors': 10
    };
    
    return popularFish[fishName.toLowerCase()] || 0;
  }

  // FUZZY ALTERNATIVES för vanliga stavfel och förkortningar
  private getFishAlternatives(query: string): string | null {
    const alternatives: { [key: string]: string } = {
      'aborre': 'abborre',
      'abor': 'abborre',
      'gadda': 'gädda',
      'ged': 'gädda',
      'gäd': 'gädda',
      'gos': 'gös',
      'gös': 'gös',
      'laks': 'lax',
      'oring': 'öring',
      'öri': 'öring',
      'trout': 'öring',
      'tors': 'torsk',
      'cod': 'torsk',
      'makrel': 'makrill',
      'mackerel': 'makrill',
      'eel': 'ål',
      'karp': 'karp',
      'carp': 'karp',
      'brax': 'braxen',
      'bream': 'braxen',
      'regnbåg': 'regnbåge',
      'rainbow': 'regnbåge',
      'havsorin': 'havsöring',
      'havsöri': 'havsöring',
      'seatrout': 'havsöring'
    };

    return alternatives[query.toLowerCase()] || null;
  }

  // SMART SÖKNING med relevanssortering
  searchFish<T extends BaseFishData>(fishData: T[], searchTerm: string): T[] {
    if (!searchTerm || searchTerm.length < 1) return fishData;
    
    const query = searchTerm.toLowerCase().trim();
    
    // Skapa sökresultat med poäng
    const results: FishSearchResult<T>[] = fishData.map(fish => {
      const svensktNamn = fish.svenskt_namn.toLowerCase();
      const latinsktNamn = fish.latinskt_namn.toLowerCase();
      
      let score = 0;
      let matchReason = '';
      
      // 1. EXAKT MATCHNING (högsta poäng)
      if (svensktNamn === query || latinsktNamn === query) {
        score = 1000;
        matchReason = 'exact match';
      }
      // 2. SVENSKT NAMN BÖRJAR MED
      else if (svensktNamn.startsWith(query)) {
        score = 900;
        matchReason = 'starts with (swedish)';
      }
      // 3. LATINSKT NAMN BÖRJAR MED
      else if (latinsktNamn.startsWith(query)) {
        score = 850;
        matchReason = 'starts with (latin)';
      }
      // 4. FUZZY MATCH från våra alternatives
      else if (this.getFishAlternatives(query) && 
               (svensktNamn.startsWith(this.getFishAlternatives(query)!) ||
                svensktNamn === this.getFishAlternatives(query)!)) {
        score = 800;
        matchReason = `fuzzy match: ${this.getFishAlternatives(query)}`;
      }
      // 5. SVENSKT NAMN INNEHÅLLER
      else if (svensktNamn.includes(query)) {
        score = 700;
        matchReason = 'contains (swedish)';
      }
      // 6. LATINSKT NAMN INNEHÅLLER
      else if (latinsktNamn.includes(query)) {
        score = 600;
        matchReason = 'contains (latin)';
      }
      // 7. PARTIELL MATCHNING (för långa namn)
      else if (query.length >= 3 && (
        this.isSubsequence(query, svensktNamn) || 
        this.isSubsequence(query, latinsktNamn)
      )) {
        score = 500;
        matchReason = 'partial match';
      }
      else {
        score = 0;
        matchReason = 'no match';
      }
      
      // POPULARITETSBONUS
      const popularityBonus = this.getPopularityScore(fish.svenskt_namn);
      score += popularityBonus;
      
      return {
        fish,
        relevanceScore: score,
        matchReason: `${matchReason} (+${popularityBonus} popularity)`
      };
    })
    .filter(result => result.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    return results.map(result => result.fish);
  }

  // Subsequence matching för partiella matchningar
  private isSubsequence(query: string, target: string): boolean {
    let queryIndex = 0;
    for (let targetIndex = 0; targetIndex < target.length && queryIndex < query.length; targetIndex++) {
      if (query[queryIndex] === target[targetIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === query.length;
  }
}

// Singleton instance
export const fishSearchService = new FishSearchService();
export type { BaseFishData }; 