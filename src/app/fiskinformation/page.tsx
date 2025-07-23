'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, ArrowLeft, Fish, Info, Zap, Thermometer, Droplets, 
  Globe, Calendar, Clock, Shield, TrendingUp, Navigation,
  Wind, Moon, Activity, MapPin, Eye, Scale, ShoppingCart,
  Star, ExternalLink, CheckCircle, XCircle, Package
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import RealBaitRetailerService from '@/lib/realBaitRetailer';

interface FishData {
  svenskt_namn: string;
  latinskt_namn: string;
  metoder: string[];
  vanlig_langd_cm: { min: number; max: number };
  vanlig_vikt_kg: { min: number; max: number };
  max_langd_cm: number;
  max_vikt_kg: number;
  djup_m: { min: number; max: number };
  temp_C: { min: number; max: number };
  salinitet_ppt: { min: number; max: number };
  tryckkanslighet: string;
  tidvatten_pref: string;
  strompreferens: string;
}

interface DetailedFishData {
  svenskt_namn: string;
  latinskt_namn: string;
  beskrivning: string;
  fysiska_egenskaper: string;
  vanlig_langd_vikt: string;
  max_langd_vikt: string;
  utbredning: string;
  habitat: string;
  djupintervall: string;
  miljobeteende: string;
  arstidsvariation: string;
  dygnsrytm: string;
  miljofaktorer_paverkan: string;
  lekperiod_vandring: string;
  skyddsstatus: string;
  fisketips: string;
  salthalt_preferens: string;
  lufttryck_paverkan: string;
  tidvatten_paverkan: string;
  strom_paverkan: string;
  manfas_paverkan: string;
  [key: string]: any;
}

interface BaitRecommendation {
  id: string;
  name: string;
  type: string;
  description: string;
  image: string;
  price_sek: number;
  retailers: {
    name: string;
    url: string;
    price: number;
    in_stock: boolean;
    affiliate_id: string;
  }[];
  techniques: string[];
  seasons: string[];
  water_types: string[];
  effectiveness_rating: number;
}

interface FishBaitData {
  fish_species: string;
  recommended_baits: BaitRecommendation[];
}

