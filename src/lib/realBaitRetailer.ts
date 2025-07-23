interface RetailerProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  currency: string;
  url: string;
  image?: string;
  inStock: boolean;
  description?: string;
  category: string;
  brand?: string;
  retailer: string;
  affiliateId?: string;
  lastUpdated: string;
  effectiveness?: number; // 1-5 stjärnor
}

interface BaitRecommendation {
  fishSpecies: string;
  baitType: string;
  products: RetailerProduct[];
  effectiveness: number; // 1-5 scale
  season: string[];
  waterType: string[];
  technique: string[];
  categoryDescription?: string; // Nytt fält för kategoribeskrivning
}

class RealBaitRetailerService {
  private readonly retailers = {
    sportfiskeprylar: {
      name: 'Sportfiskeprylar',
      baseUrl: 'https://www.sportfiskeprylar.se',
      affiliateParam: 'ref=makrillsverige',
      selectors: {
        product: '.product-item',
        name: '.product-name',
        price: '.price',
        image: '.product-image img',
        stock: '.stock-status'
      }
    },
    utklasad: {
      name: 'Utklasad',
      baseUrl: 'https://utklasad.se',
      affiliateParam: 'utm_source=makrillsverige',
      selectors: {
        product: '.product',
        name: 'h3',
        price: '.price',
        image: 'img',
        stock: '.stock'
      }
    },
    fishsports: {
      name: 'Fishsports',
      baseUrl: 'https://fishline.se',
      affiliateParam: 'partner=makrillsverige',
      selectors: {
        product: '.product-card',
        name: '.product-title',
        price: '.product-price',
        image: '.product-image img',
        stock: '.availability'
      }
    }
  };

  private readonly fishToBaitMapping = {
    'Abborre': {
      searchTerms: [
        { term: 'abborre', displayName: 'Spinnare & Jiggar för Abborre' },
        { term: 'perch', displayName: 'Pimpelbeten & Vertikaldrag' },
        { term: 'pimpel', displayName: 'Klassiska Pimpelbeten' },
        { term: 'jigg', displayName: 'Mjukbeten & Jiggar' },
        { term: 'spinnare', displayName: 'Spinnare & Blinkbeten' }
      ],
      categories: ['jiggar', 'spinnare', 'wobblers', 'mjukbeten'],
      techniques: ['jiggfiske', 'spinnfiske', 'vertikal'],
      waterTypes: ['insjö', 'skärgård', 'å']
    },
    'Gädda': {
      searchTerms: [
        { term: 'gädda', displayName: 'Gäddbeten & Jerkbaits' },
        { term: 'pike', displayName: 'Stora Swimbaits & Tailbeten' },
        { term: 'jerkbait', displayName: 'Klassiska Jerkbaits' },
        { term: 'trolling', displayName: 'Trollingbeten för Gädda' },
        { term: 'swimbaits', displayName: 'Realistiska Swimbaits' }
      ],
      categories: ['jerkbaits', 'swimbaits', 'wobblers', 'skeddrag'],
      techniques: ['trolling', 'kastfiske', 'jerkbait'],
      waterTypes: ['insjö', 'å', 'skärgård']
    },
    'Lax': {
      searchTerms: [
        { term: 'lax', displayName: 'Trollingbeten för Lax' },
        { term: 'salmon', displayName: 'Kustwobblers & Skedar' },
        { term: 'trolling', displayName: 'Professionella Trollingdrag' },
        { term: 'kustwobblers', displayName: 'Kustwobblers & Flashers' }
      ],
      categories: ['trollingbeten', 'kustwobblers', 'skeddrag', 'flugor'],
      techniques: ['trolling', 'flugfiske', 'kustfiske'],
      waterTypes: ['hav', 'älv', 'öppet vatten']
    },
    'Torsk': {
      searchTerms: [
        { term: 'torsk', displayName: 'Pilkar & Havsjiggar' },
        { term: 'cod', displayName: 'Stora Havsbeten' },
        { term: 'pilk', displayName: 'Klassiska Pilkar' },
        { term: 'havsfiske', displayName: 'Professionella Havsbeten' }
      ],
      categories: ['pilkar', 'havsfiskejiggar', 'naturbeten'],
      techniques: ['pilkfiske', 'havsfiske', 'bottenfiske'],
      waterTypes: ['hav', 'djupvatten', 'klippbotten']
    },
    'Öring': {
      searchTerms: [
        { term: 'öring', displayName: 'Flugor & Spinnare för Öring' },
        { term: 'trout', displayName: 'Klassiska Öringbeten' },
        { term: 'flugor', displayName: 'Streamers & Våtflugor' },
        { term: 'spinnare', displayName: 'Små Spinnare & Wobblers' }
      ],
      categories: ['flugor', 'spinnare', 'wobblers', 'nymfer'],
      techniques: ['flugfiske', 'spinnfiske', 'mete'],
      waterTypes: ['å', 'insjö', 'hav']
    }
  };

