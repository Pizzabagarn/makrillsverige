import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

interface ScrapedProductInfo {
  title: string;
  price?: number;
  originalPrice?: number;
  currency: string;
  image?: string;
  description?: string;
  inStock?: boolean;
  retailer: string;
  url: string;
  category?: string;
  brand?: string;
  lastUpdated: string;
}

interface MetaData {
  openGraph: { [key: string]: string };
  jsonLd: any[];
  htmlMeta: { [key: string]: string };
  title: string;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || !isValidProductUrl(url)) {
      return NextResponse.json(
        { error: 'Valid product URL required' },
        { status: 400 }
      );
    }

    // Fetch the product page
    const productInfo = await scrapeProductFromUrl(url);

    console.log('📦 Extracted product info:', productInfo);
    return NextResponse.json(productInfo);
  } catch (error) {
    console.error('Error scraping product:', error);
    return NextResponse.json(
      { error: 'Failed to scrape product information' },
      { status: 500 }
    );
  }
}

function isValidProductUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    
    // Lista över svenska fiskebutiker vi stödjer
    const supportedDomains = [
      'sportfiskeprylar.se',
      'utklasad.se', 
      'fishline.se',
      'eagle.fishing',
      'sportfiskedrag.se',
      'fiskeprylar.se'
    ];

    return supportedDomains.some(domain => 
      urlObj.hostname.includes(domain)
    );
  } catch {
    return false;
  }
}

async function scrapeProductFromUrl(url: string): Promise<ScrapedProductInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const metadata = extractMetadata(html);
    
    return parseProductInfo(metadata, url);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function extractMetadata(html: string): MetaData {
  const $ = cheerio.load(html);
  
  // Extract Open Graph data
  const openGraph: { [key: string]: string } = {};
  $('meta[property^="og:"]').each((_, element) => {
    const property = $(element).attr('property');
    const content = $(element).attr('content');
    if (property && content) {
      openGraph[property] = content;
    }
  });

  // Extract JSON-LD structured data
  const jsonLd: any[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const content = $(element).html();
      if (content) {
        const parsed = JSON.parse(content);
        jsonLd.push(parsed);
      }
    } catch (e) {
      // Ignore invalid JSON-LD
    }
  });

  // Extract standard HTML meta tags
  const htmlMeta: { [key: string]: string } = {};
  $('meta[name]').each((_, element) => {
    const name = $(element).attr('name');
    const content = $(element).attr('content');
    if (name && content) {
      htmlMeta[name] = content;
    }
  });

  // Extract title
  const title = $('title').text() || '';

  return { openGraph, jsonLd, htmlMeta, title };
}

function parseProductInfo(metadata: MetaData, url: string): ScrapedProductInfo {
  const urlObj = new URL(url);
  const retailer = getRetailerName(urlObj.hostname);

  // Start with basic info
  let productInfo: ScrapedProductInfo = {
    title: '',
    currency: 'SEK',
    retailer,
    url,
    lastUpdated: new Date().toISOString()
  };

  // Extract title (priority: og:title > title > product name from JSON-LD)
  productInfo.title = 
    metadata.openGraph['og:title'] || 
    metadata.title ||
    findInJsonLd(metadata.jsonLd, 'name') ||
    'Okänd produkt';

  // Clean title (remove site name, etc.)
  productInfo.title = cleanTitle(productInfo.title, retailer);

  // Extract price information
  const priceInfo = extractPriceInfo(metadata);
  if (priceInfo.price) productInfo.price = priceInfo.price;
  if (priceInfo.originalPrice) productInfo.originalPrice = priceInfo.originalPrice;
  if (priceInfo.currency) productInfo.currency = priceInfo.currency;

  // Extract image
  productInfo.image = 
    metadata.openGraph['og:image'] ||
    findInJsonLd(metadata.jsonLd, 'image');

  // Extract description
  productInfo.description = 
    metadata.openGraph['og:description'] ||
    metadata.htmlMeta['description'] ||
    findInJsonLd(metadata.jsonLd, 'description');

  // Extract stock status
  console.log('🔍 Debugging stock extraction:');
  let stockFound = false;
  
  for (const data of metadata.jsonLd) {
    if (data['@type'] === 'Product' && data.offers) {
      const offers = Array.isArray(data.offers) ? data.offers[0] : data.offers;
      console.log('Checking offers for stock:', offers);
      
      // Check availability directly
      if (offers.availability) {
        const availability = offers.availability.toLowerCase();
        console.log('Found availability:', availability);
        productInfo.inStock = availability.includes('instock');
        console.log('✅ Stock status:', productInfo.inStock ? 'In Stock' : 'Out of Stock');
        stockFound = true;
        break;
      }
      
      // Check AggregateOffer with individual offers
      if (offers['@type'] === 'AggregateOffer' && offers.offers) {
        const individualOffers = Array.isArray(offers.offers) ? offers.offers : [offers.offers];
        console.log('Checking individual offers:', individualOffers.length);
        
        // Check if any variant is in stock
        let hasInStock = false;
        for (const offer of individualOffers) {
          if (offer.availability) {
            const availability = offer.availability.toLowerCase();
            console.log('Individual offer availability:', availability);
            if (availability.includes('instock')) {
              hasInStock = true;
              break;
            }
          }
        }
        productInfo.inStock = hasInStock;
        console.log('✅ Stock status from variants:', hasInStock ? 'In Stock' : 'Out of Stock');
        stockFound = true;
        break;
      }
    }
  }
  
  if (!stockFound) {
    console.log('⚠️ No stock info found, checking fallback');
    const availability = findInJsonLd(metadata.jsonLd, 'availability');
    if (availability) {
      productInfo.inStock = availability.includes('InStock');
    }
  }

  // Extract brand
  productInfo.brand = findInJsonLd(metadata.jsonLd, 'brand');

  // Try to determine category from URL or title
  productInfo.category = inferCategory(url, productInfo.title);

  return productInfo;
}

