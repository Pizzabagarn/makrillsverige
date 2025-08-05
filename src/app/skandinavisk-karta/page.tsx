'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowLeft, MapPin, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { searchUnifiedWaterBodies, UnifiedWaterBody } from '@/lib/unifiedWaterService';
// NEW: Import service with place names
import { searchWaterBodiesWithPlaces, WaterBodyWithPlaces } from '@/lib/waterBodiesWithPlacesService';

// FEATURE FLAG: Use new system with place names  
const USE_PLACES_SYSTEM = true;
// Keep compatibility
type SMHIWaterBody = UnifiedWaterBody;

// Dynamically import MapLibre GL map to avoid SSR issues
const ScandinavianWaterMapGL = dynamic(() => import('@/components/ScandinavianWaterMapGL'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
        <p className="text-cyan-300">Laddar vattenkarta...</p>
      </div>
    </div>
  )
});

export default function ScandinavianMapPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SMHIWaterBody[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
  
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const skipNextSearchRef = useRef(false);

  // Search water bodies with debouncing
  useEffect(() => {
    const searchWaterBodies = async () => {
      // Skip search if this was triggered by map click
      if (skipNextSearchRef.current) {
        skipNextSearchRef.current = false;
        return;
      }

      if (searchTerm.length < 2) {
        setSearchResults([]);
        setShowSuggestions(false);
        return;
      }

      setIsSearching(true);
      try {
        if (USE_PLACES_SYSTEM) {
          // NEW SYSTEM: Use water_bodies_with_places with disambiguation
          const results = await searchWaterBodiesWithPlaces(searchTerm, 8);
          // Convert to compatible format - CRITICAL: Add coordinates!
          const compatibleResults = results.map(wb => ({
            ...wb,
            name: wb.display_name || wb.name, // Use display_name if available!
            municipality: wb.municipality,
            country: wb.country,
            coordinates: [wb.lat || 60.0, wb.lon || 15.0] // CRITICAL: This is what focusOnWaterBody expects!
          }));
          setSearchResults(compatibleResults as any);
          setShowSuggestions(compatibleResults.length > 0);
        } else {
          // OLD SYSTEM: Use unified system
          const results = await searchUnifiedWaterBodies(searchTerm, 8);
          setSearchResults(results);
          setShowSuggestions(results.length > 0);
        }
        setSelectedResultIndex(-1);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchWaterBodies, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setSelectedResultIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || searchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedResultIndex(prev => 
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedResultIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedResultIndex >= 0) {
          selectWaterBody(searchResults[selectedResultIndex]);
        } else if (searchResults.length > 0) {
          selectWaterBody(searchResults[0]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedResultIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const selectWaterBody = (waterBody: SMHIWaterBody) => {
    // När användaren väljer från dropdown, förhindra inte nästa search
    setSearchTerm(waterBody.name);
    setShowSuggestions(false);
    setSelectedResultIndex(-1);
    
    // Notify map component to focus on this water body
    if (mapRef.current) {
      mapRef.current.focusOnWaterBody(waterBody);
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    setSearchResults([]);
    setShowSuggestions(false);
    setSelectedResultIndex(-1);
    inputRef.current?.focus();
  };

  const getCountryName = (country: string) => {
    const names = { 'SE': 'Sverige', 'NO': 'Norge', 'DK': 'Danmark' };
    return names[country as keyof typeof names] || country;
  };

  const getWaterTypeLabel = (type: string) => {
    const types = {
      'lake': 'Sjö',
      'river': 'Å/Flod', 
      'stream': 'Bäck',
      'reservoir': 'Reservoar',
      'canal': 'Kanal'
    };
    return types[type as keyof typeof types] || type;
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="relative z-20 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back button */}
            <Link
              href="/"
              className="flex items-center space-x-2 text-slate-300 hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform duration-200" />
              <span className="hidden sm:inline">Tillbaka</span>
            </Link>

            {/* Search */}
            <div className="flex-1 max-w-2xl mx-8" ref={searchRef}>
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => searchResults.length > 0 && setShowSuggestions(true)}
                    placeholder="Sök skandinaviska vattendrag..."
                    className="w-full pl-12 pr-12 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-200"
                  />
                  {searchTerm && (
                    <button
                      onClick={clearSearch}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                  {isSearching && (
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                      <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Search Suggestions */}
                {showSuggestions && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden z-50">
                    {searchResults.map((result, index) => (
                      <button
                        key={result.id}
                        onClick={() => selectWaterBody(result)}
                        className={`w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-b-0 ${
                          index === selectedResultIndex ? 'bg-slate-700' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <MapPin className="w-4 h-4 text-cyan-400" />
                            <div>
                              <div className="text-white font-medium">{result.name}</div>
                              <div className="text-slate-400 text-sm">
                                {getWaterTypeLabel(result.water_type)} • {getCountryName(result.country)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="text-right">
              <h1 className="text-xl font-bold text-white">Vattenkarta</h1>
              <p className="text-sm text-slate-400">🇸🇪 🇳🇴 🇩🇰</p>
            </div>
          </div>
        </div>
      </div>

      {/* Map Container - Full screen minus header */}
      <div className="h-[calc(100vh-4rem)]">
        <ScandinavianWaterMapGL 
          ref={mapRef}
          searchTerm={searchTerm}
          onWaterBodySelect={(waterBody) => {
            // Förhindra att nästa search triggas
            skipNextSearchRef.current = true;
            // Fyll i sökrutan med namnet och stäng förslag
            setSearchTerm(waterBody.name);
            setShowSuggestions(false);
          }}
        />
      </div>
    </div>
  );
}