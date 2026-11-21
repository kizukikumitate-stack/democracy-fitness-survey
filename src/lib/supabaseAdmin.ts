import { createClient } from '@supabase/supabase-js'

// 顧客マスタ等の RLS で保護されたテーブルにサーバーサイドから書き込むための
// service_role クライアント。
// SUPABASE_SERVICE_ROLE_KEY は NEXT_PUBLIC_ プレフィックスを付けない(クライアントに漏らさない)。

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
        fetch(url, { ...options, cache: 'no-store' }),
    },
  })
}

// サーベイ本体(surveys / responses)を読み書きするサーバーサイド用の共有クライアント。
// これらのテーブルは RLS が有効で anon からは1行も見えないため、
// API ルート・サーバーコンポーネントからは必ずこちらを使う(anon クライアントは使わない)。
let serverClient: ReturnType<typeof createSupabaseAdminClient> | null = null

export function getServerSupabase() {
  if (!serverClient) {
    serverClient = createSupabaseAdminClient()
  }
  return serverClient
}
