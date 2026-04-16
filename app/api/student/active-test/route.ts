import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  // まず認証チェック（通常クライアントで）
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(null, { status: 401 })
  }

  // データ取得はサービスロール（RLSバイパス）で
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tests')
    .select('id, title, mode, status, open_classes')
    .in('status', ['waiting', 'open'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[active-test API] error:', error)
    return NextResponse.json(null, { status: 500 })
  }

  return NextResponse.json(data)
}
