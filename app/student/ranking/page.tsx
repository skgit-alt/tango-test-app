import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')

  const admin = createAdminClient()

  // 譛譁ｰ縺ｮ published 繝・せ繝・  const { data: latestTest } = await admin
    .from('tests')
    .select('id, title, mode, status')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 莉雁屓縺ｮ繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ・域怙譁ｰ繝・せ繝茨ｼ・  let currentRanking: RankEntry[] = []

  if (latestTest) {
    const { data: sessions } = await admin
      .from('sessions')
      .select('student_id, score, students(test_name)')
      .eq('test_id', latestTest.id)
      .eq('is_submitted', true)
      .not('score', 'is', null)

    if (sessions) {
      currentRanking = sessions
        .filter((s) => {
          const st = s.students as { test_name: string | null } | { test_name: string | null }[] | null
          const stObj = Array.isArray(st) ? st[0] : st
          return stObj?.test_name
        })
        .map((s) => {
          const st = s.students as { test_name: string | null } | { test_name: string | null }[] | null
          const stObj = Array.isArray(st) ? st[0] : st
          const score = s.score as number
          return {
            test_name: stObj?.test_name ?? '',
            score,
            points: latestTest.mode === 50 ? calcPoints(score) : null,
          }
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 30)
        .map((entry, i) => ({ ...entry, rank: i + 1 }))
    }
  }

  // 繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ險ｭ螳壹ｒ蜿門ｾ・  const { data: rankingSettings } = await admin
    .from('ranking_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  // 騾夂ｮ励・繧､繝ｳ繝医Λ繝ｳ繧ｭ繝ｳ繧ｰ・郁ｨｭ螳壹＆繧後◆譛滄俣蜀・ｼ・  let totalRanking: TotalRankEntry[] = []
  let settingsLabel = ''

  if (rankingSettings) {
    settingsLabel = rankingSettings.label || `隨ｬ${rankingSettings.from_round}蝗槭懃ｬｬ${rankingSettings.to_round}蝗杼

    // 蟇ｾ雎｡繝・せ繝・D・・0蝠上Δ繝ｼ繝峨・round_number 縺檎ｯ・峇蜀・ｼ・    const { data: targetTests } = await admin
      .from('tests')
      .select('id')
      .eq('mode', 50)
      .gte('round_number', rankingSettings.from_round)
      .lte('round_number', rankingSettings.to_round)
      .not('round_number', 'is', null)

    if (targetTests && targetTests.length > 0) {
      const testIds = targetTests.map((t: { id: string }) => t.id)

      const { data: points } = await admin
        .from('points')
        .select('student_id, points_earned, students(test_name)')
        .in('test_id', testIds)

      if (points && points.length > 0) {
        const grouped: Record<string, { test_name: string; total: number }> = {}
        points.forEach((p: any) => {
          const st = Array.isArray(p.students) ? p.students[0] : p.students
          if (!st?.test_name) return
          if (!grouped[p.student_id]) {
            grouped[p.student_id] = { test_name: st.test_name, total: 0 }
          }
          grouped[p.student_id].total += p.points_earned
        })

        totalRanking = Object.values(grouped)
          .sort((a, b) => b.total - a.total)
          .slice(0, 30)
          .map((entry, i) => ({ rank: i + 1, test_name: entry.test_name, total_points: entry.total }))
      }
    }
  }

  const myCurrentRank = currentRanking.find((r) => r.test_name === student.test_name)
  const myTotalRank = totalRanking.find((r) => r.test_name === student.test_name)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/student" className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-bold text-gray-800">繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* 閾ｪ蛻・・謌千ｸｾ繧ｵ繝槭Μ繝ｼ */}
        {(myCurrentRank || myTotalRank) && (
          <div className="bg-blue-600 text-white rounded-2xl p-5">
            <p className="text-blue-200 text-sm mb-2">縺ゅ↑縺溘・謌千ｸｾ ({student.test_name})</p>
            <div className="flex gap-6">
              {myCurrentRank && (
                <div>
                  <p className="text-2xl font-bold">{myCurrentRank.rank}菴・/p>
                  <p className="text-blue-200 text-xs">莉雁屓縺ｮ繝・せ繝・/p>
                </div>
              )}
              {myTotalRank && (
                <div>
                  <p className="text-2xl font-bold">{myTotalRank.total_points}pt</p>
                  <p className="text-blue-200 text-xs">騾夂ｮ・({myTotalRank.rank}菴・</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 莉雁屓縺ｮ繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ */}
        {latestTest && currentRanking.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">莉雁屓縺ｮ繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ</h2>
              <p className="text-xs text-gray-400 mt-0.5">{latestTest.title}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {currentRanking.map((entry) => {
                const isMe = entry.test_name === student.test_name
                return (
                  <div key={entry.rank} className={`flex items-center gap-4 px-5 py-3 ${isMe ? 'bg-blue-50' : ''}`}>
                    <span className={`w-8 text-center font-bold shrink-0 ${
                      entry.rank === 1 ? 'text-yellow-500 text-lg' :
                      entry.rank === 2 ? 'text-gray-400' :
                      entry.rank === 3 ? 'text-amber-600' : 'text-gray-400 text-sm'
                    }`}>{entry.rank}</span>
                    <span className={`flex-1 font-medium ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
                      {entry.test_name}
                      {isMe && <span className="text-xs text-blue-500 ml-2">(縺ゅ↑縺・</span>}
                    </span>
                    <span className="text-gray-800 font-semibold">{entry.score}轤ｹ</span>
                    {entry.points !== null && (
                      <span className="text-blue-600 font-bold text-sm w-14 text-right">+{entry.points}pt</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 騾夂ｮ励・繧､繝ｳ繝医Λ繝ｳ繧ｭ繝ｳ繧ｰ */}
        {totalRanking.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">騾夂ｮ励・繧､繝ｳ繝医Λ繝ｳ繧ｭ繝ｳ繧ｰ</h2>
              {settingsLabel && <p className="text-xs text-gray-400 mt-0.5">{settingsLabel}縺ｮ蜷郁ｨ・/p>}
            </div>
            <div className="divide-y divide-gray-50">
              {totalRanking.map((entry) => {
                const isMe = entry.test_name === student.test_name
                return (
                  <div key={entry.rank} className={`flex items-center gap-4 px-5 py-3 ${isMe ? 'bg-blue-50' : ''}`}>
                    <span className={`w-8 text-center font-bold shrink-0 ${
                      entry.rank === 1 ? 'text-yellow-500 text-lg' :
                      entry.rank === 2 ? 'text-gray-400' :
                      entry.rank === 3 ? 'text-amber-600' : 'text-gray-400 text-sm'
                    }`}>{entry.rank}</span>
                    <span className={`flex-1 font-medium ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
                      {entry.test_name}
                      {isMe && <span className="text-xs text-blue-500 ml-2">(縺ゅ↑縺・</span>}
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
            <p>縺ｾ縺繝ｩ繝ｳ繧ｭ繝ｳ繧ｰ繝・・繧ｿ縺後≠繧翫∪縺帙ｓ</p>
          </div>
        )}

        <div className="pb-4 text-center">
          <Link href="/student" className="text-blue-600 text-sm hover:underline">繝帙・繝縺ｫ謌ｻ繧・/Link>
        </div>
      </div>
    </div>
  )
}
