import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fqwzpjyleqfzmbqrjvbz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxd3pwanlsZXFmem1icXJqdmJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTYzNzIsImV4cCI6MjA2ODY5MjM3Mn0.1ulTr9DI-wBJXzWJPujR95vWg2XwNdQhWUdb1jld1vE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey) 