import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const testId = req.nextUrl.searchParams.get('testId')
  if (!testId) return NextResponse.json({ error: 'testId required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: sessions, error } = await admin
    .from('sessions')
    .select('*, students(name, class_name, seat_number, test_name)')
    .eq('test_id', testId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: cheatLogs } = await admin
    .from('cheat_logs')
    .select('*, sessions(students(name, class_name, seat_number))')
    .in('session_id', (sessions ?? []).map((s) => s.id))

  return NextResponse.json({ sessions: sessions ?? [], cheatLogs: cheatLogs ?? [] })
}
