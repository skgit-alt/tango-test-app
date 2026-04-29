import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const LOCK_TIMEOUT_MS = 60 * 1000 // 60秒間ハートビートがなければ解放

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, deviceToken } = await req.json() as {
    sessionId: string
    deviceToken: string
  }
  if (!sessionId || !deviceToken) {
    return NextResponse.json({ error: 'sessionId and deviceToken required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // セッション取得（所有者確認込み）
  const { data: session } = await admin
    .from('sessions')
    .select('student_id, is_submitted, device_token, device_token_at')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.student_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 提出済みなら端末チェック不要
  if (session.is_submitted) {
    return NextResponse.json({ ok: true })
  }

  // 別の端末が60秒以内にハートビートを送っていたらブロック
  if (
    session.device_token &&
    session.device_token !== deviceToken &&
    session.device_token_at
  ) {
    const lastBeat = new Date(session.device_token_at).getTime()
    if (Date.now() - lastBeat < LOCK_TIMEOUT_MS) {
      return NextResponse.json({ blocked: true })
    }
  }

  // この端末でセッションを確保
  const now = new Date().toISOString()
  await admin
    .from('sessions')
    .update({ device_token: deviceToken, device_token_at: now })
    .eq('id', sessionId)

  return NextResponse.json({ ok: true })
}
