import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// 管理者がセッションのスコア・提出状態・欠席を手動修正する
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, testId, studentId, score, is_submitted, is_absent } = await req.json() as {
    sessionId: string | null
    testId: string
    studentId: string
    score: number | null
    is_submitted: boolean
    is_absent: boolean
  }

  if (!testId || !studentId) {
    return NextResponse.json({ error: 'testId and studentId required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // 欠席の場合は score=null、is_submitted=false に強制
  const finalScore = is_absent ? null : score
  const finalSubmitted = is_absent ? false : is_submitted
  const finalSubmittedAt = finalSubmitted ? now : null

  if (sessionId) {
    // 既存セッションを更新
    const patch: Record<string, unknown> = {
      score: finalScore,
      is_submitted: finalSubmitted,
      is_absent,
    }
    if (finalSubmitted) patch.submitted_at = now

    const { error } = await admin.from('sessions').update(patch).eq('id', sessionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // セッションを新規作成（未受験者を手動操作する場合）
    const insertData: Record<string, unknown> = {
      student_id: studentId,
      test_id: testId,
      started_at: now,
      submitted_at: finalSubmittedAt,
      is_submitted: finalSubmitted,
      is_absent,
      score: finalScore,
    }
    const { error } = await admin.from('sessions').insert(insertData)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
