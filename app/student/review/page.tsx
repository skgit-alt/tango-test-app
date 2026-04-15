import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Question } from '@/lib/supabase/types'
import Link from 'next/link'

interface AnswerWithQuestion {
  question_id: string
  selected_answer: number | null
  is_correct: boolean | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  questions: any
}

export default async function ReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: student } = await supabase
    .from('students')
    .select('id, name, class_name, seat_number')
    .eq('email', user.email)
    .single()

  if (!student) redirect('/auth/login')

  // 最新の提出済みセッション
  const { data: session } = await supabase
    .from('sessions')
    .select('id, test_id, score, submitted_at, tests(title, status, mode)')
    .eq('student_id', student.id)
    .eq('is_submitted', true)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

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

  const test = session.tests as { title: string; status: string; mode: number } | { title: string; status: string; mode: number }[] | null
  const testObj = Array.isArray(test) ? test[0] : test

  // 結果公開前は確認できない
  if (testObj?.status !== 'published') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm w-full space-y-3">
          <div className="text-4xl">🔒</div>
          <p className="text-gray-700 font-medium">結果が公開されるまで確認できません</p>
          <Link href="/student/waiting-result" className="text-blue-600 text-sm hover:underline">
            待機画面に戻る
          </Link>
        </div>
      </div>
    )
  }

  // 回答を取得
  const { data: answers } = await supabase
    .from('answers')
    .select('question_id, selected_answer, is_correct, questions(*)')
    .eq('session_id', session.id)
    .order('questions(order_num)')

  const sortedAnswers = ((answers as AnswerWithQuestion[]) ?? [])
    .filter((a) => a.questions)
    .sort((a, b) => (a.questions?.order_num ?? 0) - (b.questions?.order_num ?? 0))

  const correctCount = sortedAnswers.filter((a) => a.is_correct).length
  const totalCount = sortedAnswers.length

  const choiceLabel = (n: number) => ['①', '②', '③', '④', '⑤'][n - 1] ?? `${n}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-blue-600 text-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/student/result" className="text-blue-200 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="font-bold text-lg">回答確認</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-blue-200 ml-8">
            <span>{testObj?.title}</span>
            <span>正解: {correctCount} / {totalCount}</span>
            <span>{session.score}点</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {sortedAnswers.map((a) => {
          const q = a.questions!
          const isCorrect = a.is_correct
          const selected = a.selected_answer

          const allChoices = [
            { num: 1, text: q.choice1 },
            { num: 2, text: q.choice2 },
            { num: 3, text: q.choice3 },
            { num: 4, text: q.choice4 },
            { num: 5, text: q.choice5 },
          ].filter((c) => c.text && c.text !== 'None' && c.text !== 'null')

          return (
            <div
              key={a.question_id}
              className={`bg-white rounded-2xl border-2 overflow-hidden ${
                isCorrect ? 'border-green-200' : 'border-red-200'
              }`}
            >
              {/* 問題ヘッダー */}
              <div className={`px-5 py-3 flex items-center gap-2 ${
                isCorrect ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <span className={`text-lg font-bold ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                  {isCorrect ? '✅' : '❌'}
                </span>
                <span className="text-sm font-medium text-gray-600">
                  問題 {q.order_num}
                </span>
                <span className="ml-auto text-xs text-gray-400">{q.points}点</span>
              </div>

              {/* 問題文 */}
              <div className="px-5 py-4">
                <p className="text-gray-800 font-medium mb-4 leading-relaxed">{q.question_text}</p>

                {/* 選択肢 */}
                <div className="space-y-2">
                  {allChoices.map((choice) => {
                    const isSelected = selected === choice.num
                    const isAnswer = q.correct_answer === choice.num

                    let className = 'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm'

                    if (isSelected && isCorrect) {
                      className += ' border-green-400 bg-green-50 text-green-800 font-medium'
                    } else if (isSelected && !isCorrect) {
                      className += ' border-red-400 bg-red-50 text-red-700 line-through'
                    } else if (isAnswer && !isCorrect) {
                      className += ' border-green-400 bg-green-50 text-green-800 font-medium'
                    } else {
                      className += ' border-gray-100 text-gray-600'
                    }

                    return (
                      <div key={choice.num} className={className}>
                        <span className="text-gray-400 text-xs shrink-0">{choiceLabel(choice.num)}</span>
                        <span className="flex-1">{choice.text}</span>
                        {isSelected && isCorrect && (
                          <span className="text-green-600 text-xs font-bold shrink-0">✓ あなたの回答</span>
                        )}
                        {isSelected && !isCorrect && (
                          <span className="text-red-500 text-xs shrink-0">✗ あなたの回答</span>
                        )}
                        {!isSelected && isAnswer && (
                          <span className="text-green-600 text-xs font-bold shrink-0">正解</span>
                        )}
                      </div>
                    )
                  })}

                  {selected === null && (
                    <p className="text-xs text-gray-400 px-2">未回答</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <div className="py-4 text-center">
          <Link
            href="/student/result"
            className="text-blue-600 hover:underline text-sm"
          >
            結果画面に戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
