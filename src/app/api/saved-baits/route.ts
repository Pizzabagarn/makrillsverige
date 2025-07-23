import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface SavedBait {
  id: string;
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
  fishSpecies?: string[];
  effectiveness?: number;
  techniques?: string[];
  seasons?: string[];
}

// GET - Hämta alla sparade beten eller filtrera per fiskart
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const fishSpecies = url.searchParams.get('fishSpecies');
    
    let query = supabase
      .from('saved_baits')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (fishSpecies) {
      // Filtrera beten för specifik fiskart
      query = query.contains('fish_species', [fishSpecies]);
    }
    
    const { data: baits, error } = await query;
    
    if (error) {
      console.error('Supabase error loading baits:', error);
      return NextResponse.json(
        { error: 'Failed to load saved baits' },
        { status: 500 }
      );
    }
    
    // Konvertera från Supabase format till frontend format
    const formattedBaits = baits?.map(bait => ({
      id: bait.id,
      title: bait.title,
      price: bait.price,
      originalPrice: bait.original_price,
      currency: bait.currency,
      image: bait.image,
      description: bait.description,
      inStock: bait.in_stock,
      retailer: bait.retailer,
      url: bait.url,
      category: bait.category,
      brand: bait.brand,
      effectiveness: bait.effectiveness,
      fishSpecies: bait.fish_species,
      techniques: bait.techniques,
      seasons: bait.seasons,
      lastUpdated: bait.updated_at
    })) || [];
    
    return NextResponse.json(formattedBaits);
  } catch (error) {
    console.error('Error loading saved baits:', error);
    return NextResponse.json(
      { error: 'Failed to load saved baits' },
      { status: 500 }
    );
  }
}

// POST - Spara nytt bete
export async function POST(request: NextRequest) {
  try {
    const newBait: SavedBait = await request.json();
    
    // Konvertera till Supabase format
    const supabaseBait = {
      title: newBait.title,
      price: newBait.price,
      original_price: newBait.originalPrice,
      currency: newBait.currency || 'SEK',
      image: newBait.image,
      description: newBait.description,
      in_stock: newBait.inStock ?? true,
      retailer: newBait.retailer,
      url: newBait.url,
      category: newBait.category,
      brand: newBait.brand,
      effectiveness: newBait.effectiveness || 5,
      fish_species: newBait.fishSpecies || [],
      techniques: newBait.techniques || [],
      seasons: newBait.seasons || []
    };
    
    // Försök uppdatera befintligt bete först (baserat på URL)
    const { data: existingBait, error: checkError } = await supabase
      .from('saved_baits')
      .select('id')
      .eq('url', newBait.url)
      .single();
    
    let result;
    
    if (existingBait && !checkError) {
      // Uppdatera befintligt bete
      const { data, error } = await supabase
        .from('saved_baits')
        .update(supabaseBait)
        .eq('id', existingBait.id)
        .select()
        .single();
      
      result = { data, error };
      console.log(`✅ Bete uppdaterat: ${newBait.title}`);
    } else {
      // Skapa nytt bete
      const { data, error } = await supabase
        .from('saved_baits')
        .insert([supabaseBait])
        .select()
        .single();
      
      result = { data, error };
      console.log(`✅ Nytt bete sparat: ${newBait.title}`);
    }
    
    if (result.error) {
      console.error('Supabase error saving bait:', result.error);
      return NextResponse.json(
        { error: 'Failed to save bait' },
        { status: 500 }
      );
    }
    
    console.log(`✅ Bete sparat för fiskarter: ${newBait.fishSpecies?.join(', ')}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Bete sparat framgångsrikt',
      bait: result.data
    });
    
  } catch (error) {
    console.error('Error saving bait:', error);
    return NextResponse.json(
      { error: 'Failed to save bait' },
      { status: 500 }
    );
  }
}

// DELETE - Ta bort bete
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const baitId = url.searchParams.get('id');
    
    if (!baitId) {
      return NextResponse.json(
        { error: 'Bait ID required' },
        { status: 400 }
      );
    }
    
    const { error } = await supabase
      .from('saved_baits')
      .delete()
      .eq('id', baitId);
    
    if (error) {
      console.error('Supabase error deleting bait:', error);
      return NextResponse.json(
        { error: 'Failed to delete bait' },
        { status: 500 }
      );
    }
    
    console.log(`✅ Bete borttaget: ${baitId}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Bete borttaget framgångsrikt'
    });
    
  } catch (error) {
    console.error('Error deleting bait:', error);
    return NextResponse.json(
      { error: 'Failed to delete bait' },
      { status: 500 }
    );
  }
} 