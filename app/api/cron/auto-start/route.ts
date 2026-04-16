import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// Vercel Cron Job から毎分呼ばれる
// 手動トリガー（先生ページ読み込み時）からも呼ばれる
export async function GET(req: NextRequest) {
  // Vercel Cron からの呼び出しは Authorization ヘッダーで認証
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  const isInternal = req.headers.get('x-internal-trigger') === '1'

  if (!isCron && !isInternal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // 予約時刻を過ぎていて、まだ待機中のテストを検索
  const { data: tests, error } = await admin
    .from('tests')
    .select('id, title')
    .eq('status', 'waiting')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)

  if (error) {
    console.error('[cron/auto-start] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!tests || tests.length === 0) {
    return NextResponse.json({ started: [] })
  }

  // 対象テストを全クラス開始に変更
  const ids = tests.map((t: { id: string }) => t.id)
  const { error: updateError } = await admin
    .from('tests')
    .update({ status: 'open', opened_at: now })
    .in('id', ids)

  if (updateError) {
    console.error('[cron/auto-start] update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  console.log('[cron/auto-start] started:', tests.map((t: { title: string }) => t.title))
  return NextResponse.json({ started: tests.map((t: { id: string; title: string }) => t.title) })
}
