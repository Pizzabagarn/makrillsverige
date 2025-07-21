import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      'https://fqwzpjyleqfzmbqrjvbz.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxd3pwanlsZXFmem1icXJqdmJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTYzNzIsImV4cCI6MjA2ODY5MjM3Mn0.1ulTr9DI-wBJXzWJPujR95vWg2XwNdQhWUdb1jld1vE',
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('Error exchanging code for session:', error)
        return NextResponse.redirect(`${request.nextUrl.origin}/auth/error?message=${encodeURIComponent(error.message)}`)
      }
    } catch (error) {
      console.error('Unexpected error in auth callback:', error)
      return NextResponse.redirect(`${request.nextUrl.origin}/auth/error?message=An unexpected error occurred`)
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${request.nextUrl.origin}/`)
} 