function extractPriceInfo(metadata: MetaData): { price?: number; originalPrice?: number; currency?: string } {
  let price: number | undefined;
  let originalPrice: number | undefined;
  let currency = 'SEK';

  console.log('🔍 Debugging price extraction:');
  console.log('OpenGraph data:', metadata.openGraph);
  console.log('JSON-LD data:', metadata.jsonLd);

  // Try Open Graph price
  if (metadata.openGraph['og:price:amount']) {
    price = parseFloat(metadata.openGraph['og:price:amount']);
    currency = metadata.openGraph['og:price:currency'] || 'SEK';
    console.log('✅ Found OG price:', price, currency);
  }

  // Try JSON-LD structured data
  if (!price) {
    for (const data of metadata.jsonLd) {
      console.log('Checking JSON-LD item:', data);
      if (data['@type'] === 'Product' && data.offers) {
        const offers = Array.isArray(data.offers) ? data.offers[0] : data.offers;
        console.log('Found offers:', offers);
        if (offers.price || offers.lowPrice) {
          price = parseFloat(offers.price || offers.lowPrice);
          currency = offers.priceCurrency || 'SEK';
          console.log('✅ Found JSON-LD price:', price, currency);
        }
      }
    }
  }

  // Try alternative price extraction methods for Sportfiskeprylar
  if (!price) {
    // Look for common price patterns in the HTML meta or title
    const titlePrice = metadata.title.match(/(\d+)\s*kr/i);
    if (titlePrice) {
      price = parseInt(titlePrice[1]);
      console.log('✅ Found price in title:', price);
    }
  }

  return { price, originalPrice, currency };
}

function findInJsonLd(jsonLdArray: any[], field: string): string | undefined {
  for (const data of jsonLdArray) {
    if (data[field]) {
      if (typeof data[field] === 'string') {
        return data[field];
      } else if (data[field].name) {
        return data[field].name;
      }
    }
    
    // Check nested objects (like offers, brand, etc.)
    if (data['@type'] === 'Product') {
      if (field === 'brand' && data.brand) {
        return typeof data.brand === 'string' ? data.brand : data.brand.name;
      }
      if (field === 'image' && data.image) {
        return Array.isArray(data.image) ? data.image[0] : data.image;
      }
    }
  }
  return undefined;
}

function getRetailerName(hostname: string): string {
  if (hostname.includes('sportfiskeprylar')) return 'Sportfiskeprylar';
  if (hostname.includes('utklasad')) return 'Utklasad';
  if (hostname.includes('fishline') || hostname.includes('fishsports')) return 'Fishsports';
  if (hostname.includes('eagle.fishing')) return 'Eagle Fishing';
  if (hostname.includes('sportfiskedrag')) return 'Sportfiskedrag';
  return hostname;
}

function cleanTitle(title: string, retailer: string): string {
  // Remove common suffixes like " - Sportfiskeprylar" 
  const cleanedTitle = title
    .replace(new RegExp(` - ${retailer}`, 'gi'), '')
    .replace(/\s*\|\s*.*$/, '') // Remove everything after |
    .replace(/\s*-\s*.*$/, '') // Remove everything after -
    .trim();
  
  return cleanedTitle;
}

function inferCategory(url: string, title: string): string {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // Category mapping based on URL patterns and title keywords
  if (lowerUrl.includes('jiggar') || lowerTitle.includes('jigg')) return 'jiggar';
  if (lowerUrl.includes('spinnare') || lowerTitle.includes('spinnare')) return 'spinnare';
  if (lowerUrl.includes('wobbler') || lowerTitle.includes('wobbler')) return 'wobblers';
  if (lowerUrl.includes('jerkbait') || lowerTitle.includes('jerkbait')) return 'jerkbaits';
  if (lowerUrl.includes('swimbaits') || lowerTitle.includes('swimbait')) return 'swimbaits';
  if (lowerUrl.includes('pilk') || lowerTitle.includes('pilk')) return 'pilkar';
  if (lowerUrl.includes('drag') || lowerTitle.includes('drag')) return 'fiskedrag';
  
  return 'fiskedrag'; // default
} 