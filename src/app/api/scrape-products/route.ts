import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

interface RetailerConfig {
  name: string;
  baseUrl: string;
  affiliateParam: string;
  selectors: {
    product: string;
    name: string;
    price: string;
    image: string;
    stock: string;
  };
}

interface ScrapedProduct {
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
  lastUpdated: string;
}

// Rate limiting to avoid being blocked
const requestLimiter = new Map<string, number>();
const RATE_LIMIT_MS = 2000; // 2 seconds between requests per retailer

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeWebsite(url: string, config: RetailerConfig, searchTerm: string): Promise<ScrapedProduct[]> {
  const retailerKey = config.name.toLowerCase();
  const now = Date.now();
  const lastRequest = requestLimiter.get(retailerKey) || 0;
  
  if (now - lastRequest < RATE_LIMIT_MS) {
    await delay(RATE_LIMIT_MS - (now - lastRequest));
  }
  requestLimiter.set(retailerKey, Date.now());

  try {
    const searchUrl = constructSearchUrl(config.baseUrl, searchTerm);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const products: ScrapedProduct[] = [];

    $(config.selectors.product).each((_index: number, element: cheerio.Element) => {
      try {
        const $el = $(element);
        
        const name = extractText($el, config.selectors.name).trim();
        const priceText = extractText($el, config.selectors.price);
        const imageUrl = extractAttribute($el, config.selectors.image, 'src');
        const stockText = extractText($el, config.selectors.stock);
        
        if (!name || !priceText) return; // Skip incomplete products

        const price = parsePrice(priceText);
        if (price === null) return;

        const productUrl = extractProductUrl($el, config.baseUrl);
        if (!productUrl) return;

        const product: ScrapedProduct = {
          id: generateProductId(name, config.name),
          name: cleanProductName(name),
          price,
          currency: 'SEK',
          url: productUrl,
          image: imageUrl ? absoluteUrl(imageUrl, config.baseUrl) : undefined,
          inStock: determineStockStatus(stockText),
          category: determineCategory(name, searchTerm),
          retailer: config.name,
          lastUpdated: new Date().toISOString()
        };

        // Try to extract original price if on sale
        const originalPriceText = extractText($el, '.original-price, .was-price, .old-price');
        if (originalPriceText) {
          const originalPrice = parsePrice(originalPriceText);
          if (originalPrice && originalPrice > price) {
            product.originalPrice = originalPrice;
          }
        }

        products.push(product);
      } catch (error) {
        console.error('Error parsing product element:', error);
      }
    });

    return products.slice(0, 20); // Limit to 20 products per search
  } catch (error) {
    console.error(`Error scraping ${config.name}:`, error);
    return [];
  }
}

function constructSearchUrl(baseUrl: string, searchTerm: string): string {
  // Different search URL patterns for different sites
  if (baseUrl.includes('sportfiskeprylar')) {
    return `${baseUrl}/search?q=${encodeURIComponent(searchTerm)}`;
  } else if (baseUrl.includes('utklasad')) {
    return `${baseUrl}/search?query=${encodeURIComponent(searchTerm)}`;
  } else if (baseUrl.includes('fishline')) {
    return `${baseUrl}/search?search=${encodeURIComponent(searchTerm)}`;
  }
  
  return `${baseUrl}/search?q=${encodeURIComponent(searchTerm)}`;
}

function extractText($el: cheerio.Cheerio, selector: string): string {
  try {
    return $el.find(selector).first().text().trim() || $el.filter(selector).text().trim();
  } catch {
    return '';
  }
}

function extractAttribute($el: cheerio.Cheerio, selector: string, attribute: string): string {
  try {
    return $el.find(selector).first().attr(attribute) || $el.filter(selector).attr(attribute) || '';
  } catch {
    return '';
  }
}

function extractProductUrl($el: cheerio.Cheerio, baseUrl: string): string {
  const linkSelectors = ['a', '.product-link', '.product-title a', 'h3 a'];
  
  for (const selector of linkSelectors) {
    const href = $el.find(selector).first().attr('href') || $el.filter('a').attr('href');
    if (href) {
      return absoluteUrl(href, baseUrl);
    }
  }
  
  return '';
}

