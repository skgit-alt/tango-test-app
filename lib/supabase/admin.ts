import { createClient } from '@supabase/supabase-js'

/**
 * サービスロールクライアント（RLSをバイパス）
 * サーバーサイドのAPIルートやServer Componentでのみ使用すること。
 * ブラウザ（クライアントコンポーネント）では絶対に使わないこと。
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
