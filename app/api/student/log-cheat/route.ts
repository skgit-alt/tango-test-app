import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, eventType } = await req.json()
  if (!sessionId || !eventType) {
    return NextResponse.json({ error: 'sessionId and eventType required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // セッションが自分のものか確認
  const { data: session } = await admin
    .from('sessions')
    .select('student_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.student_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin
    .from('cheat_logs')
    .insert({
      session_id: sessionId,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
