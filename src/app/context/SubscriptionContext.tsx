'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useAuth } from './AuthContext'

export type SubscriptionPlan = 'free' | 'basic' | 'premium' | 'enterprise'
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'

interface Subscription {
  id?: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  currentPeriodEnd?: Date
  cancelAtPeriodEnd?: boolean
  trialEnd?: Date
  features: string[]
}

interface SubscriptionContextType {
  subscription: Subscription
  loading: boolean
  hasFeature: (feature: string) => boolean
  isPremium: () => boolean
  canAccessFeature: (feature: string) => boolean
  upgradeUrl: (plan: SubscriptionPlan) => string
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined)

// Define features for each plan
const PLAN_FEATURES: Record<SubscriptionPlan, string[]> = {
  free: [
    'basic_maps',
    'current_data',
    'limited_history'
  ],
  basic: [
    'basic_maps',
    'current_data',
    'limited_history',
    'extended_history',
    'export_data',
    'notifications'
  ],
  premium: [
    'basic_maps',
    'current_data',
    'limited_history',
    'extended_history',
    'export_data',
    'notifications',
    'advanced_analytics',
    'custom_alerts',
    'api_access',
    'priority_support'
  ],
  enterprise: [
    'basic_maps',
    'current_data',
    'limited_history',
    'extended_history',
    'export_data',
    'notifications',
    'advanced_analytics',
    'custom_alerts',
    'api_access',
    'priority_support',
    'white_label',
    'dedicated_support',
    'custom_integrations'
  ]
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<Subscription>({
    plan: 'free',
    status: 'active',
    features: PLAN_FEATURES.free
  })
  const [loading, setLoading] = useState(false)

  // Load user's subscription when they log in
  useEffect(() => {
    if (user) {
      loadUserSubscription()
    } else {
      // Reset to free plan when logged out
      setSubscription({
        plan: 'free',
        status: 'active',
        features: PLAN_FEATURES.free
      })
    }
  }, [user])

  const loadUserSubscription = async () => {
    setLoading(true)
    try {
      // TODO: Replace with actual Supabase/Stripe integration
      // For now, simulate loading user's subscription
      
      // Example: Check if user has subscription in Supabase
      // const { data, error } = await supabase
      //   .from('subscriptions')
      //   .select('*')
      //   .eq('user_id', user.id)
      //   .single()

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // For demo purposes, set based on user email domain
      const isDemo = user?.email?.includes('premium') || user?.email?.includes('pro')
      const plan: SubscriptionPlan = isDemo ? 'premium' : 'free'
      
      setSubscription({
        plan,
        status: 'active',
        features: PLAN_FEATURES[plan],
        currentPeriodEnd: isDemo ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined
      })
    } catch (error) {
      console.error('Error loading subscription:', error)
      // Fallback to free plan
      setSubscription({
        plan: 'free',
        status: 'active',
        features: PLAN_FEATURES.free
      })
    } finally {
      setLoading(false)
    }
  }

  const hasFeature = (feature: string): boolean => {
    return subscription.features.includes(feature)
  }

  const isPremium = (): boolean => {
    return ['basic', 'premium', 'enterprise'].includes(subscription.plan)
  }

  const canAccessFeature = (feature: string): boolean => {
    // Check if user has active subscription and the feature
    if (subscription.status !== 'active') {
      return false
    }
    return hasFeature(feature)
  }

  const upgradeUrl = (plan: SubscriptionPlan): string => {
    // TODO: Replace with actual Stripe Checkout URLs
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://makrillsverige.se' 
      : 'http://localhost:3000'
    
    const priceIds: Record<SubscriptionPlan, string> = {
      free: '',
      basic: 'price_basic_monthly', // Replace with actual Stripe price IDs
      premium: 'price_premium_monthly',
      enterprise: 'price_enterprise_monthly'
    }

    if (plan === 'free') {
      return `${baseUrl}/subscription/cancel`
    }

    return `${baseUrl}/subscription/checkout?plan=${plan}&price_id=${priceIds[plan]}`
  }

  return (
    <SubscriptionContext.Provider value={{
      subscription,
      loading,
      hasFeature,
      isPremium,
      canAccessFeature,
      upgradeUrl,
    }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export const useSubscription = () => {
  const context = useContext(SubscriptionContext)
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider')
  }
  return context
}

// Helper hook for premium features
export const usePremiumFeature = (feature: string) => {
  const { canAccessFeature, upgradeUrl } = useSubscription()
  
  return {
    hasAccess: canAccessFeature(feature),
    upgradeUrl: upgradeUrl('premium'),
    requiresUpgrade: !canAccessFeature(feature)
  }
} 