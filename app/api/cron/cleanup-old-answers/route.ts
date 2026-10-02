import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// Vercel Cron Job から毎日深夜に呼ばれる
// 提出から30日以上経ったセッションの answers / cheat_logs を削除する
// sessions（点数・提出状況）は削除しない
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // 30日以上前に提出された（練習以外の）セッションを対象
  const { data: sessions } = await admin
    .from('sessions')
    .select('id')
    .eq('is_submitted', true)
    .eq('is_practice', false)
    .lt('submitted_at', cutoff)
    .not('submitted_at', 'is', null)

  if (!sessions || sessions.length === 0) {
    console.log('[cron/cleanup-old-answers] 削除対象なし')
    return NextResponse.json({ deleted: 0, sessions: 0 })
  }

  const sessionIds = sessions.map((s) => s.id)

  const { count } = await admin
    .from('answers')
    .delete({ count: 'exact' })
    .in('session_id', sessionIds)

  await admin
    .from('cheat_logs')
    .delete()
    .in('session_id', sessionIds)

  console.log(`[cron/cleanup-old-answers] ${sessions.length}セッション・${count}答案を削除`)
  return NextResponse.json({ deleted: count ?? 0, sessions: sessions.length })
}
