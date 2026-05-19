import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, answers } = await req.json() as {
    sessionId: string
    answers: { question_id: string; selected_answer: number | null }[]
  }
  if (!sessionId || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'sessionId and answers required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // セッション所有者確認
  const { data: session } = await admin
    .from('sessions')
    .select('student_id, is_submitted')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.student_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 提出済みなら上書きしない（スコアリング済みの is_correct を守る）
  if (session.is_submitted) {
    return NextResponse.json({ skipped: true })
  }

  const { error } = await admin
    .from('answers')
    .upsert(
      answers.map((a) => ({
        session_id: sessionId,
        question_id: a.question_id,
        selected_answer: a.selected_answer,
        is_correct: null,
      })),
      { onConflict: 'session_id,question_id' }
    )

  if (error) {
    console.error('[save-answers] upsert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
