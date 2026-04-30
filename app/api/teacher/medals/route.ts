import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calcPoints } from '@/lib/supabase/types'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: 過去の勲章付与サイクル一覧 ─────────────────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // 付与済みサイクルを集計（from_round/to_roundの組み合わせごと）
  const { data: medals } = await admin
    .from('medals')
    .select('from_round, to_round, rank, awarded_at, students(name, class_name, test_name)')
    .order('awarded_at', { ascending: false })

  if (!medals) return NextResponse.json({ cycles: [] })

  // サイクルごとにグループ化
  const cycleMap: Record<string, {
    from_round: number
    to_round: number
    awarded_at: string
    crown: number
    ribbon: number
  }> = {}

  for (const m of medals) {
    const key = `${m.from_round}_${m.to_round}`
    if (!cycleMap[key]) {
      cycleMap[key] = {
        from_round: m.from_round,
        to_round: m.to_round,
        awarded_at: m.awarded_at,
        crown: 0,
        ribbon: 0,
      }
    }
    if (m.rank === 1) cycleMap[key].crown++
    else cycleMap[key].ribbon++
  }

  const cycles = Object.values(cycleMap).sort((a, b) =>
    b.from_round - a.from_round
  )

  return NextResponse.json({ cycles })
}

// ─── POST: 勲章を付与する ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { from_round, to_round, preview } = await req.json() as {
    from_round: number
    to_round: number
    preview?: boolean
  }

  if (!from_round || !to_round || from_round > to_round) {
    return NextResponse.json({ error: '回数の入力が正しくありません' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 対象テストを取得（50問モードのみ）
  const { data: targetTests } = await admin
    .from('tests')
    .select('id, round_number')
    .eq('mode', 50)
    .gte('round_number', from_round)
    .lte('round_number', to_round)
    .not('round_number', 'is', null)

  if (!targetTests || targetTests.length === 0) {
    return NextResponse.json({ error: 'この期間に50問テストが見つかりません' }, { status: 404 })
  }

  const testIds = targetTests.map((t: { id: string }) => t.id)
  const testRoundMap: Record<string, number> = {}
  for (const t of targetTests as { id: string; round_number: number }[]) {
    testRoundMap[t.id] = t.round_number
  }

  // セッションを取得
  const { data: sessions } = await admin
    .from('sessions')
    .select('student_id, test_id, score, students(name, class_name, seat_number, test_name)')
    .in('test_id', testIds)
    .eq('is_submitted', true)
    .not('score', 'is', null)
    .not('is_practice', 'eq', true)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ error: 'この期間の受験データがありません' }, { status: 404 })
  }

  // テストごとのベストスコアを集計
  const bestScores: Record<string, { student_id: string; test_id: string; score: number; students: unknown }> = {}
  for (const s of sessions as { student_id: string; test_id: string; score: number; students: unknown }[]) {
    const key = `${s.student_id}_${s.test_id}`
    if (!bestScores[key] || s.score > bestScores[key].score) {
      bestScores[key] = s
    }
  }

  // 生徒ごとにポイントを集計
  interface StudentInfo {
    name: string
    class_name: string
    seat_number: number
    test_name: string
    total: number
  }
  const grouped: Record<string, StudentInfo> = {}

  for (const s of Object.values(bestScores)) {
    const st = Array.isArray(s.students)
      ? (s.students as { name: string; class_name: string; seat_number: number; test_name: string }[])[0]
      : s.students as { name: string; class_name: string; seat_number: number; test_name: string } | null
    if (!st) continue

    // 英字始まりクラス（A〜D組）のみ対象
    if (!/^[A-Za-z]/.test(st.class_name ?? '')) continue

    const round = testRoundMap[s.test_id]
    if (!round) continue

    const value = calcPoints(s.score)
    if (!grouped[s.student_id]) {
      grouped[s.student_id] = {
        name: st.name ?? '',
        class_name: st.class_name ?? '',
        seat_number: st.seat_number ?? 0,
        test_name: st.test_name ?? '',
        total: 0,
      }
    }
    grouped[s.student_id].total += value
  }

  // タイを考慮したランキング（30位タイの全員を含める）
  const sortedAll = Object.entries(grouped)
    .map(([student_id, v]) => ({ student_id, ...v }))
    .sort((a, b) => b.total - a.total)
  const ranked: { student_id: string; rank: number; name: string; class_name: string; test_name: string; total: number }[] = []
  let rankNum = 1
  for (let i = 0; i < sortedAll.length; i++) {
    if (i > 0 && sortedAll[i].total < sortedAll[i - 1].total) rankNum = i + 1
    if (rankNum > 30) break
    ranked.push({ ...sortedAll[i], rank: rankNum })
  }

  // プレビューモードの場合はここで返す
  if (preview) {
    return NextResponse.json({ ranked })
  }

  // 既に同じサイクルで付与済みか確認
  const { data: existing } = await admin
    .from('medals')
    .select('id')
    .eq('from_round', from_round)
    .eq('to_round', to_round)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'この期間はすでに勲章を付与済みです' }, { status: 409 })
  }

  // 勲章を挿入
  const insertData = ranked.map((r) => ({
    student_id: r.student_id,
    rank: r.rank,
    from_round,
    to_round,
  }))

  const { error } = await admin.from('medals').insert(insertData)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, count: ranked.length })
}
