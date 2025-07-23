import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null;
let isInitialized = false;
let initError: string | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!isInitialized) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        initError = 'Missing Supabase environment variables';
        isInitialized = true;
        throw new Error(initError);
      }

      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
      isInitialized = true;
    } catch (error) {
      initError = error instanceof Error ? error.message : 'Unknown Supabase initialization error';
      isInitialized = true;
      throw error;
    }
  }

  if (initError) {
    throw new Error(initError);
  }

  return supabaseClient!;
}

// Create a mock client for when Supabase is not available
const createMockSupabaseClient = (): Partial<SupabaseClient> => ({
  from: () => ({
    select: () => Promise.resolve({ data: [], error: new Error('Supabase not configured') }),
    insert: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    update: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    delete: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    eq: function() { return this; },
    single: function() { return this; },
    order: function() { return this; },
    contains: function() { return this; },
  }) as any,
  auth: {
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
    signOut: () => Promise.resolve({ error: new Error('Supabase not configured') }),
    getUser: () => Promise.resolve({ data: { user: null }, error: new Error('Supabase not configured') }),
    getSession: () => Promise.resolve({ data: { session: null }, error: new Error('Supabase not configured') }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } }, error: null }),
    signInWithOAuth: () => Promise.resolve({ data: { provider: null, url: null }, error: new Error('Supabase not configured') }),
    signInWithOtp: () => Promise.resolve({ data: {}, error: new Error('Supabase not configured') }),
    resetPasswordForEmail: () => Promise.resolve({ data: {}, error: new Error('Supabase not configured') }),
  } as any
});

// Export a proxy that behaves like a SupabaseClient but handles errors gracefully
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    try {
      const client = getSupabaseClient();
      const value = (client as any)[prop];
      
      if (typeof value === 'function') {
        return value.bind(client);
      }
      
      return value;
    } catch (error) {
      // Return mock client when Supabase is not available
      const mockClient = createMockSupabaseClient();
      const mockValue = (mockClient as any)[prop];
      
      if (typeof mockValue === 'function') {
        return mockValue.bind(mockClient);
      }
      
      return mockValue;
    }
  }
}); 