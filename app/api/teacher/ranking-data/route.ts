import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcPoints } from '@/lib/supabase/types'
import { NextRequest, NextResponse } from 'next/server'

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface RankEntry {
  rank: number
  student_id: string
  test_name: string
  class_name: string
  seat_number: number
  name: string
  roundValues: Record<string, number>
  total: number
}

interface ClassAvg {
  round: number
  classes: Record<string, number>
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const admin = createAdminClient()

  const modeParam = req.nextUrl.searchParams.get('mode')
  const is20 = modeParam === '20'
  const settingsId = is20 ? 2 : 1

  // ランキング設定を取得
  const { data: settings } = await admin
    .from('ranking_settings')
    .select('*')
    .eq('id', settingsId)
    .maybeSingle()

  if (!settings) {
    return NextResponse.json({ settings: null, rounds: [], ranking: [], classAverages: [] })
  }

  // 対象テストを取得（round_number が範囲内、モードでフィルタ）
  let testsQuery = admin
    .from('tests')
    .select('id, round_number, mode')
    .gte('round_number', settings.from_round)
    .lte('round_number', settings.to_round)
    .not('round_number', 'is', null)

  if (is20) {
    // 20Qモード: mode≠50 かつ mode≠300
    testsQuery = testsQuery.neq('mode', 50).neq('mode', 300)
  } else {
    // 50Qモード: mode=50
    testsQuery = testsQuery.eq('mode', 50)
  }

  const { data: targetTests } = await testsQuery

  if (!targetTests || targetTests.length === 0) {
    return NextResponse.json({ settings, rounds: [], ranking: [], classAverages: [] })
  }

  const testIds = targetTests.map((t: { id: string }) => t.id)
  // round_number → test_id のマップ
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
      // student_id + test_id ごとに最高点を計算
      const bestScores: Record<string, { score: number; student_id: string; test_id: string; students: unknown }> = {}
      for (const s of sessions as { student_id: string; test_id: string; score: number; students: unknown }[]) {
        const key = `${s.student_id}_${s.test_id}`
        if (!bestScores[key] || s.score > bestScores[key].score) {
          bestScores[key] = s
        }
      }

      for (const s of Object.values(bestScores)) {
        const st = Array.isArray(s.students) ? (s.students as { name: string; class_name: string; seat_number: number; test_name: string }[])[0] : s.students as { name: string; class_name: string; seat_number: number; test_name: string } | null
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

  // sessions から is_submitted=true のもの（スコアベース）
  const { data: allSessions } = await admin
    .from('sessions')
    .select('student_id, test_id, score, students(class_name)')
    .in('test_id', testIds)
    .eq('is_submitted', true)
    .not('score', 'is', null)

  if (allSessions && allSessions.length > 0) {
    // student_id + test_id ごとの最高点
    const bestScoreMap: Record<string, { score: number; test_id: string; class_name: string }> = {}
    for (const s of allSessions as { student_id: string; test_id: string; score: number; students: unknown }[]) {
      const st = Array.isArray(s.students) ? (s.students as { class_name: string }[])[0] : s.students as { class_name: string } | null
      const className = st?.class_name ?? ''

      // クラスフィルタ（50Q: A～D組 英字始まり / 20Q: 1～6組 数字始まり）
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

    // ラウンドごと・クラスごとに集計
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

  return NextResponse.json({ settings, rounds, ranking, classAverages })
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const body = await req.json()
  const { from_round, to_round, label, mode } = body

  if (!from_round || !to_round || from_round > to_round) {
    return NextResponse.json({ error: '無効な値です' }, { status: 400 })
  }

  const settingsId = mode === 20 ? 2 : 1
  const admin = createAdminClient()

  const { error } = await admin
    .from('ranking_settings')
    .upsert(
      { id: settingsId, from_round, to_round, label, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
