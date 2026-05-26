import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calcPointsFromRules, DEFAULT_POINT_RULES } from '@/lib/supabase/types'
import { NextRequest, NextResponse } from 'next/server'

// submit_test RPCを呼び出し、失敗時はadminクライアントで手動採点してフォールバック保存する
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
    // ─── RPC失敗時: 手動採点して保存 ─────────────────────────────────────────
    console.error('[submit-test] RPC failed:', rpcError.message)

    // 問題の正解・配点を取得
    const { data: questions } = await admin
      .from('questions')
      .select('id, correct_answer, points')
      .eq('test_id', session.test_id)

    // 手動採点
    let manualScore = 0
    const upsertData = answers.map((a) => {
      const q = questions?.find((q) => q.id === a.question_id)
      const isCorrect = q != null ? (a.selected_answer === q.correct_answer) : null
      if (isCorrect) manualScore += (q?.points ?? 1)
      return {
        session_id: sessionId,
        question_id: a.question_id,
        selected_answer: a.selected_answer,
        is_correct: isCorrect,
      }
    })

    // 回答を保存
    const { error: upsertErr } = await admin
      .from('answers')
      .upsert(upsertData, { onConflict: 'session_id,question_id' })
    if (upsertErr) {
      console.error('[submit-test] upsert failed:', upsertErr.message)
    }

    // スコアをセッションに保存
    await admin
      .from('sessions')
      .update({ score: manualScore })
      .eq('id', sessionId)

    // points テーブルを更新（同一student+testの古い行を削除してから挿入）
    await admin
      .from('points')
      .delete()
      .eq('student_id', session.student_id)
      .eq('test_id', session.test_id)

    const pointsEarned = calcPointsFromRules(manualScore, DEFAULT_POINT_RULES)
    await admin.from('points').insert({
      student_id: session.student_id,
      test_id: session.test_id,
      score: manualScore,
      points_earned: pointsEarned,
      cycle: 1,
    })
  }

  // ★マーク（flagged）をanswersテーブルに保存
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
      console.warn('[submit-test] flagged upsert skipped:', flagErr.message)
    }
  }

  // RPC 成功・失敗に関わらず、必ずセッションを提出済みにする
  const { error: updErr } = await admin
    .from('sessions')
    .update({ is_submitted: true, submitted_at: now, device_token: null, device_token_at: null })
    .eq('id', sessionId)
    .eq('is_submitted', false)

  if (updErr) {
    console.error('[submit-test] session update failed:', updErr.message)
  }

  return NextResponse.json({ success: true, rpcOk: !rpcError })
}
