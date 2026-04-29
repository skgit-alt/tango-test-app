import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// submit_test RPCを呼び出し、失敗時はadminクライアントでフォールバック保存する
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, answers } = await req.json() as {
    sessionId: string
    answers: { question_id: string; selected_answer: number | null; flagged?: boolean }[]
  }
  if (!sessionId || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'sessionId and answers required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // セッション所有者の確認
  const { data: session } = await admin
    .from('sessions')
    .select('student_id, test_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.student_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date().toISOString()

  // RPCを試す（採点込み）
  const { error: rpcError } = await admin.rpc('submit_test', {
    p_session_id: sessionId,
    p_answers: answers,
  })

  if (rpcError) {
    // RPC失敗時: answers を直接 upsert して手動採点なしで保存
    console.error('[submit-test] RPC failed:', rpcError.message)
    const upsertData = answers.map((a) => ({
      session_id: sessionId,
      question_id: a.question_id,
      selected_answer: a.selected_answer,
      is_correct: null,
    }))
    const { error: upsertErr } = await admin
      .from('answers')
      .upsert(upsertData, { onConflict: 'session_id,question_id' })
    if (upsertErr) {
      console.error('[submit-test] upsert failed:', upsertErr.message)
    }
  }

  // ★マーク（flagged）をanswersテーブルに保存（列が存在する場合のみ）
  const flaggedAnswers = answers.filter((a) => a.flagged)
  if (flaggedAnswers.length > 0) {
    const { error: flagErr } = await admin.from('answers').upsert(
      flaggedAnswers.map((a) => ({
        session_id: sessionId,
        question_id: a.question_id,
        flagged: true,
      })),
      { onConflict: 'session_id,question_id' }
    )
    if (flagErr) {
      // flaggedカラムが未作成の場合は無視（機能は動くが★は保存されない）
      console.warn('[submit-test] flagged upsert skipped:', flagErr.message)
    }
  }

  // RPC 成功・失敗に関わらず、必ずセッションを提出済みにする
  // 提出と同時に端末ロック（device_token）を解放する
  const { error: updErr } = await admin
    .from('sessions')
    .update({ is_submitted: true, submitted_at: now, device_token: null, device_token_at: null })
    .eq('id', sessionId)
    .eq('is_submitted', false)  // 既に提出済みの場合は更新しない

  if (updErr) {
    console.error('[submit-test] session update failed:', updErr.message)
  }

  return NextResponse.json({ success: true, rpcOk: !rpcError })
}
