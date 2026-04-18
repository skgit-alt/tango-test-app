import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: adminRec } = await admin
    .from('admins')
    .select('role')
    .eq('email', user.email!)
    .maybeSingle()

  if (!adminRec) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const testId = req.nextUrl.searchParams.get('testId')
  if (!testId) return NextResponse.json({ error: 'testId required' }, { status: 400 })

  const { data: sessions } = await admin
    .from('sessions')
    .select('id')
    .eq('test_id', testId)

  const sessionIds = (sessions ?? []).map((s) => s.id)
  if (sessionIds.length === 0) return NextResponse.json({ answers: [] })

  const { data: answers, error } = await admin
    .from('answers')
    .select('*, questions(order_num, question_text, correct_answer, points)')
    .in('session_id', sessionIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ answers: answers ?? [] })
}
