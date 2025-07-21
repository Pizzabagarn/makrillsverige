'use client';

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useRouter } from 'next/navigation'
import { User, LogIn, LogOut, UserPlus, Settings, Crown } from 'lucide-react'

export default function UserMenu() {
  const { user, signOut, loading } = useAuth()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      updateDropdownPosition()
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
          {!user && (
            <div className="p-4">
              <div className="mb-4">
                <h3 className="font-semibold text-sm mb-2">Användarområde</h3>
                <p className="text-xs text-white/70">
                  Logga in för att spara dina inställningar och få tillgång till premium-funktioner
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleNavigation('/login')}
                  className="
                    flex items-center space-x-2 w-full p-3 rounded-lg
                    bg-blue-600 hover:bg-blue-700 transition-colors duration-200
                    text-sm font-medium text-white
                  "
                >
                  <LogIn size={16} />
                  <span>Logga in</span>
                </button>

                <button
                  onClick={() => handleNavigation('/signup')}
                  className="
                    flex items-center space-x-2 w-full p-2 rounded-lg
                    hover:bg-white/10 transition-colors duration-200
                    text-sm text-white border border-white/20
                  "
                >
                  <UserPlus size={16} />
                  <span>Skapa konto</span>
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-slate-400 text-center">
                  Premium-funktioner inkluderar avancerad analys, historiska data och personliga inställningar
                </p>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
} 