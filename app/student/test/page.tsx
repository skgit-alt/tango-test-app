import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import TestClient from './TestClient'

export default async function TestPage() {
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

  // 未提出のセッションを探す（セッションが存在 = 開始許可済み）
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('student_id', student.id)
    .eq('is_submitted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) redirect('/student/waiting')

  // セッションのtest_idからテストを取得（RLSバイパス）
  const admin = createAdminClient()
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

  // 既存の回答を取得（中断再開用）
  const { data: existingAnswers } = await supabase
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
    />
  )
}
