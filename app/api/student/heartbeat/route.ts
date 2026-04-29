import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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

  // トークンが一致するセッションのみ更新（所有者確認込み）
  await admin
    .from('sessions')
    .update({ device_token_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .eq('device_token', deviceToken)

  return NextResponse.json({ ok: true })
}
