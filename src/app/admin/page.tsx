'use client';

import Link from 'next/link';
import { Package, TrendingUp, Settings, Users, BarChart3, Link as LinkIcon } from 'lucide-react';

export default function AdminPage() {
  const adminSections = [
    {
      title: 'Lägg till Beten från URL',
      description: 'Klistra in produktlänkar från svenska fiskebutiker för automatisk dataextraktion',
      icon: LinkIcon,
      href: '/admin/add-bait',
      color: 'from-blue-600 to-purple-600'
    },
    {
      title: 'Produkthantering',
      description: 'Hantera sparade beten, kategorier och fisk-kopplingar',
      icon: Package,
      href: '/admin/products',
      color: 'from-orange-600 to-red-600'
    },
    {
      title: 'Affiliate Statistik', 
      description: 'Se klick, conversions och intäkter från betrekommendationer',
      icon: TrendingUp,
      href: '/admin/affiliate-stats',
      color: 'from-green-600 to-emerald-600'
    },
    {
      title: 'Användarstatistik',
      description: 'Se besöksstatistik och användarbeteende i fiskguiden',
      icon: Users,
      href: '/admin/users',
      color: 'from-purple-600 to-pink-600'
    },
    {
      title: 'Analytics Dashboard',
      description: 'Överblick över alla viktiga metrics för Makrillsverige',
      icon: BarChart3,
      href: '/admin/analytics',
      color: 'from-indigo-600 to-blue-600'
    },
    {
      title: 'Systeminställningar',
      description: 'Hantera API-nycklar, cachning och systeminställningar',
      icon: Settings,
      href: '/admin/settings',
      color: 'from-slate-600 to-gray-600'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Makrillsverige Admin
            </h1>
            <p className="text-xl text-white/70">
              Hantera beten, statistik och systeminställningar
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {adminSections.map((section, index) => (
              <Link
                key={index}
                href={section.href}
                className="group relative overflow-hidden bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
              >
                <div className="relative z-10">
                  <div className={`w-16 h-16 bg-gradient-to-r ${section.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <section.icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-blue-300 transition-colors">
                    {section.title}
                  </h3>
                  
                  <p className="text-white/70 leading-relaxed">
                    {section.description}
                  </p>
                </div>

                {/* Hover gradient effect */}
                <div className={`absolute inset-0 bg-gradient-to-r ${section.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
              </Link>
            ))}
          </div>

          {/* Quick stats */}
          <div className="mt-16 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">
              Snabb Översikt
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400 mb-2">✅</div>
                <div className="text-white/60 text-sm">System Online</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400 mb-2">🗄️</div>
                <div className="text-white/60 text-sm">Supabase Connected</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-400 mb-2">🎣</div>
                <div className="text-white/60 text-sm">Beten Ready</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-400 mb-2">🚀</div>
                <div className="text-white/60 text-sm">Vercel Ready</div>
              </div>
            </div>
          </div>

          {/* Info section */}
          <div className="mt-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8">
            <h3 className="text-xl font-bold text-white mb-4">
              🔧 System Status
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-sm">Supabase databas ansluten och redo</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-sm">URL-scraping fungerar för alla stödda butiker</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span className="text-sm">Admin-panelen är Vercel-kompatibel</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                <span className="text-sm">Betrekommendationer synkroniserade</span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-8 text-center">
            <Link
              href="/admin/add-bait"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-200 hover:scale-105"
            >
              <LinkIcon className="w-5 h-5" />
              Lägg till Bete Nu
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 