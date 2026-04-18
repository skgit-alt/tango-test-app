import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // maxAge を 30日 に固定してブラウザを閉じても Cookie が残るようにする
              cookieStore.set(name, value, {
                ...options,
                maxAge: 60 * 60 * 24 * 30,
              })
            )
          } catch {
            // Server Componentからの呼び出し時は無視
          }
        },
      },
    }
  )
}