function parsePrice(priceText: string): number | null {
  // Remove common Swedish price formatting
  const cleanPrice = priceText
    .replace(/[^\d,.-]/g, '') // Remove non-numeric characters except common separators
    .replace(',', '.') // Convert comma to dot for decimal
    .replace(/\.(?=.*\.)/g, ''); // Remove dots that aren't the decimal separator
  
  const price = parseFloat(cleanPrice);
  return isNaN(price) ? null : price;
}

function absoluteUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  return `${baseUrl}/${url}`;
}

function determineStockStatus(stockText: string): boolean {
  const outOfStockTerms = ['slut', 'ej tillgänglig', 'out of stock', 'slutsåld', 'ej i lager'];
  const lowerStockText = stockText.toLowerCase();
  
  return !outOfStockTerms.some(term => lowerStockText.includes(term));
}

function determineCategory(productName: string, searchTerm: string): string {
  const categoryKeywords = {
    'jiggar': ['jigg', 'jig', 'gummi'],
    'wobblers': ['wobbler', 'crankbait'],
    'spinnare': ['spinnare', 'spinner'],
    'beten': ['bete', 'drag'],
    'flugor': ['fluga', 'fly', 'nymf'],
    'pilkar': ['pilk', 'pilke'],
    'trolling': ['trolling', 'troll']
  };

  const name = productName.toLowerCase();
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => name.includes(keyword))) {
      return category;
    }
  }

  return searchTerm || 'övrigt';
}

function cleanProductName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/[^\w\såäö\-.,()]/gi, '')
    .trim();
}

function generateProductId(name: string, retailer: string): string {
  const cleanName = name.toLowerCase().replace(/[^\w]/g, '');
  const hash = Buffer.from(`${retailer}-${cleanName}`).toString('base64').slice(0, 8);
  return `${retailer.toLowerCase()}-${hash}`;
}

