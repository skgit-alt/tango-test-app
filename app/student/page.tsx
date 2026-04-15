import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { calcPoints } from '@/lib/supabase/types'
import { Chart300, Chart50 } from './ScoreChart'

export default async function StudentHomePage() {
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
  const { data: activeTest } = await supabase
    .from('tests')
    .select('id, title, mode, status')
    .in('status', ['waiting', 'open', 'finished', 'published'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 過去の全提出済みセッションを取得
  const { data: pastSessions } = await supabase
    .from('sessions')
    .select('id, score, submitted_at, tests(id, title, mode, status, pass_score)')
    .eq('student_id', student.id)
    .eq('is_submitted', true)
    .order('submitted_at', { ascending: false })

  const publishedSessions = (pastSessions ?? []).filter(
    (s) => (s.tests as any)?.status === 'published'
  )
  const sessions300 = publishedSessions.filter((s) => (s.tests as any)?.mode === 300)
  const sessions50 = publishedSessions
    .filter((s) => (s.tests as any)?.mode === 50)
    .map((s) => ({ ...s, points: calcPoints(s.score ?? 0) }))

  // 50問モードの場合はポイント情報を取得
  let totalPoints = 0
  let rank = 0

  if (activeTest?.mode === 50) {
    const { data: allPoints } = await supabase
      .from('points')
      .select('student_id, points_earned, cycle')

    if (allPoints && allPoints.length > 0) {
      const maxCycle = allPoints.reduce((m, p) => Math.max(m, p.cycle), 1)
      const cyclePts = allPoints.filter((p) => p.cycle === maxCycle)

      const grouped: Record<string, number> = {}
      cyclePts.forEach((p) => {
        grouped[p.student_id] = (grouped[p.student_id] ?? 0) + p.points_earned
      })

      totalPoints = grouped[student.id] ?? 0

      const sorted = Object.values(grouped).sort((a, b) => b - a)
      const rankIndex = sorted.findIndex((pts) => pts <= totalPoints)
      rank = rankIndex + 1
    }
  }

  const logoutAction = async () => {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-blue-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-blue-600">単語テストアプリ</span>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-gray-500 hover:text-red-500 transition">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-8 space-y-6">
        {/* プロフィールカード */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">
                {student.class_name} &nbsp; {student.seat_number}番
              </p>
              <h2 className="text-2xl font-bold text-gray-800">{student.name}</h2>
              <p className="text-sm text-blue-600 mt-1">テストネーム: {student.test_name}</p>
            </div>
            <div className="text-4xl">👤</div>
          </div>

          {activeTest?.mode === 50 && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{totalPoints}pt</p>
                <p className="text-xs text-gray-500 mt-0.5">通算ポイント</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{rank > 0 ? `${rank}位` : '-'}</p>
                <p className="text-xs text-gray-500 mt-0.5">現在の順位</p>
              </div>
            </div>
          )}
        </div>

        {/* テスト情報 */}
        {activeTest && (
          <div className="bg-blue-600 rounded-2xl p-5 text-white">
            <p className="text-blue-200 text-sm mb-1">実施中のテスト</p>
            <p className="font-bold text-lg">{activeTest.title}</p>
            <p className="text-blue-200 text-sm mt-1">{activeTest.mode}問モード</p>
          </div>
        )}

        {/* アクションボタン */}
        <div className="space-y-3">
          {activeTest && (activeTest.status === 'waiting' || activeTest.status === 'open') && (
            <Link
              href="/student/waiting"
              className="block w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-center text-lg hover:bg-blue-700 active:bg-blue-800 transition shadow-md"
            >
              テスト待機画面へ
            </Link>
          )}

          <Link
            href="/student/ranking"
            className="block w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-2xl font-semibold text-center hover:bg-gray-50 active:bg-gray-100 transition"
          >
            ランキングを見る
          </Link>

          {activeTest && activeTest.status === 'published' && (
            <Link
              href="/student/result"
              className="block w-full bg-green-600 text-white py-3 rounded-2xl font-semibold text-center hover:bg-green-700 transition"
            >
              今回の結果を見る
            </Link>
          )}
        </div>

        {/* グラフ */}
        {sessions300.length >= 2 && (
          <Chart300 sessions={sessions300 as any} />
        )}
        {sessions50.length >= 2 && (
          <Chart50 sessions={sessions50 as any} />
        )}

        {/* 過去の結果 - 300問テスト */}
        {sessions300.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-3 px-1">📝 300問テストの結果</h3>
            <div className="space-y-2">
              {sessions300.map((s) => {
                const test = s.tests as any
                const passed = test.pass_score !== null ? s.score >= test.pass_score : null
                return (
                  <Link
                    key={s.id}
                    href={`/student/result?sessionId=${s.id}`}
                    className="block bg-white rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{test.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(s.submitted_at).toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-800">{s.score}点</p>
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

        {/* 過去の結果 - 50問テスト */}
        {sessions50.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-3 px-1">⚡ 50問テストの結果</h3>
            <div className="space-y-2">
              {sessions50.map((s) => {
                const test = s.tests as any
                return (
                  <Link
                    key={s.id}
                    href={`/student/result?sessionId=${s.id}`}
                    className="block bg-white rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{test.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(s.submitted_at).toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-800">{s.score}点</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  )
}
