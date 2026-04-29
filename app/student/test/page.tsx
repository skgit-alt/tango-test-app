import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import TestClient from './TestClient'

export default async function TestPage({
  searchParams,
}: {
  searchParams: Promise<{ practiceSessionId?: string }>
}) {
  const { practiceSessionId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')
  if (!student.test_name) redirect('/student/change-password')

  // admin経由でセッションを取得（RLSバイパス）
  const admin = createAdminClient()

  let session
  if (practiceSessionId) {
    // 練習セッションIDが指定された場合はそれを直接取得
    const { data } = await admin
      .from('sessions')
      .select('*')
      .eq('id', practiceSessionId)
      .eq('student_id', student.id)
      .eq('is_submitted', false)
      .maybeSingle()
    session = data
  } else {
    // 通常フロー：最新の未提出セッションを取得
    const { data } = await admin
      .from('sessions')
      .select('*')
      .eq('student_id', student.id)
      .eq('is_submitted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    session = data
  }

  if (!session) redirect('/student/waiting')

  const { data: test } = await admin
    .from('tests')
    .select('*')
    .eq('id', session.test_id)
    .single()

  if (!test) redirect('/student/waiting')

  // 問題を全取得（RLSバイパス）
  const { data: questions } = await admin
    .from('questions')
    .select('*')
    .eq('test_id', test.id)
    .order('order_num')

  if (!questions || questions.length === 0) redirect('/student/waiting')

  // 既存の回答を取得（中断再開用、RLSバイパス）
  const { data: existingAnswers } = await admin
    .from('answers')
    .select('question_id, selected_answer')
    .eq('session_id', session.id)

  const answerMap: Record<string, number | null> = {}
  existingAnswers?.forEach((a) => {
    answerMap[a.question_id] = a.selected_answer
  })

  return (
    <TestClient
      test={test}
      session={session}
      questions={questions}
      initialAnswers={answerMap}
      isPractice={session.is_practice ?? false}
    />
  )
}