  async scrapeRetailerProducts(retailer: keyof typeof this.retailers, searchTerm: string): Promise<RetailerProduct[]> {
    const config = this.retailers[retailer];
    
    try {
      // Simulate scraping (in production, use puppeteer or similar)
      const response = await fetch(`/api/scrape-products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailer,
          searchTerm,
          config
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to scrape ${retailer}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error scraping ${retailer}:`, error);
      return [];
    }
  }

  async getRecommendedBaitsForFish(fishSpecies: string): Promise<BaitRecommendation[]> {
    console.log(`🔍 Hämtar beten för ${fishSpecies}...`);
    
    // FÖRST: Hämta riktiga sparade beten från admin-panelen
    const savedBaits = await this.getSavedBaitsForFish(fishSpecies);
    
    const recommendations: BaitRecommendation[] = [];
    
    // Om vi har sparade beten, använd dem som primär källa
    if (savedBaits.length > 0) {
      console.log(`✅ Hittade ${savedBaits.length} sparade beten för ${fishSpecies}`);
      
      // Gruppera sparade beten per kategori
      const baitsByCategory: { [key: string]: {products: RetailerProduct[], categoryDescription?: string} } = {};
      
      savedBaits.forEach(bait => {
        const category = bait.category || 'Andra beten';
        const displayName = this.getCategoryDisplayName(category);
        
        if (!baitsByCategory[displayName]) {
          baitsByCategory[displayName] = {
            products: [],
            categoryDescription: bait.categoryDescription // Spara kategoribeskrivningen
          };
        }
        
        baitsByCategory[displayName].products.push({
          id: bait.id,
          name: bait.title,
          price: bait.price || 0,
          originalPrice: bait.originalPrice,
          currency: bait.currency,
          url: bait.url,
          image: bait.image,
          inStock: bait.inStock || false,
          description: bait.description,
          category: bait.category || 'fiskedrag',
          brand: bait.brand,
          retailer: bait.retailer,
          lastUpdated: bait.lastUpdated,
          effectiveness: bait.effectiveness || 5 // Default 5 stjärnor om inte angivet
        });
      });
      
      // Skapa recommendations från sparade beten
      Object.entries(baitsByCategory).forEach(([displayName, categoryData]) => {
        // Beräkna genomsnittlig effectiveness från produkterna i denna kategori
        const avgEffectiveness = categoryData.products.length > 0 
          ? categoryData.products.reduce((sum, product) => sum + (product.effectiveness || 5), 0) / categoryData.products.length
          : 5;

        recommendations.push({
          fishSpecies,
          baitType: displayName,
          products: categoryData.products,
          effectiveness: avgEffectiveness,
          season: ['året runt'],
          waterType: ['alla vattentyper'],
          technique: ['alla tekniker'],
          categoryDescription: categoryData.categoryDescription // Lägg till kategoribeskrivning i recommendation
        });
      });
    }
    
    // INGEN MOCK DATA - bara sparade beten visas

    // Sort by effectiveness (sparade beten först)
    return recommendations
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 6); // Begränsa till 6 kategorier
  }

  // Ny metod för att hämta sparade beten för specifik fiskart
  private async getSavedBaitsForFish(fishSpecies: string): Promise<any[]> {
    try {
      const response = await fetch(`/api/saved-baits?fishSpecies=${encodeURIComponent(fishSpecies)}`);
      
      if (response.ok) {
        return await response.json();
      } else {
        console.warn(`No saved baits API response for ${fishSpecies}`);
        return [];
      }
    } catch (error) {
      console.warn('Error fetching saved baits:', error);
      return [];
    }
  }

  // Hjälpmetod för att få display-namn för kategorier
  private getCategoryDisplayName(category: string): string {
    const categoryMap: { [key: string]: string } = {
      'jiggar': 'Jiggar & Mjukbeten',
      'spinnare': 'Spinnare & Blinkbeten', 
      'wobblers': 'Wobblers & Crankbaits',
      'jerkbaits': 'Jerkbaits & Swimbaits',
      'swimbaits': 'Swimbaits & Stora beten',
      'pilkar': 'Pilkar & Havsbeten',
      'flugor': 'Flugor & Streamers',
      'trollingbeten': 'Trollingbeten',
      'fiskedrag': 'Fiskedrag & Övriga beten'
    };
    
    return categoryMap[category.toLowerCase()] || category;
  }



  private isRelevantProduct(product: RetailerProduct, fishConfig: any): boolean {
    const productText = `${product.name} ${product.description || ''} ${product.category}`.toLowerCase();
    
    return fishConfig.searchTerms.some((searchConfig: { term: string; displayName: string }) => 
      productText.includes(searchConfig.term.toLowerCase())
    ) || fishConfig.categories.some((category: string) => 
      product.category.toLowerCase().includes(category.toLowerCase())
    );
  }

  private addAffiliateTracking(url: string, affiliateParam: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${affiliateParam}`;
  }

  private calculateEffectiveness(products: RetailerProduct[], fishConfig: any): number {
    // Simple scoring based on product availability and category match
    let score = 0;
    
    products.forEach(product => {
      if (product.inStock) score += 1;
      if (product.originalPrice && product.price < product.originalPrice) score += 0.5;
      
      fishConfig.categories.forEach((category: string) => {
        if (product.category.toLowerCase().includes(category.toLowerCase())) {
          score += 0.3;
        }
      });
    });

    return Math.min(5, Math.max(1, score / products.length));
  }

  private determineSeason(searchTerm: string): string[] {
    const seasonMapping: { [key: string]: string[] } = {
      'trolling': ['sommar', 'höst'],
      'jigg': ['vinter', 'vår', 'höst'],
      'flugfiske': ['vår', 'sommar', 'tidig höst'],
      'pilk': ['året runt'],
      'spinnare': ['vår', 'sommar', 'höst']
    };

    for (const [term, seasons] of Object.entries(seasonMapping)) {
      if (searchTerm.toLowerCase().includes(term)) {
        return seasons;
      }
    }

    return ['året runt'];
  }

  private deduplicateAndSort(recommendations: BaitRecommendation[]): BaitRecommendation[] {
    // Remove duplicate products and sort by effectiveness
    const uniqueRecommendations = recommendations.reduce((acc, rec) => {
      const existing = acc.find(r => r.baitType === rec.baitType);
      if (existing) {
        // Merge products, removing duplicates by URL
        const existingUrls = existing.products.map(p => p.url);
        const newProducts = rec.products.filter(p => !existingUrls.includes(p.url));
        existing.products.push(...newProducts);
        existing.effectiveness = Math.max(existing.effectiveness, rec.effectiveness);
      } else {
        acc.push(rec);
      }
      return acc;
    }, [] as BaitRecommendation[]);

    return uniqueRecommendations
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 8); // Limit to top 8 recommendations
  }

  async updateProductPrices(products: RetailerProduct[]): Promise<RetailerProduct[]> {
    const updatePromises = products.map(async (product) => {
      try {
        const retailerKey = Object.keys(this.retailers).find(key => 
          product.retailer === this.retailers[key as keyof typeof this.retailers].name
        ) as keyof typeof this.retailers;

        if (!retailerKey) return product;

        // Fetch updated price
        const updatedProducts = await this.scrapeRetailerProducts(retailerKey, product.name);
        const updatedProduct = updatedProducts.find(p => 
          p.name.toLowerCase().includes(product.name.toLowerCase()) ||
          p.url === product.url.split('?')[0] // Remove affiliate params for comparison
        );

        if (updatedProduct) {
          return {
            ...product,
            price: updatedProduct.price,
            inStock: updatedProduct.inStock,
            lastUpdated: new Date().toISOString()
          };
        }

        return product;
      } catch (error) {
        console.error(`Error updating price for ${product.name}:`, error);
        return product;
      }
    });

    return Promise.all(updatePromises);
  }

  async trackAffiliateClick(productId: string, retailer: string, fishSpecies: string): Promise<void> {
    try {
      await fetch('/api/affiliate-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          retailer,
          fish_species: fishSpecies,
          timestamp: new Date().toISOString(),
          action: 'click'
        })
      });
    } catch (error) {
      console.error('Error tracking affiliate click:', error);
    }
  }
}

export default RealBaitRetailerService; 