// Simulate real retailer data for demonstration
function getMockProducts(retailer: string, searchTerm: string): ScrapedProduct[] {
  // Comprehensive mock data based on search terms and retailers
  const mockDatabase: { [key: string]: { [key: string]: ScrapedProduct[] } } = {
    // ABBORRE BETEN
    abborre: {
      sportfiskeprylar: [
        {
          id: 'sf-abborre1',
          name: 'Abu Garcia Droppen 12g Guld',
          price: 89,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/abu-garcia-droppen-12g-guld?ref=makrillsverige',
          inStock: true,
          category: 'spinnare',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'sf-abborre2',
          name: 'Savage Gear 3D Goby Shad 12,5cm',
          price: 149,
          originalPrice: 179,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/savage-gear-3d-goby-shad?ref=makrillsverige',
          inStock: true,
          category: 'mjukbeten',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        }
      ],
      utklasad: [
        {
          id: 'ut-abborre1',
          name: 'Berkley Gulp! Alive Minnow 7cm',
          price: 69,
          currency: 'SEK',
          url: 'https://utklasad.se/berkley-gulp-alive-minnow?utm_source=makrillsverige',
          inStock: true,
          category: 'mjukbeten',
          retailer: 'Utklasad',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'ut-abborre2',
          name: 'Gunki G-Bump 15g Perch',
          price: 95,
          currency: 'SEK',
          url: 'https://utklasad.se/gunki-g-bump-15g-perch?utm_source=makrillsverige',
          inStock: true,
          category: 'jiggar',
          retailer: 'Utklasad',
          lastUpdated: new Date().toISOString()
        }
      ],
      fishsports: [
        {
          id: 'fs-abborre1',
          name: 'Westin ShadTeez 9cm Bling Perch',
          price: 29,
          currency: 'SEK',
          url: 'https://fishline.se/westin-shadteez-bling-perch?partner=makrillsverige',
          inStock: true,
          category: 'mjukbeten',
          retailer: 'Fishsports',
          lastUpdated: new Date().toISOString()
        }
      ]
    },
    
    // GÄDDA BETEN
    gädda: {
      sportfiskeprylar: [
        {
          id: 'sf-gadda1',
          name: 'Savage Gear 4Play Herring 13cm Pike',
          price: 189,
          originalPrice: 219,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/savage-gear-4play-herring-13cm?ref=makrillsverige',
          inStock: true,
          category: 'swimbaits',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'sf-gadda2',
          name: 'Abu Garcia Svartzonker McPike 18cm',
          price: 249,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/abu-garcia-svartzonker-mcpike?ref=makrillsverige',
          inStock: true,
          category: 'jerkbaits',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        }
      ],
      utklasad: [
        {
          id: 'ut-gadda1',
          name: 'Westin Pike Megabite 23cm Real Pike',
          price: 199,
          currency: 'SEK',
          url: 'https://utklasad.se/westin-pike-megabite-23cm?utm_source=makrillsverige',
          inStock: true,
          category: 'swimbaits',
          retailer: 'Utklasad',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'ut-gadda2',
          name: 'Strike Pro Buster Jerk 15cm Slow Sinking',
          price: 169,
          originalPrice: 199,
          currency: 'SEK',
          url: 'https://utklasad.se/strike-pro-buster-jerk?utm_source=makrillsverige',
          inStock: false,
          category: 'jerkbaits',
          retailer: 'Utklasad',
          lastUpdated: new Date().toISOString()
        }
      ]
    },
    
    // PIKE (same as gädda for English searches)
    pike: {
      sportfiskeprylar: [
        {
          id: 'sf-pike1',
          name: 'Savage Gear 4Play Herring 19cm Pike',
          price: 229,
          originalPrice: 259,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/savage-gear-4play-herring-19cm?ref=makrillsverige',
          inStock: true,
          category: 'swimbaits',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        }
      ]
    },
    
    // LAX BETEN
    lax: {
      sportfiskeprylar: [
        {
          id: 'sf-lax1',
          name: 'Hansen Flash 18g Silver/Blue',
          price: 79,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/hansen-flash-18g?ref=makrillsverige',
          inStock: true,
          category: 'trolling',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'sf-lax2',
          name: 'Rapala X-Rap 10cm Salmon',
          price: 139,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/rapala-x-rap-10cm?ref=makrillsverige',
          inStock: true,
          category: 'wobblers',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        }
      ],
      fishsports: [
        {
          id: 'fs-lax1',
          name: 'Vision Kust Flies - Salmon Selection',
          price: 199,
          currency: 'SEK',
          url: 'https://fishline.se/vision-kust-flies-salmon?partner=makrillsverige',
          inStock: true,
          category: 'flugor',
          retailer: 'Fishsports',
          lastUpdated: new Date().toISOString()
        }
      ]
    },
    
    // TORSK BETEN
    torsk: {
      sportfiskeprylar: [
        {
          id: 'sf-torsk1',
          name: 'Hansen Magic Pilk 150g Glow',
          price: 129,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/hansen-magic-pilk-150g?ref=makrillsverige',
          inStock: true,
          category: 'pilkar',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'sf-torsk2',
          name: 'Savage Gear 3D Herring Big Shad 25cm',
          price: 219,
          currency: 'SEK',
          url: 'https://www.sportfiskeprylar.se/savage-gear-herring-big-shad?ref=makrillsverige',
          inStock: true,
          category: 'havsfiske',
          retailer: 'Sportfiskeprylar',
          lastUpdated: new Date().toISOString()
        }
      ]
    }
  };
  
  // Find matching products based on search term
  const searchKey = searchTerm.toLowerCase();
  
  // Try direct match first
  if (mockDatabase[searchKey] && mockDatabase[searchKey][retailer]) {
    return mockDatabase[searchKey][retailer];
  }
  
  // Try partial matches
  for (const [key, retailers] of Object.entries(mockDatabase)) {
    if (key.includes(searchKey) || searchKey.includes(key)) {
      if (retailers[retailer]) {
        return retailers[retailer];
      }
    }
  }
  
  // Return empty array if no matches
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const { retailer, searchTerm, config } = await request.json();

    if (!retailer || !searchTerm || !config) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // For development, return mock data
    // In production, replace with: const products = await scrapeWebsite(config.baseUrl, config, searchTerm);
    const products = getMockProducts(retailer, searchTerm);

    return NextResponse.json(products);
  } catch (error) {
    console.error('Error in scrape-products API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 