import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { calcPoints } from '@/lib/supabase/types'

interface RankEntry {
  rank: number
  test_name: string
  score: number | null
  points: number | null
}

interface TotalRankEntry {
  rank: number
  test_name: string
  total_points: number
}

export default async function RankingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: student } = await supabase
    .from('students')
    .select('id, name, class_name, seat_number, test_name')
    .eq('email', user.email)
    .single()

  if (!student) redirect('/auth/login')

  // 最新のpublished テスト
  const { data: latestTest } = await supabase
    .from('tests')
    .select('id, title, mode, status')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 今回のランキング（最新テスト）
  let currentRanking: RankEntry[] = []

  if (latestTest) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('student_id, score, students(test_name)')
      .eq('test_id', latestTest.id)
      .eq('is_submitted', true)
      .not('score', 'is', null)

    if (sessions) {
      const ranked = sessions
        .filter((s) => {
          const st = s.students as { test_name: string | null } | { test_name: string | null }[] | null
          const stObj = Array.isArray(st) ? st[0] : st
          return stObj?.test_name
        })
        .map((s) => {
          const st = s.students as { test_name: string | null } | { test_name: string | null }[] | null
          const stObj = Array.isArray(st) ? st[0] : st
          const score = s.score as number
          const pts = latestTest.mode === 50 ? calcPoints(score) : null
          return {
            test_name: stObj?.test_name ?? '',
            score,
            points: pts,
          }
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 30)
        .map((entry, i) => ({ ...entry, rank: i + 1 }))

      currentRanking = ranked
    }
  }

  // 通算ポイントランキング（50問モード用）
  const { data: allPoints } = await supabase
    .from('points')
    .select('student_id, points_earned, cycle, students(test_name)')

  let totalRanking: TotalRankEntry[] = []

  if (allPoints && allPoints.length > 0) {
    const maxCycle = allPoints.reduce((m, p) => Math.max(m, p.cycle), 1)
    const cyclePts = allPoints.filter((p) => p.cycle === maxCycle)

    const grouped: Record<string, { test_name: string; total: number }> = {}
    cyclePts.forEach((p) => {
      const st = p.students as { test_name: string | null } | { test_name: string | null }[] | null
      const stObj = Array.isArray(st) ? st[0] : st
      if (!stObj?.test_name) return
      if (!grouped[p.student_id]) {
        grouped[p.student_id] = { test_name: stObj.test_name ?? '', total: 0 }
      }
      grouped[p.student_id].total += p.points_earned
    })

    totalRanking = Object.values(grouped)
      .sort((a, b) => b.total - a.total)
      .slice(0, 30)
      .map((entry, i) => ({
        rank: i + 1,
        test_name: entry.test_name,
        total_points: entry.total,
      }))
  }

  // 自分の順位を検索
  const myCurrentRank = currentRanking.find((r) => r.test_name === student.test_name)
  const myTotalRank = totalRanking.find((r) => r.test_name === student.test_name)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
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

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* 自分の成績サマリー */}
        {(myCurrentRank || myTotalRank) && (
          <div className="bg-blue-600 text-white rounded-2xl p-5">
            <p className="text-blue-200 text-sm mb-2">あなたの成績 ({student.test_name})</p>
            <div className="flex gap-6">
              {myCurrentRank && (
                <div>
                  <p className="text-2xl font-bold">{myCurrentRank.rank}位</p>
                  <p className="text-blue-200 text-xs">今回のテスト</p>
                </div>
              )}
              {myTotalRank && (
                <div>
                  <p className="text-2xl font-bold">{myTotalRank.total_points}pt</p>
                  <p className="text-blue-200 text-xs">通算ポイント ({myTotalRank.rank}位)</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 今回のランキング */}
        {latestTest && currentRanking.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">今回のランキング</h2>
              <p className="text-xs text-gray-400 mt-0.5">{latestTest.title}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {currentRanking.map((entry) => {
                const isMe = entry.test_name === student.test_name
                return (
                  <div
                    key={entry.rank}
                    className={`flex items-center gap-4 px-5 py-3 ${isMe ? 'bg-blue-50' : ''}`}
                  >
                    <span className={`w-8 text-center font-bold shrink-0 ${
                      entry.rank === 1 ? 'text-yellow-500 text-lg' :
                      entry.rank === 2 ? 'text-gray-400' :
                      entry.rank === 3 ? 'text-amber-600' :
                      'text-gray-400 text-sm'
                    }`}>
                      {entry.rank}
                    </span>
                    <span className={`flex-1 font-medium ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
                      {entry.test_name}
                      {isMe && <span className="text-xs text-blue-500 ml-2">(あなた)</span>}
                    </span>
                    <span className="text-gray-800 font-semibold">{entry.score}点</span>
                    {entry.points !== null && (
                      <span className="text-blue-600 font-bold text-sm w-14 text-right">
                        +{entry.points}pt
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 通算ポイントランキング */}
        {totalRanking.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">通算ポイントランキング</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {totalRanking.map((entry) => {
                const isMe = entry.test_name === student.test_name
                return (
                  <div
                    key={entry.rank}
                    className={`flex items-center gap-4 px-5 py-3 ${isMe ? 'bg-blue-50' : ''}`}
                  >
                    <span className={`w-8 text-center font-bold shrink-0 ${
                      entry.rank === 1 ? 'text-yellow-500 text-lg' :
                      entry.rank === 2 ? 'text-gray-400' :
                      entry.rank === 3 ? 'text-amber-600' :
                      'text-gray-400 text-sm'
                    }`}>
                      {entry.rank}
                    </span>
                    <span className={`flex-1 font-medium ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
                      {entry.test_name}
                      {isMe && <span className="text-xs text-blue-500 ml-2">(あなた)</span>}
                    </span>
                    <span className="text-blue-600 font-bold">{entry.total_points}pt</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {currentRanking.length === 0 && totalRanking.length === 0 && (
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
