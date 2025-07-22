import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
      const { error, data } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('Error exchanging code for session:', error)
        return NextResponse.redirect(`${request.nextUrl.origin}/auth/error?message=${encodeURIComponent(error.message)}`)
      }

      // Check if this is a new user (first time verifying email)
      const isNewUser = data?.user?.email_confirmed_at && 
                       new Date(data.user.email_confirmed_at).getTime() > (Date.now() - 60000) // Within last minute
      
      if (isNewUser) {
        // New user - redirect to welcome page with plans
        return NextResponse.redirect(`${request.nextUrl.origin}/auth/callback/welcome`)
      }
      
    } catch (error) {
      console.error('Unexpected error in auth callback:', error)
      return NextResponse.redirect(`${request.nextUrl.origin}/auth/error?message=An unexpected error occurred`)
    }
  }

  // Existing user or regular sign in - redirect to main app
  return NextResponse.redirect(`${request.nextUrl.origin}/`)
} 