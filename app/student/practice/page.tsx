import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function PracticePage() {
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

  // 提出済みの練習セッションを新しい順に取得
  const { data: allPracticeSessions } = await admin
    .from('sessions')
    .select('id, test_id, score, submitted_at, tests(id, title, mode, pass_score)')
    .eq('student_id', student.id)
    .eq('is_submitted', true)
    .eq('is_practice', true)
    .order('submitted_at', { ascending: false })

  // テストIDごとに最新の1件だけ残す
  const seen = new Set<string>()
  const latestSessions = (allPracticeSessions ?? []).filter((s) => {
    if (seen.has(s.test_id)) return false
    seen.add(s.test_id)
    return true
  })

  return (
    <div className="min-h-screen bg-blue-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/student" className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-bold text-gray-800">練習の結果</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {latestSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-4xl mb-3">🔄</p>
            <p className="text-gray-500 font-medium">まだ練習記録がありません</p>
            <p className="text-gray-400 text-sm mt-1">テストの結果画面から練習を始めましょう</p>
            <Link
              href="/student"
              className="mt-6 inline-block text-blue-600 text-sm hover:underline"
            >
              ホームに戻る
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 px-1">テストごとの最新の練習結果を表示しています</p>
            <div className="space-y-3">
              {latestSessions.map((s) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const test = (s.tests as any) as { id: string; title: string; mode: number; pass_score: number | null } | null
                if (!test) return null
                const passed = test.pass_score !== null ? (s.score ?? 0) >= test.pass_score : null
                return (
                  <Link
                    key={s.id}
                    href={`/student/result?sessionId=${s.id}`}
                    className="block bg-white rounded-2xl border border-gray-200 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                            練習
                          </span>
                          <p className="font-semibold text-gray-800 text-sm">{test.title}</p>
                        </div>
                        <p className="text-xs text-gray-400">
                          {s.submitted_at
                            ? new Date(s.submitted_at).toLocaleString('ja-JP', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
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
