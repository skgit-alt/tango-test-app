import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// 練習セッションを新規作成する
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { testId } = await req.json() as { testId: string }
  if (!testId) return NextResponse.json({ error: 'testId required' }, { status: 400 })

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // テストが存在するか確認
  const { data: test } = await admin
    .from('tests')
    .select('id, status')
    .eq('id', testId)
    .maybeSingle()

  if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 })

  // 未提出の練習セッションが既にあれば再利用
  const { data: existing } = await admin
    .from('sessions')
    .select('id')
    .eq('student_id', user.id)
    .eq('test_id', testId)
    .eq('is_practice', true)
    .eq('is_submitted', false)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ sessionId: existing.id })
  }

  // 新規練習セッションを作成
  const { data: session, error } = await admin
    .from('sessions')
    .insert({
      student_id: user.id,
      test_id: testId,
      started_at: now,
      is_submitted: false,
      is_practice: true,
      score: null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sessionId: session.id })
}
