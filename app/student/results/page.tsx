import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { calcPoints, canSeeResult } from '@/lib/supabase/types'

export default async function ResultsPage() {
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

  // 正式な提出済みセッションを取得（練習除外）
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, score, submitted_at, tests(id, title, mode, status, pass_score, published_classes, published_student_ids)')
    .eq('student_id', student.id)
    .eq('is_submitted', true)
    .neq('is_practice', true)
    .order('submitted_at', { ascending: false })

  // 結果閲覧可能なセッションのみ絞り込み
  const visibleSessions = (sessions ?? []).filter((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const test = s.tests as any
    if (!test) return false
    return canSeeResult(test, student.class_name, student.id)
  })

  const sessions300 = visibleSessions.filter((s) => (s.tests as any)?.mode === 300)
  const sessions50 = visibleSessions.filter((s) => (s.tests as any)?.mode === 50)

  return (
    <div className="min-h-screen bg-blue-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/student" className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-bold text-gray-800">テストの結果</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {visibleSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 font-medium">まだ結果がありません</p>
            <p className="text-gray-400 text-sm mt-1">先生が結果を公開すると、ここに表示されます</p>
            <Link href="/student" className="mt-6 inline-block text-blue-600 text-sm hover:underline">
              ホームに戻る
            </Link>
          </div>
        ) : (
          <>
            {/* 300問テストの結果 */}
            {sessions300.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-500 mb-3 px-1">📝 300問テスト</h2>
                <div className="space-y-2">
                  {sessions300.map((s) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const test = s.tests as any
                    const passed = test.pass_score !== null ? (s.score ?? 0) >= test.pass_score : null
                    return (
                      <Link
                        key={s.id}
                        href={`/student/result?sessionId=${s.id}`}
                        className="block bg-white rounded-2xl border border-gray-200 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-800 text-sm">{test.title}</p>
                            <p className="text-xs text-gray-400">
                              {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('ja-JP') : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-800 text-lg">{s.score}点</p>
                            {passed !== null && (
                              <p className={`text-xs font-medium ${passed ? 'text-green-600' : 'text-red-500'}`}>
                                {passed ? '合格' : '不合格'}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 50問テストの結果 */}
            {sessions50.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-500 mb-3 px-1">⚡ 50問テスト</h2>
                <div className="space-y-2">
                  {sessions50.map((s) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const test = s.tests as any
                    const pts = calcPoints(s.score ?? 0)
                    return (
                      <Link
                        key={s.id}
                        href={`/student/result?sessionId=${s.id}`}
                        className="block bg-white rounded-2xl border border-gray-200 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-800 text-sm">{test.title}</p>
                            <p className="text-xs text-gray-400">
                              {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('ja-JP') : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-800 text-lg">{s.score}点</p>
                            <p className="text-xs text-blue-600 font-medium">+{pts}pt</p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 text-center">
              <Link href="/student" className="text-blue-600 text-sm hover:underline">
                ホームに戻る
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
