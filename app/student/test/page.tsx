import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TestClient from './TestClient'

export default async function TestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('email', user.email)
    .single()

  if (!student) redirect('/auth/login')
  if (!student.test_name) redirect('/student/register')

  // アクティブなテストを取得
  const { data: test } = await supabase
    .from('tests')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!test) redirect('/student/waiting')

  // セッションを取得
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('test_id', test.id)
    .eq('student_id', student.id)
    .maybeSingle()

  if (!session) redirect('/student/waiting')
  if (session.is_submitted) redirect('/student/waiting-result')

  // 問題を全取得
  const { data: questions } = await supabase
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
