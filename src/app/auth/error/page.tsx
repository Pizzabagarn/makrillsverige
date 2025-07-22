'use client';

import { useRouter, useSearchParams } from 'next/navigation'
import { X, AlertTriangle } from 'lucide-react'

export default function AuthErrorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const message = searchParams.get('message') || 'Ett okänt fel uppstod'

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
            aria-label="Tillbaka till kartan"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-24">
        <div className="bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl p-12 shadow-2xl text-center">
          
          {/* Error Icon */}
          <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-white" />
          </div>

          {/* Error Title */}
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Något gick fel
          </h1>

          {/* Error Message */}
          <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg mb-8">
            <p className="text-sm font-medium">
              {message}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            <button
              onClick={() => router.push('/signup')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              Försök registrera igen
            </button>
            
            <button
              onClick={() => router.push('/')}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              Gå till kartan
            </button>
          </div>

          {/* Help Text */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Om problemet kvarstår, kontakta support på{' '}
              <a href="mailto:support@makrillsverige.se" className="text-blue-600 hover:text-blue-800 underline">
                support@makrillsverige.se
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 