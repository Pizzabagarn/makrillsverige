'use client';

import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useRouter } from 'next/navigation'
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, X } from 'lucide-react'

interface SignupForm {
  email: string
  password: string
  confirmPassword: string
  acceptTerms: boolean
}

export default function SignupPage() {
  const { user, signUp, signInWithGoogle, loading: authLoading } = useAuth()
  const router = useRouter()
  
  const [formData, setFormData] = useState<SignupForm>({ 
    email: '', 
    password: '', 
    confirmPassword: '', 
    acceptTerms: false 
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      router.push('/')
    }
  }, [user, authLoading, router])

  const validatePassword = (password: string): string[] => {
    const errors: string[] = []
    if (password.length < 8) errors.push('Minst 8 tecken')
    if (!/[A-Z]/.test(password)) errors.push('En stor bokstav')
    if (!/[a-z]/.test(password)) errors.push('En liten bokstav')
    if (!/\d/.test(password)) errors.push('En siffra')
    return errors
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Lösenorden matchar inte')
      setLoading(false)
      return
    }

    const passwordErrors = validatePassword(formData.password)
    if (passwordErrors.length > 0) {
      setError(`Lösenordet måste innehålla: ${passwordErrors.join(', ')}`)
      setLoading(false)
      return
    }

    if (!formData.acceptTerms) {
      setError('Du måste godkänna användarvillkoren')
      setLoading(false)
      return
    }

    try {
      const { error } = await signUp(formData.email, formData.password)
      
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Tack! Vi har skickat en verifieringslänk till din e-post. Klicka på länken för att slutföra registreringen.')
      }
    } catch (error) {
      setError('Ett oväntat fel uppstod')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    try {
      const { error } = await signInWithGoogle()
      
      if (error) {
        setError(error.message)
      }
    } catch (error) {
      setError('Ett oväntat fel uppstod med Google-registrering')
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Video Background */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'brightness(0.3)' }}
        onLoadedData={(e) => {
          const video = e.target as HTMLVideoElement;
          video.playbackRate = 0.8;
        }}
      >
        <source src="/videos/lysekil.mp4" type="video/mp4" />
      </video>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30" />
      
      {/* Content Container */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        {/* Close Button */}
        <button
          onClick={() => router.push('/')}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-all duration-300 backdrop-blur-sm z-20"
          aria-label="Stäng"
        >
          <X className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        {/* Main Card */}
        <div className="w-full max-w-sm sm:max-w-md">
          <div className="bg-gray-900/95 backdrop-blur-xl border border-gray-700/50 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80">
          {/* Header */}
          <div className="text-center mb-5 sm:mb-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
            </div>
            <h1 className="text-lg sm:text-xl font-semibold text-white mb-1">
              Skapa ditt konto
            </h1>
            <p className="text-gray-400 text-sm">
              Kom igång med Makrill Sverige
            </p>
          </div>


          {/* Google Sign Up */}
          <button
            onClick={handleGoogleSignUp}
            className="w-full flex items-center justify-center space-x-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-medium py-3 px-4 rounded-2xl transition-all duration-300 mb-4 sm:mb-5"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Fortsätt med Google</span>
          </button>

          {/* Divider */}
          <div className="relative mb-4 sm:mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-gray-900 text-gray-400">eller</span>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded-xl mb-4">
              <p className="text-sm">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="bg-green-900/50 border border-green-700 text-green-300 px-3 py-2 rounded-xl mb-4">
              <p className="text-sm">{success}</p>
            </div>
          )}

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                placeholder="E-postadress"
                required
              />
            </div>

            <div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  placeholder="Lösenord (minst 8 tecken)"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-white transition-colors duration-200"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  placeholder="Bekräfta lösenord"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-white transition-colors duration-200"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

                        {/* Terms checkbox */}
            <div className="flex items-start space-x-3 pt-1">
              <input
                id="terms"
                type="checkbox"
                checked={formData.acceptTerms}
                onChange={(e) => setFormData(prev => ({ ...prev, acceptTerms: e.target.checked }))}
                className="mt-1 h-4 w-4 text-blue-500 bg-gray-800 border-2 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-0"
                required
              />
              <label htmlFor="terms" className="text-sm text-gray-300 leading-relaxed">
                Jag godkänner{' '}
                <a href="#" className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2">
                  användarvillkoren
                </a>{' '}
                och{' '}
                <a href="#" className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2">
                  integritetspolicyn
                </a>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-2xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg relative"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Skapar konto...</span>
                </div>
              ) : (
                'Skapa konto'
              )}
            </button>
          </form>

          {/* Back to login */}
          <div className="mt-5 pt-4 border-t border-gray-700 text-center">
            <p className="text-sm text-gray-400 mb-2">
              Har du redan ett konto?
            </p>
            <button
              onClick={() => router.push('/')}
              className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors duration-200"
            >
              Logga in här
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
} 