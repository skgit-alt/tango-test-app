import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ReviewClient from './ReviewClient'

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: student } = await supabase
    .from('students')
    .select('id, name, class_name, seat_number')
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')

  // sessionIdが指定されていればそのセッションを、なければ最新を取得
  let query = supabase
    .from('sessions')
    .select('id, test_id, score, submitted_at, tests(title, status, mode)')
    .eq('student_id', student.id)
    .eq('is_submitted', true)

  if (sessionId) {
    query = query.eq('id', sessionId)
  } else {
    query = query.order('submitted_at', { ascending: false }).limit(1)
  }

  const { data: session } = await query.maybeSingle()

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm w-full space-y-3">
          <p className="text-gray-600">回答データがありません</p>
          <Link href="/student" className="text-blue-600 text-sm hover:underline">ホームに戻る</Link>
        </div>
      </div>
    )
  }

  const test = session.tests as { title: string; status: string; mode: number } | null

  if (test?.status !== 'published') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm w-full space-y-3">
          <div className="text-4xl">🔒</div>
          <p className="text-gray-700 font-medium">結果が公開されるまで確認できません</p>
          <Link href="/student/waiting-result" className="text-blue-600 text-sm hover:underline">
            待ち画面に戻る
          </Link>
        </div>
      </div>
    )
  }

  const { data: rawAnswers } = await supabase
    .from('answers')
    .select('question_id, selected_answer, is_correct, questions(*)')
    .eq('session_id', session.id)

  const answers = ((rawAnswers ?? []) as any[])
    .filter((a) => a.questions)
    .sort((a, b) => (a.questions?.order_num ?? 0) - (b.questions?.order_num ?? 0))
    .map((a) => ({
      question_id: a.question_id,
      selected_answer: a.selected_answer,
      is_correct: a.is_correct,
      order_num: a.questions.order_num,
      question_text: a.questions.question_text,
      choice1: a.questions.choice1,
      choice2: a.questions.choice2,
      choice3: a.questions.choice3,
      choice4: a.questions.choice4,
      choice5: a.questions.choice5,
      correct_answer: a.questions.correct_answer,
      points: a.questions.points,
    }))

  const backUrl = sessionId ? `/student/result?sessionId=${sessionId}` : '/student/result'

  return (
    <ReviewClient
      answers={answers}
      testTitle={test.title}
      score={session.score ?? 0}
      backUrl={backUrl}
    />
  )
}
