import { NextRequest, NextResponse } from 'next/server';

interface AffiliateClick {
  affiliate_id: string;
  bait_id: string;
  fish_species: string;
  retailer: string;
  timestamp: string;
  user_agent?: string;
  ip_address?: string;
  referrer?: string;
}

// I produktion skulle detta sparas till en databas
let affiliateClicks: AffiliateClick[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { affiliate_id, bait_id, fish_species, retailer } = body;

    if (!affiliate_id || !bait_id || !fish_species || !retailer) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Logga klicket
    const clickData: AffiliateClick = {
      affiliate_id,
      bait_id,
      fish_species,
      retailer,
      timestamp: new Date().toISOString(),
      user_agent: request.headers.get('user-agent') || undefined,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      referrer: request.headers.get('referer') || undefined,
    };

    affiliateClicks.push(clickData);

    // I produktion: spara till databas
    // await saveAffiliateClick(clickData);

    // Logga för utveckling (ta bort i produktion)
    console.log('Affiliate click tracked:', clickData);

    return NextResponse.json({ 
      success: true, 
      message: 'Click tracked successfully',
      click_id: `${affiliate_id}_${Date.now()}`
    });

  } catch (error) {
    console.error('Error tracking affiliate click:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const affiliate_id = url.searchParams.get('affiliate_id');
    
    // Returnera statistik för en specifik affiliate ID
    if (affiliate_id) {
      const affiliateStats = affiliateClicks.filter(
        click => click.affiliate_id === affiliate_id
      );
      
      return NextResponse.json({
        affiliate_id,
        total_clicks: affiliateStats.length,
        clicks: affiliateStats.slice(-50), // Senaste 50 klicken
        top_baits: getTopBaits(affiliateStats),
        top_fish: getTopFish(affiliateStats)
      });
    }

    // Returnera övergripande statistik
    return NextResponse.json({
      total_clicks: affiliateClicks.length,
      unique_affiliates: [...new Set(affiliateClicks.map(c => c.affiliate_id))].length,
      clicks_today: affiliateClicks.filter(
        click => new Date(click.timestamp).toDateString() === new Date().toDateString()
      ).length,
      top_retailers: getTopRetailers(affiliateClicks),
      recent_clicks: affiliateClicks.slice(-20)
    });

  } catch (error) {
    console.error('Error fetching affiliate stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getTopBaits(clicks: AffiliateClick[]) {
  const baitCounts = clicks.reduce((acc, click) => {
    acc[click.bait_id] = (acc[click.bait_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(baitCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([bait_id, count]) => ({ bait_id, clicks: count }));
}

function getTopFish(clicks: AffiliateClick[]) {
  const fishCounts = clicks.reduce((acc, click) => {
    acc[click.fish_species] = (acc[click.fish_species] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(fishCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([fish_species, count]) => ({ fish_species, clicks: count }));
}

function getTopRetailers(clicks: AffiliateClick[]) {
  const retailerCounts = clicks.reduce((acc, click) => {
    acc[click.retailer] = (acc[click.retailer] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(retailerCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([retailer, count]) => ({ retailer, clicks: count }));
} 