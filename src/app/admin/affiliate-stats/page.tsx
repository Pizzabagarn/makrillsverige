'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, MousePointer, Users, ShoppingBag, Clock } from 'lucide-react';

interface AffiliateStats {
  total_clicks: number;
  unique_affiliates: number;
  clicks_today: number;
  top_retailers: { retailer: string; clicks: number; }[];
  recent_clicks: {
    affiliate_id: string;
    bait_id: string;
    fish_species: string;
    retailer: string;
    timestamp: string;
  }[];
}

export default function AffiliateStatsPage() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/affiliate-tracking');
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('sv-SE');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></div>
          <p className="text-white/80 font-light">Laddar statistik...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">Fel: {error}</p>
          <button 
            onClick={loadStats}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Försök igen
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </Link>
            <div>
              <h1 className="text-3xl font-light text-white">Affiliate Statistik</h1>
              <p className="text-white/60 font-light">Spårning av betrekommendationer och klick</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Statistikkort */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm rounded-2xl border border-blue-400/20 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center">
                <MousePointer className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Totala Klick</h3>
                <p className="text-blue-300 text-2xl font-bold">{stats.total_clicks.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl border border-green-400/20 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-500/30 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Unika Affiliates</h3>
                <p className="text-green-300 text-2xl font-bold">{stats.unique_affiliates}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500/20 to-red-500/20 backdrop-blur-sm rounded-2xl border border-orange-400/20 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-orange-500/30 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Klick Idag</h3>
                <p className="text-orange-300 text-2xl font-bold">{stats.clicks_today}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-sm rounded-2xl border border-purple-400/20 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-purple-500/30 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">Konverteringsränta</h3>
                <p className="text-purple-300 text-2xl font-bold">~2.3%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Topp återförsäljare */}
          <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
            <h2 className="text-2xl font-light text-white mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-xl flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-blue-400" />
              </div>
              Topp Återförsäljare
            </h2>
            
            <div className="space-y-4">
              {stats.top_retailers.map((retailer, index) => (
                <div key={retailer.retailer} className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-400 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                      {index + 1}
                    </div>
                    <span className="text-white font-medium">{retailer.retailer}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-300 font-bold">{retailer.clicks}</p>
                    <p className="text-white/60 text-sm">klick</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Senaste klick */}
          <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-8">
            <h2 className="text-2xl font-light text-white mb-6 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-400/20 to-emerald-400/20 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-green-400" />
              </div>
              Senaste Klick
            </h2>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {stats.recent_clicks.map((click, index) => (
                <div key={index} className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-blue-300 font-medium">{click.fish_species}</span>
                    <span className="text-white/60 text-sm">{formatTimestamp(click.timestamp)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/80">{click.retailer}</span>
                    <span className="text-white/60 font-mono">{click.affiliate_id}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Refresh knapp */}
        <div className="mt-8 text-center">
          <button
            onClick={loadStats}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl transition-all duration-200 hover:scale-105"
          >
            Uppdatera Statistik
          </button>
        </div>
      </div>
    </div>
  );
} 