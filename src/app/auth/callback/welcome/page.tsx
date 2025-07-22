'use client';

import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useRouter } from 'next/navigation'
import { Check, Star, Crown, ArrowRight, X } from 'lucide-react'

export default function WelcomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState('pro')

  // Redirect if not logged in after loading
  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="text-white">Laddar...</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen relative">
      {/* Bakgrundsbild med overlay */}
      <div className="absolute inset-0 bg-[url('/images/makrill-bg.jpg')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 bg-black/60" />
      
      {/* Header */}
      <div className="relative z-10 w-full">
        <div className="flex justify-between items-center p-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
            </div>
            <span className="text-white text-xl font-bold">Makrill Sverige</span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors duration-200"
            aria-label="Gå till kartan"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        
        {/* Welcome Section */}
        <div className="text-center mb-16">
          <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4">
            Välkommen till Makrill Sverige!
          </h1>
          <p className="text-xl text-white/90 mb-2">
            Ditt konto har verifierats framgångsrikt
          </p>
          <p className="text-white/70">
            Välj en plan för att börja använda alla våra premium-funktioner
          </p>
        </div>

        {/* Pricing Plans */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          
          {/* Basic Plan */}
          <div className={`bg-white/10 backdrop-blur-xl border rounded-2xl p-8 transition-all duration-200 ${
            selectedPlan === 'basic' ? 'border-blue-400 bg-white/20 scale-105' : 'border-white/20'
          }`}>
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Basic</h3>
              <div className="text-3xl font-bold text-white mb-1">Gratis</div>
              <p className="text-white/70 text-sm mb-6">Alltid gratis</p>
              
              <button
                onClick={() => setSelectedPlan('basic')}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
                  selectedPlan === 'basic'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {selectedPlan === 'basic' ? 'Vald' : 'Välj Basic'}
              </button>
            </div>
            
            <div className="mt-8 space-y-4">
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Grundläggande kartvy</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Aktuella havstemperaturer</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Begränsad historisk data</span>
              </div>
            </div>
          </div>

          {/* Pro Plan */}
          <div className={`bg-white/10 backdrop-blur-xl border rounded-2xl p-8 transition-all duration-200 relative ${
            selectedPlan === 'pro' ? 'border-blue-400 bg-white/20 scale-105' : 'border-white/20'
          }`}>
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <div className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                Populärast
              </div>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
              <div className="text-3xl font-bold text-white mb-1">199 kr</div>
              <p className="text-white/70 text-sm mb-6">per månad</p>
              
              <button
                onClick={() => setSelectedPlan('pro')}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
                  selectedPlan === 'pro'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {selectedPlan === 'pro' ? 'Vald' : 'Välj Pro'}
              </button>
            </div>
            
            <div className="mt-8 space-y-4">
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Alla Basic-funktioner</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">AI-driven makrillprognos</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Realtidsdata för strömmar</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Historisk data (12 månader)</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Personliga fiskerapporter</span>
              </div>
            </div>
          </div>

          {/* Premium Plan */}
          <div className={`bg-white/10 backdrop-blur-xl border rounded-2xl p-8 transition-all duration-200 ${
            selectedPlan === 'premium' ? 'border-yellow-400 bg-white/20 scale-105' : 'border-white/20'
          }`}>
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Premium</h3>
              <div className="text-3xl font-bold text-white mb-1">399 kr</div>
              <p className="text-white/70 text-sm mb-6">per månad</p>
              
              <button
                onClick={() => setSelectedPlan('premium')}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
                  selectedPlan === 'premium'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {selectedPlan === 'premium' ? 'Vald' : 'Välj Premium'}
              </button>
            </div>
            
            <div className="mt-8 space-y-4">
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Alla Pro-funktioner</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Avancerade prognosmodeller</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Obegränsad historisk data</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">API-tillgång för utvecklare</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Prioriterad support</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-white/90">Exklusiva fisketips</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="text-center space-y-4">
          <button
            onClick={() => {
              // Här skulle man normalt integrera med betalningssystem
              console.log('Selected plan:', selectedPlan)
              router.push('/')
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-8 rounded-lg transition-colors duration-200 inline-flex items-center space-x-2"
          >
            <span>
              {selectedPlan === 'basic' ? 'Fortsätt med Basic' : `Starta ${selectedPlan === 'pro' ? 'Pro' : 'Premium'}-prenumeration`}
            </span>
            <ArrowRight className="w-5 h-5" />
          </button>
          
          <div>
            <button
              onClick={() => router.push('/')}
              className="text-white/70 hover:text-white underline text-sm"
            >
              Hoppa över och gå till kartan
            </button>
          </div>
        </div>

        {/* Free Trial Info */}
        {selectedPlan !== 'basic' && (
          <div className="mt-12 text-center">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-6">
              <h4 className="text-lg font-semibold text-white mb-2">
                🎣 14 dagars kostnadsfri testperiod
              </h4>
              <p className="text-white/80 text-sm">
                Prova alla premium-funktioner utan kostnad. Avsluta när som helst under testperioden.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 