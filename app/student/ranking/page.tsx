import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcPoints } from '@/lib/supabase/types'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import RankingView, { type RankEntry, type Settings, type ClassAvg } from './RankingView'

// ─── ランキングデータ取得ロジック ─────────────────────────────────────────────

async function fetchRankingData(
  admin: ReturnType<typeof createAdminClient>,
  is20: boolean
): Promise<{
  settings: Settings | null
  rounds: number[]
  ranking: RankEntry[]
  classAverages: ClassAvg[]
}> {
  const settingsId = is20 ? 2 : 1

  const { data: settings } = await admin
    .from('ranking_settings')
    .select('*')
    .eq('id', settingsId)
    .maybeSingle()

  if (!settings) {
    return { settings: null, rounds: [], ranking: [], classAverages: [] }
  }

  // 対象テストを取得
  let testsQuery = admin
    .from('tests')
    .select('id, round_number, mode')
    .gte('round_number', settings.from_round)
    .lte('round_number', settings.to_round)
    .not('round_number', 'is', null)

  if (is20) {
    testsQuery = testsQuery.neq('mode', 50).neq('mode', 300)
  } else {
    testsQuery = testsQuery.eq('mode', 50)
  }

  const { data: targetTests } = await testsQuery

  if (!targetTests || targetTests.length === 0) {
    return { settings, rounds: [], ranking: [], classAverages: [] }
  }

  const testIds = targetTests.map((t: { id: string }) => t.id)
  const testRoundMap: Record<string, number> = {}
  for (const t of targetTests as { id: string; round_number: number }[]) {
    testRoundMap[t.id] = t.round_number
  }

  const rounds = Array.from(
    new Set(targetTests.map((t: { round_number: number }) => t.round_number))
  ).sort((a, b) => a - b)

  // ─── 個人ランキング ─────────────────────────────────────────────────────────

  interface StudentInfo {
    name: string
    class_name: string
    seat_number: number
    test_name: string
    roundValues: Record<string, number>
    total: number
  }

  const grouped: Record<string, StudentInfo> = {}

  // 共通: sessions テーブルから集計（50Q: calcPoints換算ポイント / 20Q: スコアそのまま）
  // 実験用クラス（数字・英字どちらでも始まらないクラス）は除外
  {
    const { data: sessions } = await admin
      .from('sessions')
      .select('student_id, test_id, score, students(name, class_name, seat_number, test_name)')
      .in('test_id', testIds)
      .eq('is_submitted', true)
      .not('score', 'is', null)

    if (sessions && sessions.length > 0) {
      const bestScores: Record<string, { score: number; student_id: string; test_id: string; students: unknown }> = {}
      for (const s of sessions as { student_id: string; test_id: string; score: number; students: unknown }[]) {
        const key = `${s.student_id}_${s.test_id}`
        if (!bestScores[key] || s.score > bestScores[key].score) {
          bestScores[key] = s
        }
      }

      for (const s of Object.values(bestScores)) {
        const st = Array.isArray(s.students)
          ? (s.students as { name: string; class_name: string; seat_number: number; test_name: string }[])[0]
          : s.students as { name: string; class_name: string; seat_number: number; test_name: string } | null
        if (!st) continue

        // クラスフィルタ: 実験用クラスを除外
        const className = st.class_name ?? ''
        if (is20) {
          if (!/^\d/.test(className)) continue   // 20Q: 数字始まりのみ
        } else {
          if (!/^[A-Za-z]/.test(className)) continue  // 50Q: 英字始まりのみ
        }

        const round = testRoundMap[s.test_id]
        if (!round) continue

        // 50Q はポイント換算、20Q はスコアそのまま
        const value = is20 ? s.score : calcPoints(s.score)

        if (!grouped[s.student_id]) {
          grouped[s.student_id] = {
            name: st.name ?? '',
            class_name: className,
            seat_number: st.seat_number ?? 0,
            test_name: st.test_name ?? '',
            roundValues: {},
            total: 0,
          }
        }

        // 同じラウンドに複数テストある場合は最高値
        const existing = grouped[s.student_id].roundValues[String(round)] ?? 0
        if (value > existing) {
          grouped[s.student_id].total += value - existing
          grouped[s.student_id].roundValues[String(round)] = value
        }
      }
    }
  }

  const ranking: RankEntry[] = Object.entries(grouped)
    .map(([student_id, v]) => ({ student_id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))

  // ─── クラス平均点グラフ ─────────────────────────────────────────────────────

  const classAverages: ClassAvg[] = []

  const { data: allSessions } = await admin
    .from('sessions')
    .select('student_id, test_id, score, students(class_name)')
    .in('test_id', testIds)
    .eq('is_submitted', true)
    .not('score', 'is', null)

  if (allSessions && allSessions.length > 0) {
    const bestScoreMap: Record<string, { score: number; test_id: string; class_name: string }> = {}
    for (const s of allSessions as { student_id: string; test_id: string; score: number; students: unknown }[]) {
      const st = Array.isArray(s.students)
        ? (s.students as { class_name: string }[])[0]
        : s.students as { class_name: string } | null
      const className = st?.class_name ?? ''

      if (is20) {
        if (!/^\d/.test(className)) continue
      } else {
        if (!/^[A-Za-z]/.test(className)) continue
      }

      const key = `${s.student_id}_${s.test_id}`
      if (!bestScoreMap[key] || s.score > bestScoreMap[key].score) {
        bestScoreMap[key] = { score: s.score, test_id: s.test_id, class_name: className }
      }
    }

    const roundClassScores: Record<number, Record<string, number[]>> = {}
    for (const { score, test_id, class_name } of Object.values(bestScoreMap)) {
      const round = testRoundMap[test_id]
      if (!round) continue
      if (!roundClassScores[round]) roundClassScores[round] = {}
      if (!roundClassScores[round][class_name]) roundClassScores[round][class_name] = []
      roundClassScores[round][class_name].push(score)
    }

    for (const round of rounds) {
      const classes: Record<string, number> = {}
      const classScores = roundClassScores[round] ?? {}
      for (const [cls, scores] of Object.entries(classScores)) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length
        classes[cls] = Math.round(avg * 10) / 10
      }
      classAverages.push({ round, classes })
    }
  }

  return { settings, rounds, ranking, classAverages }
}

