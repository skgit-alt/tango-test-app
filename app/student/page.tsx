import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { calcPoints, canSeeResult } from '@/lib/supabase/types'
import { Chart300, Chart50 } from './ScoreChart'
import ActiveTestBanner from './ActiveTestBanner'

export default async function StudentHomePage() {
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

  const admin = createAdminClient()

  // 配信中テストを全件取得（RLSバイパス）
  const { data: activeTests } = await admin
    .from('tests')
    .select('id, title, mode, status, open_classes, published_classes, published_student_ids')
    .in('status', ['waiting', 'open'])
    .order('created_at', { ascending: false })

  // 配信中テストのセッション情報（初期表示用）
  const activeTestIds = (activeTests ?? []).map((t) => t.id)
  const { data: activeSessions } = activeTestIds.length > 0
    ? await admin
        .from('sessions')
        .select('id, test_id, is_submitted, score')
        .eq('student_id', student.id)
        .in('test_id', activeTestIds)
    : { data: [] }
  const activeSessionMap = Object.fromEntries(
    (activeSessions ?? []).map((s) => [s.test_id, s])
  )
  const initialTestsWithSessions = (activeTests ?? []).map((t) => ({
    ...t,
    mySession: activeSessionMap[t.id] ?? null,
    _canSeeResult: canSeeResult(t, student.class_name, student.id),
  }))

  // 最新テスト（結果表示用・ポイント表示用）
  const { data: latestTest } = await admin
    .from('tests')
    .select('id, title, mode, status, open_classes, published_classes, published_student_ids')
    .in('status', ['waiting', 'open', 'finished', 'published'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 過去の全提出済みセッションを取得（グラフ・履歴用）
  const { data: pastSessions } = await admin
    .from('sessions')
    .select('id, score, submitted_at, tests(id, title, mode, status, pass_score)')
    .eq('student_id', student.id)
    .eq('is_submitted', true)
    .order('submitted_at', { ascending: false })

  // 最新テスト専用：この生徒がテストを開始したかつ結果が公開されているか確認
  const studentCanSeeLatest = latestTest
    ? canSeeResult(latestTest as any, student.class_name, student.id)
    : false

  const { data: latestTestSession } = studentCanSeeLatest && latestTest
    ? await admin
        .from('sessions')
        .select('id, is_submitted')
        .eq('student_id', student.id)
        .eq('test_id', latestTest.id)
        .maybeSingle()
    : { data: null }

  const publishedSessions = (pastSessions ?? []).filter(
    (s) => (s.tests as any)?.status === 'published'
  )
  const sessions300 = publishedSessions.filter((s) => (s.tests as any)?.mode === 300)
  const sessions50 = publishedSessions
    .filter((s) => (s.tests as any)?.mode === 50)
    .map((s) => ({ ...s, points: calcPoints(s.score ?? 0) }))

  // 50問モードのアクティブテストがあればポイント情報を取得
  const has50modeActive = (activeTests ?? []).some((t) => t.mode === 50)
  let totalPoints = 0
  let rank = 0

  if (has50modeActive || latestTest?.mode === 50) {
    // ランキング設定を取得
    const { data: rankingSettings } = await admin
      .from('ranking_settings')
      .select('from_round, to_round')
      .eq('id', 1)
      .maybeSingle()

    if (rankingSettings) {
      // 期間内の対象テストIDを取得
      const { data: targetTests } = await admin
        .from('tests')
        .select('id')
        .eq('mode', 50)
        .gte('round_number', rankingSettings.from_round)
        .lte('round_number', rankingSettings.to_round)
        .not('round_number', 'is', null)

      if (targetTests && targetTests.length > 0) {
        const testIds = targetTests.map((t: { id: string }) => t.id)
        const { data: allPoints } = await admin
          .from('points')
          .select('student_id, points_earned')
          .in('test_id', testIds)

        if (allPoints && allPoints.length > 0) {
          const grouped: Record<string, number> = {}
          allPoints.forEach((p: { student_id: string; points_earned: number }) => {
            grouped[p.student_id] = (grouped[p.student_id] ?? 0) + p.points_earned
          })

          totalPoints = grouped[student.id] ?? 0
          const sorted = Object.values(grouped).sort((a, b) => b - a)
          const rankIndex = sorted.findIndex((pts) => pts <= totalPoints)
          rank = rankIndex + 1
        }
      }
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

          {(has50modeActive || latestTest?.mode === 50) && (
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

        {/* テスト一覧バナー（3秒ごとにポーリングして自動更新） */}
        <ActiveTestBanner
          studentClass={student.class_name}
          initialTests={initialTestsWithSessions as any}
        />

        {/* アクションボタン */}
        <div className="space-y-3">
          <Link
            href="/student/ranking"
            className="block w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-2xl font-semibold text-center hover:bg-gray-50 active:bg-gray-100 transition"
          >
            ランキングを見る
          </Link>

          {latestTest && latestTest.status === 'published' && latestTestSession && (
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
