'use client';

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useRouter } from 'next/navigation'
import { User, LogIn, LogOut, UserPlus, Settings, Crown, Loader2 } from 'lucide-react'



export default function UserMenu() {
  const { user, signOut, signIn, signUp, signInWithGoogle, loading } = useAuth()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [showAuthForm, setShowAuthForm] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Update dropdown position when opening
  const updateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 8, // 8px margin from button
        left: rect.left
      })
    }
  }

  // Close menu when clicking outside and reset form
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        resetForm()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      updateDropdownPosition()
    } else {
      resetForm()
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSignOut = async () => {
    await signOut()
    setIsOpen(false)
  }

  const handleNavigation = (path: string) => {
    router.push(path)
    setIsOpen(false)
  }

  const resetForm = () => {
    setShowAuthForm(false)
    setEmail('')
    setPassword('')
    setError('')
    setAuthLoading(false)
  }

  const handleLoginClick = () => {
    setShowAuthForm(true)
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setError('')

    try {
      const { error } = await signIn(email, password)
      if (error) setError(error.message)
    } catch (error) {
      setError('Ett fel uppstod')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await signInWithGoogle()
      if (error) setError(error.message)
    } catch (error) {
      setError('Google-inloggning misslyckades')
    }
  }

  return (
    <>
      {/* User Icon Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="
          flex items-center justify-center
          w-10 h-10 rounded-full
          bg-gradient-to-br from-white/25 via-white/20 to-white/15 
          backdrop-blur-md border border-white/30
          text-white hover:bg-white/30 
          transition-all duration-200 ease-out
          hover:scale-105 active:scale-95
          shadow-lg hover:shadow-xl
        "
        aria-label={user ? 'Användarmeny' : 'Logga in'}
      >
        <User size={20} />
      </button>

      {/* Dropdown Menu - Portal to body */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <div 
          ref={menuRef}
          className="
            fixed
            w-80 min-h-[200px]
            bg-gradient-to-br from-black/95 via-black/90 to-black/85
            backdrop-blur-xl border border-white/20
            rounded-lg shadow-2xl
            text-white
            z-[9999]
            animate-in slide-in-from-top-2 duration-200
          "
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          {/* User is logged in */}
          {user && (
            <div className="p-4">
              <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-white/10">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <User size={20} className="text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">Inloggad som</p>
                  <p className="text-xs text-white/70 truncate max-w-[200px]">
                    {user.email}
                  </p>
                </div>
              </div>
              
              <div className="space-y-1">
                <button
                  onClick={() => handleNavigation('/dashboard')}
                  className="
                    flex items-center space-x-2 w-full p-2 rounded-lg
                    hover:bg-white/10 transition-colors duration-200
                    text-sm text-white hover:text-white
                  "
                >
                  <Settings size={16} />
                  <span>Inställningar</span>
                </button>

                <button
                  onClick={() => handleNavigation('/subscription')}
                  className="
                    flex items-center space-x-2 w-full p-2 rounded-lg
                    hover:bg-white/10 transition-colors duration-200
                    text-sm text-yellow-300 hover:text-yellow-200
                  "
                >
                  <Crown size={16} />
                  <span>Uppgradera</span>
                </button>

                <div className="pt-2 border-t border-white/10">
                  <button
                    onClick={handleSignOut}
                    className="
                      flex items-center space-x-2 w-full p-2 rounded-lg
                      hover:bg-white/10 transition-colors duration-200
                      text-sm text-red-300 hover:text-red-200
                    "
                  >
                    <LogOut size={16} />
                    <span>Logga ut</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* User is not logged in */}
          {!user && !showAuthForm && (
            <div className="p-4">
              <div className="mb-2">
                <h3 className="font-semibold text-sm mb-3">Användarområde</h3>
              </div>

              <button
                onClick={handleLoginClick}
                className="
                  flex items-center space-x-2 w-full p-3 rounded-lg
                  bg-blue-600 hover:bg-blue-700 transition-colors duration-200
                  text-sm font-medium text-white
                "
              >
                <LogIn size={16} />
                <span>Logga in</span>
              </button>
            </div>
          )}

          {/* Auth Form */}
          {!user && showAuthForm && (
            <div className="p-4">
              <div className="mb-4">
                <h3 className="font-semibold text-sm mb-2">Logga in</h3>
              </div>

              {/* Google Sign In */}
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-gray-50 text-gray-900 font-medium py-2 px-3 rounded-lg transition-colors duration-200 mb-3 text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Google</span>
              </button>

              <div className="relative mb-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-transparent text-slate-400">eller</span>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-3 py-2 rounded-lg mb-3 text-xs">
                  {error}
                </div>
              )}

              {/* Login/Signup Form */}
              <form onSubmit={handleAuthSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="E-post"
                  required
                />
                
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="Lösenord"
                  required
                />



                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                >
                  {authLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    'Logga in'
                  )}
                </button>
              </form>

              <div className="mt-3 pt-3 border-t border-white/10 text-center">
                <button
                  onClick={() => {
                    router.push('/signup')
                    setIsOpen(false)
                    resetForm()
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Skapa konto istället
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

    </>
  )
} 