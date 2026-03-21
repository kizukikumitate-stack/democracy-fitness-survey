import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
      fetch(url, { ...options, cache: 'no-store' }),
  },
})

export type Survey = {
  id: string
  token: string
  organization_name: string
  created_at: string
}

export type Response = {
  id: string
  survey_token: string
  respondent_name: string | null
  answers: Record<string, number>
  created_at: string
}
