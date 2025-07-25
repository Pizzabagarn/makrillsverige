'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, AuthError, AuthResponse, SignInWithPasswordCredentials } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useRouter, usePathname } from 'next/navigation'

interface AuthContextType {
  user: User | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<AuthResponse>
  signIn: (email: string, password: string) => Promise<AuthResponse>
  signInWithGoogle: () => Promise<{ error: AuthError | null }>
  signInWithMagicLink: (email: string) => Promise<AuthResponse>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.error('Error getting session:', error)
        }
        setUser(session?.user ?? null)
      } catch (error) {
        console.error('Error in getInitialSession:', error)
      } finally {
        setLoading(false)
        setInitialLoad(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth state change:', event, !!session?.user)
        
        setUser(session?.user ?? null)
        setLoading(false)

        // Only handle redirects for explicit user actions, not session refreshes
        if (!initialLoad) {
          if (event === 'SIGNED_OUT') {
            // User explicitly signed out - redirect to home
            console.log('🚪 User signed out, redirecting to home')
            router.push('/')
          } else if (event === 'SIGNED_IN' && pathname.startsWith('/auth/')) {
            // User just signed in from auth flow - redirect to home
            console.log('✅ User signed in from auth flow, redirecting to home')
            router.push('/')
          }
          // For TOKEN_REFRESHED, PASSWORD_RECOVERY, etc. - don't redirect
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router, pathname, initialLoad])

  const signUp = async (email: string, password: string): Promise<AuthResponse> => {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    })
  }

  const signIn = async (email: string, password: string): Promise<AuthResponse> => {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    })
  }

  const signInWithGoogle = async (): Promise<{ error: AuthError | null }> => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })
      return { error }
    } catch (err) {
      return { error: err as AuthError }
    }
  }

  const signInWithMagicLink = async (email: string): Promise<AuthResponse> => {
    return await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    })
  }

  const resetPassword = async (email: string) => {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    })
  }

  const signOut = async () => {
    return await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithMagicLink,
      signOut,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 