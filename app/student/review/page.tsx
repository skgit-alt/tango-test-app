import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeResult } from '@/lib/supabase/types'
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

  const admin = createAdminClient()

  const { data: student } = await admin
    .from('students')
    .select('id, name, class_name, seat_number')
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')

  // sessionIdが指定されていればそのセッションを、なければ最新を取得
  // is_submitted=true に限定しない（古いRLSブロック済みデータも対象にする）
  let query = admin
    .from('sessions')
    .select('id, test_id, score, submitted_at, tests(title, status, mode, published_classes, published_student_ids)')
    .eq('student_id', student.id)

  if (sessionId) {
    query = query.eq('id', sessionId)
  } else {
    query = query.order('is_submitted', { ascending: false }).order('started_at', { ascending: false }).limit(1)
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

  const test = session.tests as {
    title: string; status: string; mode: number
    published_classes: string[] | null; published_student_ids: string[] | null
  } | null

  if (!test || !canSeeResult(test, student.class_name, student.id)) {
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

  const { data: rawAnswers } = await admin
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
      flagged: (a.flagged ?? false) as boolean,
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