// ─── ページコンポーネント ─────────────────────────────────────────────────────

export default async function RankingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: student } = await supabase
    .from('students')
    .select('id, name, class_name, seat_number, test_name')
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')

  const admin = createAdminClient()
  const className = student.class_name ?? ''

  // クラス名の最初の文字でモードを判定
  const show50 = /^[A-Za-z]/.test(className)
  const show20 = /^\d/.test(className)
  const showBoth = !show50 && !show20

  // データ取得
  const [data50, data20] = await Promise.all([
    (show50 || showBoth) ? fetchRankingData(admin, false) : Promise.resolve(null),
    (show20 || showBoth) ? fetchRankingData(admin, true) : Promise.resolve(null),
  ])

  const myTestName = student.test_name ?? ''

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/student" className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-bold text-gray-800">ランキング</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        {/* 50問ポイントランキング */}
        {data50 && (
          <section>
            {showBoth && (
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                ⚡ 50問ポイントランキング
              </h2>
            )}
            <RankingView
              mode={50}
              settings={data50.settings}
              rounds={data50.rounds}
              ranking={data50.ranking}
              classAverages={data50.classAverages}
              myTestName={myTestName}
              label="ポイントランキング"
            />
          </section>
        )}

        {/* 20問スコアランキング */}
        {data20 && (
          <section>
            {showBoth && (
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                📄 20問スコアランキング
              </h2>
            )}
            <RankingView
              mode={20}
              settings={data20.settings}
              rounds={data20.rounds}
              ranking={data20.ranking}
              classAverages={data20.classAverages}
              myTestName={myTestName}
              label="スコアランキング"
            />
          </section>
        )}

        {!data50 && !data20 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
            <p>まだランキングデータがありません</p>
          </div>
        )}

        <div className="pb-4 text-center">
          <Link href="/student" className="text-blue-600 text-sm hover:underline">
            ホームに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