export default function FiskinformationPage() {
  const [fishData, setFishData] = useState<FishData[]>([]);
  const [detailedFishData, setDetailedFishData] = useState<DetailedFishData[]>([]);
  const [baitData, setBaitData] = useState<FishBaitData[]>([]);
  const [realBaitRecommendations, setRealBaitRecommendations] = useState<any[]>([]);
  const [isLoadingBaits, setIsLoadingBaits] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFish, setSelectedFish] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const router = useRouter();
  const baitService = useMemo(() => new RealBaitRetailerService(), []);

  useEffect(() => {
    const loadFishData = async () => {
      try {
        const [structuredResponse, detailedResponse, baitResponse] = await Promise.all([
          fetch('/data/structured_species.json'),
          fetch('/data/detailed_species.json'),
          fetch('/data/bait_recommendations.json')
        ]);
        
        const structuredData = await structuredResponse.json();
        const detailedData = await detailedResponse.json();
        const baitRecommendations = await baitResponse.json();
        
        setFishData(structuredData);
        setDetailedFishData(detailedData);
        setBaitData(baitRecommendations);
      } catch (error) {
        console.error('Error loading fish data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFishData();
  }, []);

  const filteredFish = useMemo(() => {
    if (!searchTerm) return fishData;
    return fishData.filter(fish => 
      fish.svenskt_namn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fish.latinskt_namn.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [fishData, searchTerm]);

  const selectedFishDetails = useMemo(() => {
    if (!selectedFish) return null;
    return detailedFishData.find(fish => fish.svenskt_namn === selectedFish);
  }, [selectedFish, detailedFishData]);

  const selectedFishBaits = useMemo(() => {
    if (!selectedFish) return [];
    const fishBaitData = baitData.find(data => data.fish_species === selectedFish);
    return fishBaitData?.recommended_baits || [];
  }, [selectedFish, baitData]);

  // Load real bait recommendations when fish is selected
  useEffect(() => {
    if (!selectedFish || activeTab !== 'fishing') return;
    
    const loadRealBaits = async () => {
      setIsLoadingBaits(true);
      setRealBaitRecommendations([]); // Clear previous data
      
      try {
        const recommendations = await baitService.getRecommendedBaitsForFish(selectedFish);
        
        if (recommendations && recommendations.length > 0) {
          setRealBaitRecommendations(recommendations);
        } else {
          console.warn(`No bait recommendations found for ${selectedFish}`);
          setRealBaitRecommendations([]);
        }
      } catch (error) {
        console.error('Error loading bait recommendations:', error);
        // Set empty array to show "no data" message instead of loading forever
        setRealBaitRecommendations([]);
      } finally {
        setIsLoadingBaits(false);
      }
    };

    // Add a small delay to make loading feel more natural
    const timeoutId = setTimeout(loadRealBaits, 300);
    
    return () => clearTimeout(timeoutId);
  }, [selectedFish, activeTab, baitService]);

  // Function to get fish image path
  const getFishImage = (fishName: string) => {
    // Convert fish name to filename format (lowercase, replace spaces with hyphens)
    const filename = fishName.toLowerCase()
      .replace(/å/g, 'a')
      .replace(/ä/g, 'a') 
      .replace(/ö/g, 'o')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    
    // Check for existing images first, then fallback to fish folder
    // Use version parameter for cache busting during development
    const isDev = process.env.NODE_ENV === 'development';
    const cacheParam = isDev ? `?v=2` : ''; // Increment this when you change images
    return `/images/${filename}.png${cacheParam}`;
  };

  // Function to get fish gradient colors based on habitat
  const getFishGradient = (fishName: string) => {
    const gradients = {
      'abborre': 'from-green-400/20 via-emerald-500/20 to-teal-600/20',
      'gädda': 'from-green-500/20 via-lime-500/20 to-green-700/20',
      'gös': 'from-blue-400/20 via-indigo-500/20 to-purple-600/20',
      'lax': 'from-orange-400/20 via-pink-500/20 to-red-500/20',
      'öring': 'from-amber-400/20 via-orange-500/20 to-red-600/20',
      'havsöring': 'from-cyan-400/20 via-blue-500/20 to-indigo-600/20',
      'regnbåge': 'from-purple-400/20 via-pink-500/20 to-red-500/20',
      'harr': 'from-slate-400/20 via-gray-500/20 to-slate-600/20',
      'röding': 'from-red-400/20 via-rose-500/20 to-pink-600/20',
      'sik': 'from-blue-300/20 via-slate-400/20 to-gray-500/20',
      'löja': 'from-silver/20 via-gray-300/20 to-slate-400/20',
      'ål': 'from-gray-600/20 via-slate-700/20 to-black/20',
      'lake': 'from-brown-400/20 via-amber-600/20 to-yellow-700/20',
      'torsk': 'from-gray-400/20 via-slate-500/20 to-gray-600/20',
      'kolja': 'from-gray-300/20 via-slate-400/20 to-gray-500/20',
      'sej': 'from-slate-500/20 via-gray-600/20 to-slate-700/20',
      'makrill': 'from-blue-500/20 via-teal-600/20 to-green-700/20',
      'sill': 'from-blue-300/20 via-silver/20 to-gray-400/20',
    };
    
    const key = fishName.toLowerCase() as keyof typeof gradients;
    return gradients[key] || 'from-blue-400/20 via-cyan-500/20 to-teal-600/20';
  };

  // Function to format text by replacing semicolons with line breaks and capitalizing
  const formatText = (text: string) => {
    if (!text) return text;
    
    return text
      .split(';')
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0)
      .map(sentence => {
        // Capitalize first letter
        return sentence.charAt(0).toUpperCase() + sentence.slice(1);
      })
      .map((sentence, index) => (
        <div key={index} className="mb-2 last:mb-0">
          {sentence}
        </div>
      ));
  };

  // Fish Image Component with fallback
  const FishImage = ({ fishName, className = "", showName = false }: { fishName: string, className?: string, showName?: boolean }) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const imagePath = getFishImage(fishName);
    const gradient = getFishGradient(fishName);

    if (imageError) {
      // Fallback to stylized fish icon with gradient
      return (
        <div className={`${className} bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center border border-white/10 backdrop-blur-sm`}>
          <div className="text-center">
            <Fish className="w-12 h-12 text-white/80 mx-auto mb-2" />
            {showName && (
              <p className="text-white/60 text-sm font-medium">{fishName}</p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={`${className} relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} border border-white/10`}>
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
        )}
        <Image
          src={imagePath}
          alt={fishName}
          fill
          className={`object-contain p-2 drop-shadow-lg transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          priority={fishName.toLowerCase() === 'abborre'}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        {showName && imageLoaded && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
            <p className="text-white text-sm font-medium">{fishName}</p>
          </div>
        )}
      </div>
    );
  };

  const getMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'spinnfiske':
        return '🎣';
      case 'flugfiske':
        return '🪰';
      case 'mete':
      case 'bottenmete':
      case 'ismete':
        return '⚓';
      case 'trolling':
        return '🚤';
      case 'pimpel':
        return '🎯';
      case 'jiggfiske':
      case 'pilkfiske':
        return '⚡';
      case 'häcklefiske':
      case 'häckla':
        return '🕷️';
      default:
        return '🎣';
    }
  };

  const getTempColor = (temp: { min: number; max: number }) => {
    const avgTemp = (temp.min + temp.max) / 2;
    if (avgTemp <= 8) return 'text-blue-400';
    if (avgTemp <= 16) return 'text-green-400';
    return 'text-orange-400';
  };

  const tabs = [
    { id: 'overview', label: 'Översikt', icon: Info },
    { id: 'physical', label: 'Utseende', icon: Eye },
    { id: 'behavior', label: 'Beteende', icon: Activity },
    { id: 'environment', label: 'Miljö', icon: Globe },
    { id: 'fishing', label: 'Fiske', icon: Fish },
    { id: 'protection', label: 'Skydd', icon: Shield }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></div>
          <p className="text-white/80 font-light">Laddar fiskinformation...</p>
        </div>
      </div>
    );
  }

  if (selectedFish && selectedFishDetails) {
    const structuredFish = fishData.find(f => f.svenskt_namn === selectedFish);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative">
        {/* Video Background */}
        <video
          className="fixed inset-0 w-full h-full object-cover z-0"
          style={{
            filter: 'brightness(0.15) contrast(1.2) saturate(0.6)',
          }}
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={(e) => {
            const video = e.target as HTMLVideoElement;
            video.playbackRate = 0.7;
          }}
        >
          <source src="/videos/calm-water.mp4" type="video/mp4" />
        </video>
        
        {/* Video Overlay for better readability */}
        <div className="fixed inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/70 z-0"></div>
        <div className="fixed inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-teal-900/20 z-0"></div>

        {/* Header */}
        <div className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-50 relative">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedFish(null)}
                  className="p-3 hover:bg-white/10 rounded-2xl transition-all duration-200 backdrop-blur-sm bg-black/20 border border-white/20"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div className="flex items-center gap-4">
                  {/* Fish Image in Header */}
                  <FishImage 
                    fishName={selectedFishDetails.svenskt_namn} 
                    className="w-16 h-16" 
                  />
                  <div>
                    <h1 className="text-2xl font-light text-white">{selectedFishDetails.svenskt_namn}</h1>
                    <p className="text-white/60 italic text-sm">{selectedFishDetails.latinskt_namn}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {structuredFish?.metoder.slice(0, 3).map((method) => (
                  <span
                    key={method}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white/90 rounded-full text-sm border border-white/20"
                  >
                    <span className="text-lg">{getMethodIcon(method)}</span>
                    {method}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative bg-gradient-to-r from-blue-600/20 via-blue-700/20 to-indigo-700/20 overflow-hidden">
          <div className="absolute inset-0 bg-black/40"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20"></div>
          
          <div className="relative max-w-7xl mx-auto px-6 py-16 z-10">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-center">
              {/* Large Fish Image */}
              <div className="lg:col-span-1">
                <FishImage 
                  fishName={selectedFishDetails.svenskt_namn} 
                  className="w-full h-80 lg:h-96" 
                />
              </div>
              
              <div className="lg:col-span-2">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white/90 text-sm font-medium mb-6">
                  <Fish className="w-4 h-4" />
                  Svenska fiskar
                </div>
                <h1 className="text-4xl lg:text-5xl font-light text-white mb-6 leading-tight tracking-tight">
                  {selectedFishDetails.svenskt_namn}
                </h1>
                <p className="text-2xl text-white/70 italic font-light mb-8">
                  {selectedFishDetails.latinskt_namn}
                </p>
                <div className="text-xl text-white/80 leading-relaxed max-w-2xl">
                  {formatText(selectedFishDetails.beskrivning)}
                </div>
              </div>
            </div>

            {/* Quick Stats Row */}
            {structuredFish && (
              <div className="mt-12">
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl">
                  <h3 className="text-white/90 font-light text-lg mb-6">Viktiga data</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                        <Scale className="w-8 h-8 text-blue-400" />
                      </div>
                      <p className="text-white/60 text-sm mb-1">Storlek</p>
                      <p className="text-white font-medium text-lg">
                        {structuredFish.vanlig_langd_cm.min}-{structuredFish.vanlig_langd_cm.max} cm
                      </p>
                      <p className="text-white/50 text-xs">Max: {structuredFish.max_langd_cm} cm</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-green-400/20 to-emerald-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                        <Droplets className="w-8 h-8 text-green-400" />
                      </div>
                      <p className="text-white/60 text-sm mb-1">Vikt</p>
                      <p className="text-white font-medium text-lg">
                        {structuredFish.vanlig_vikt_kg.min}-{structuredFish.vanlig_vikt_kg.max} kg
                      </p>
                      <p className="text-white/50 text-xs">Max: {structuredFish.max_vikt_kg} kg</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-orange-400/20 to-red-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                        <Thermometer className="w-8 h-8 text-orange-400" />
                      </div>
                      <p className="text-white/60 text-sm mb-1">Temperatur</p>
                      <p className="text-white font-medium text-lg">
                        {structuredFish.temp_C.min}-{structuredFish.temp_C.max}°C
                      </p>
                      <p className="text-white/50 text-xs">Optimal temp</p>
                    </div>
                    
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-2xl flex items-center justify-center mb-3 mx-auto">
                        <Navigation className="w-8 h-8 text-purple-400" />
                      </div>
                      <p className="text-white/60 text-sm mb-1">Djup</p>
                      <p className="text-white font-medium text-lg">
                        {structuredFish.djup_m.min}-{structuredFish.djup_m.max} m
                      </p>
                      <p className="text-white/50 text-xs">Vanligt djup</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-black/30 backdrop-blur-xl border-b border-white/10 sticky top-[73px] z-40 relative">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex space-x-1 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all duration-200 border-b-2 whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'text-blue-400 border-blue-400 bg-white/5'
                        : 'text-white/70 border-transparent hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-8">
                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-xl flex items-center justify-center">
                      <Info className="w-5 h-5 text-blue-400" />
                    </div>
                    Allmän beskrivning
                  </h3>
                  <div className="text-white/80 leading-relaxed text-lg">
                    {formatText(selectedFishDetails.beskrivning)}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-400/20 to-emerald-400/20 rounded-xl flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-green-400" />
                    </div>
                    Utbredning
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.utbredning)}
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-400/20 to-teal-400/20 rounded-xl flex items-center justify-center">
                      <Globe className="w-5 h-5 text-emerald-400" />
                    </div>
                    Habitat
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.habitat)}
                  </div>
                  <div className="mt-4 p-4 bg-white/5 rounded-xl">
                    <h4 className="font-medium text-white/90 mb-2">Djupintervall</h4>
                    <div className="text-white/70 text-sm">{formatText(selectedFishDetails.djupintervall)}</div>
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-xl flex items-center justify-center">
                      <Scale className="w-5 h-5 text-purple-400" />
                    </div>
                    Storlek & vikt
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium text-white/90 mb-1">Vanlig storlek</h4>
                      <div className="text-white/70">{formatText(selectedFishDetails.vanlig_langd_vikt)}</div>
                    </div>
                    <div>
                      <h4 className="font-medium text-white/90 mb-1">Maximal storlek</h4>
                      <div className="text-white/70">{formatText(selectedFishDetails.max_langd_vikt)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'physical' && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                <h3 className="text-2xl font-light text-white mb-6 flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-400/20 to-purple-400/20 rounded-xl flex items-center justify-center">
                    <Eye className="w-6 h-6 text-indigo-400" />
                  </div>
                  Fysiska egenskaper
                </h3>
                <div className="prose prose-invert max-w-none">
                  <div className="text-lg text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.fysiska_egenskaper)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'behavior' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-8">
                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-400/20 to-red-400/20 rounded-xl flex items-center justify-center">
                      <Activity className="w-5 h-5 text-orange-400" />
                    </div>
                    Miljöbeteende
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.miljobeteende)}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-xl flex items-center justify-center">
                      <Clock className="w-5 h-5 text-blue-400" />
                    </div>
                    Dygnsrytm
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.dygnsrytm)}
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-400/20 to-emerald-400/20 rounded-xl flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-green-400" />
                    </div>
                    Årstidsvariation
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.arstidsvariation)}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-pink-400/20 to-rose-400/20 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                    Lekperiod & vandring
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.lekperiod_vandring)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'environment' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-8">
                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-400/20 to-blue-400/20 rounded-xl flex items-center justify-center">
                      <Thermometer className="w-5 h-5 text-cyan-400" />
                    </div>
                    Miljöfaktorer
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.miljofaktorer_paverkan)}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-xl flex items-center justify-center">
                      <Droplets className="w-5 h-5 text-blue-400" />
                    </div>
                    Salthaltspreferens
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.salthalt_preferens)}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-400/20 to-purple-400/20 rounded-xl flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-indigo-400" />
                    </div>
                    Lufttryckspåverkan
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.lufttryck_paverkan)}
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-teal-400/20 to-cyan-400/20 rounded-xl flex items-center justify-center">
                      <Navigation className="w-5 h-5 text-teal-400" />
                    </div>
                    Tidvattenpåverkan
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.tidvatten_paverkan)}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-400/20 to-green-400/20 rounded-xl flex items-center justify-center">
                      <Wind className="w-5 h-5 text-emerald-400" />
                    </div>
                    Strömpåverkan
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.strom_paverkan)}
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                  <h3 className="text-xl font-light text-white mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-xl flex items-center justify-center">
                      <Moon className="w-5 h-5 text-purple-400" />
                    </div>
                    Månfaspåverkan
                  </h3>
                  <div className="text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.manfas_paverkan)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fishing' && (
            <div className="space-y-8">
              {/* Fisketips sektion */}
              <div className="max-w-4xl mx-auto">
                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm rounded-3xl border border-green-400/20 p-8">
                  <h3 className="text-2xl font-light text-white mb-6 flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-400/30 to-emerald-400/30 rounded-xl flex items-center justify-center">
                      <Fish className="w-6 h-6 text-green-400" />
                    </div>
                    Fisketips & tekniker
                  </h3>
                  <div className="prose prose-invert max-w-none">
                    <div className="text-lg text-white/90 leading-relaxed">
                      {formatText(selectedFishDetails.fisketips)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rekommenderade beten sektion */}
              <div className="max-w-7xl mx-auto">
                <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-sm rounded-3xl border border-blue-400/20 p-8">
                  <h3 className="text-2xl font-light text-white mb-6 flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-xl flex items-center justify-center">
                      <ShoppingCart className="w-6 h-6 text-blue-400" />
                    </div>
                    Rekommenderade beten från svenska butiker
                  </h3>
                  
                  {isLoadingBaits ? (
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <h4 className="text-lg font-medium text-white mb-2">
                        Söker beten för {selectedFishDetails?.svenskt_namn}...
                      </h4>
                      <p className="text-white/60 mb-3">
                        Hämtar aktuella priser och lagerstatus från svenska fiskebutiker
                      </p>
                      <div className="text-sm text-white/50">
                        <div className="flex justify-center items-center gap-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <span>Sportfiskeprylar</span>
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse animation-delay-200"></div>
                          <span>Utklasad</span>
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse animation-delay-400"></div>
                          <span>Fishsports</span>
                        </div>
                      </div>
                    </div>
                  ) : realBaitRecommendations.length > 0 ? (
                    <div className="space-y-6">
                      {/* Visa beten per kategori - data kommer redan grupperad */}
                      {realBaitRecommendations.map((recommendation, idx) => (
                        <div key={idx} className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xl font-semibold text-white flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-lg flex items-center justify-center">
                                <Package className="w-4 h-4 text-blue-400" />
                              </div>
                              {recommendation.baitType}
                            </h4>
                            <div className="flex items-center gap-2">
                              <span className="text-white/40 text-sm">
                                {recommendation.products.length} produkter
                              </span>
                            </div>
                          </div>

                          {/* Kategoribeskrivning om den finns */}
                          {recommendation.categoryDescription && (
                            <div className="mb-4 p-3 bg-white/5 rounded-lg border-l-2 border-blue-400/50">
                              <p className="text-white/80 text-sm leading-relaxed">
                                {recommendation.categoryDescription}
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {recommendation.products.map((product: any, index: number) => (
                              <div
                                key={`${product.id || product.url}-${index}`}
                                className="group bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
                              >
                                {/* Produktbild */}
                                <div className="relative h-32 bg-gradient-to-br from-white/10 to-white/5">
                                  {product.image ? (
                                    <img
                                      src={product.image}
                                      alt={product.name || product.title}
                                      className="w-full h-full object-contain p-2"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const fallback = target.nextElementSibling as HTMLElement;
                                        if (fallback) fallback.style.display = 'flex';
                                      }}
                                    />
                                  ) : null}
                                  
                                  {/* Fallback ikon */}
                                  <div className={`absolute inset-0 flex items-center justify-center ${product.image ? 'hidden' : 'flex'}`}>
                                    <Package className="w-8 h-8 text-white/40" />
                                  </div>

                                  {/* Stjärnbetyg i hörnet */}
                                  <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1">
                                    <div className="flex items-center gap-1">
                                      <div className="flex text-yellow-400">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <svg
                                            key={star}
                                            className={`w-3 h-3 ${
                                              star <= (product.effectiveness || 5) 
                                                ? 'fill-current text-yellow-400' 
                                                : 'fill-current text-gray-600'
                                            }`}
                                            viewBox="0 0 20 20"
                                          >
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                          </svg>
                                        ))}
                                      </div>
                                      <span className="text-white text-xs font-medium ml-1">
                                        {product.effectiveness || 5}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Lagerstatus */}
                                  <div className="absolute top-2 left-2">
                                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      product.inStock !== false
                                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                    }`}>
                                      {product.inStock !== false ? '✓ I lager' : '✗ Slut'}
                                    </div>
                                  </div>
                                </div>

                                {/* Produktinfo */}
                                <div className="p-4">
                                  <h5 className="font-semibold text-white text-sm mb-2 line-clamp-2 group-hover:text-blue-300 transition-colors">
                                    {product.name || product.title}
                                  </h5>

                                  {/* Produktbeskrivning om den finns */}
                                  {product.description && (
                                    <p className="text-white/60 text-xs mb-2 leading-relaxed line-clamp-2">
                                      {product.description}
                                    </p>
                                  )}
                                  
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg font-bold text-green-400">
                                        {product.price ? `${product.price} ${product.currency || 'kr'}` : 'Pris ej tillgänglig'}
                                      </span>
                                      {product.originalPrice && product.price && product.originalPrice > product.price && (
                                        <span className="text-sm text-white/50 line-through">
                                          {product.originalPrice} {product.currency || 'kr'}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded-full">
                                      {product.retailer}
                                    </span>
                                    {product.brand && (
                                      <span className="text-xs text-white/60">
                                        {product.brand}
                                      </span>
                                    )}
                                  </div>

                                  {/* Tekniker och säsong från recommendation-objektet */}
                                  <div className="mb-3 space-y-2">
                                    {recommendation.technique && recommendation.technique.length > 0 && (
                                      <div>
                                        <p className="text-xs text-white/50 mb-1">Tekniker:</p>
                                        <div className="flex flex-wrap gap-1">
                                          {recommendation.technique.slice(0, 2).map((technique: string, idx: number) => (
                                            <span key={idx} className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full">
                                              {technique}
                                            </span>
                                          ))}
                                          {recommendation.technique.length > 2 && (
                                            <span className="text-xs bg-white/10 text-white/50 px-2 py-1 rounded-full">
                                              +{recommendation.technique.length - 2}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {recommendation.season && recommendation.season.length > 0 && (
                                      <div>
                                        <p className="text-xs text-white/50 mb-1">Säsonger:</p>
                                        <div className="flex flex-wrap gap-1">
                                          {recommendation.season.map((season: string, sidx: number) => (
                                            <span key={sidx} className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">
                                              {season}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-600/80 to-purple-600/80 hover:from-blue-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      
                                      // Track affiliate click
                                      try {
                                        await baitService.trackAffiliateClick(
                                          product.id, 
                                          product.retailer, 
                                          selectedFish || ''
                                        );
                                      } catch (error) {
                                        console.error('Affiliate tracking failed:', error);
                                      }
                                      
                                      // FIXAT: Öppna i ny flik utan att påverka nuvarande sida
                                      window.open(product.url, '_blank', 'noopener,noreferrer');
                                    }}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    Köp hos {product.retailer}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 text-center">
                      <Package className="w-12 h-12 text-white/40 mx-auto mb-4" />
                      <h4 className="text-lg font-medium text-white mb-2">
                        Inga beten hittades för {selectedFishDetails?.svenskt_namn}
                      </h4>
                      <p className="text-white/60 mb-4">
                        Inga beten har lagts till för denna fiskart ännu.
                        Använd admin-panelen för att lägga till rekommenderade beten.
                      </p>
                      <div className="text-sm text-white/50">
                        <p>🔧 Lägg till beten via:</p>
                        <div className="mt-2">
                          <a 
                            href="/admin/add-bait" 
                            target="_blank"
                            className="text-blue-400 hover:text-blue-300 underline"
                          >
                            Admin-panelen → Lägg till beten
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Disclaimer */}
                  <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/60 text-sm text-center">
                      💡 <strong>Tips:</strong> Priserna uppdateras regelbundet men kan variera. Vi får en liten provision vid köp via våra länkar, vilket hjälper oss att hålla sajten kostnadsfri.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'protection' && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
                <h3 className="text-2xl font-light text-white mb-6 flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-400/20 to-orange-400/20 rounded-xl flex items-center justify-center">
                    <Shield className="w-6 h-6 text-amber-400" />
                  </div>
                  Skyddsstatus & regler
                </h3>
                <div className="prose prose-invert max-w-none">
                  <div className="text-lg text-white/80 leading-relaxed">
                    {formatText(selectedFishDetails.skyddsstatus)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative">
      {/* Video Background */}
      <video
        className="fixed inset-0 w-full h-full object-cover z-0"
        style={{
          filter: 'brightness(0.15) contrast(1.2) saturate(0.6)',
        }}
        autoPlay
        muted
        loop
        playsInline
        onLoadedData={(e) => {
          const video = e.target as HTMLVideoElement;
          video.playbackRate = 0.5;
        }}
      >
        <source src="/videos/calm-water.mp4" type="video/mp4" />
      </video>
      
      {/* Video Overlay for better readability */}
      <div className="fixed inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/70 z-0"></div>
      <div className="fixed inset-0 bg-gradient-to-r from-blue-900/20 via-transparent to-teal-900/20 z-0"></div>
      
      {/* Header */}
      <div className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </Link>
              <div>
                <h1 className="text-3xl font-light text-white">Fiskguide</h1>
                <p className="text-white/60 font-light">Komplett guide för svenska fiskar</p>
              </div>
            </div>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="text"
                placeholder="Sök efter fisk..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-6 py-3 bg-white/10 backdrop-blur-sm text-white placeholder-white/40 rounded-2xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent w-80"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6 pb-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFish.map((fish) => (
            <div
              key={fish.svenskt_namn}
              onClick={() => setSelectedFish(fish.svenskt_namn)}
              className="group bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 overflow-hidden hover:bg-white/10 transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/10"
            >
              {/* Fish Image */}
              <div className="relative">
                <FishImage 
                  fishName={fish.svenskt_namn} 
                  className="w-full h-48" 
                />
                <div className="absolute top-4 right-4">
                  <div className="bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
                    <span className={`text-sm font-medium ${getTempColor(fish.temp_C)}`}>
                      {fish.temp_C.min}-{fish.temp_C.max}°C
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {/* Fish name */}
                <div className="mb-4">
                  <h3 className="text-xl font-semibold text-white group-hover:text-blue-300 transition-colors">
                    {fish.svenskt_namn}
                  </h3>
                  <p className="text-white/60 italic text-sm">{fish.latinskt_namn}</p>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      <span className="text-white/80 text-sm">Längd</span>
                    </div>
                    <p className="text-white font-medium">
                      {fish.vanlig_langd_cm.min}-{fish.vanlig_langd_cm.max} cm
                    </p>
                  </div>
                  
                  <div className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Droplets className="w-4 h-4 text-blue-400" />
                      <span className="text-white/80 text-sm">Vikt</span>
                    </div>
                    <p className="text-white font-medium">
                      {fish.vanlig_vikt_kg.min}-{fish.vanlig_vikt_kg.max} kg
                    </p>
                  </div>
                </div>

                {/* Fishing methods */}
                <div>
                  <p className="text-white/60 text-sm mb-2">Fiskemetoder</p>
                  <div className="flex flex-wrap gap-2">
                    {fish.metoder.slice(0, 3).map((method) => (
                      <span
                        key={method}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm"
                      >
                        <span>{getMethodIcon(method)}</span>
                        {method}
                      </span>
                    ))}
                    {fish.metoder.length > 3 && (
                      <span className="px-3 py-1 bg-white/10 text-white/60 rounded-full text-sm">
                        +{fish.metoder.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredFish.length === 0 && (
          <div className="text-center py-16">
            <Fish className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 text-lg">Inga fiskar hittades för "{searchTerm}"</p>
            <p className="text-white/40 text-sm mt-2">Prova att söka på ett annat namn</p>
          </div>
        )}
      </div>
    </div>
  );
} 