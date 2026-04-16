import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// ランキング設定 + 通算ポイントランキングを返す
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const admin = createAdminClient()

  // ランキング設定を取得
  const { data: settings } = await admin
    .from('ranking_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (!settings) return NextResponse.json({ settings: null, ranking: [] })

  // 対象テストID（50問モード・round_number が範囲内）
  const { data: targetTests } = await admin
    .from('tests')
    .select('id')
    .eq('mode', 50)
    .gte('round_number', settings.from_round)
    .lte('round_number', settings.to_round)
    .not('round_number', 'is', null)

  if (!targetTests || targetTests.length === 0) {
    return NextResponse.json({ settings, ranking: [] })
  }

  const testIds = targetTests.map((t: { id: string }) => t.id)

  // 対象テストのポイントを全取得
  const { data: points } = await admin
    .from('points')
    .select('student_id, points_earned, students(name, class_name, seat_number, test_name)')
    .in('test_id', testIds)

  if (!points || points.length === 0) {
    return NextResponse.json({ settings, ranking: [] })
  }

  // 生徒ごとに集計
  const grouped: Record<string, { name: string; class_name: string; seat_number: number; test_name: string; total: number }> = {}
  points.forEach((p: any) => {
    const st = Array.isArray(p.students) ? p.students[0] : p.students
    if (!st) return
    if (!grouped[p.student_id]) {
      grouped[p.student_id] = {
        name: st.name ?? '',
        class_name: st.class_name ?? '',
        seat_number: st.seat_number ?? 0,
        test_name: st.test_name ?? '',
        total: 0,
      }
    }
    grouped[p.student_id].total += p.points_earned
  })

  const ranking = Object.entries(grouped)
    .map(([student_id, v]) => ({ student_id, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))

  return NextResponse.json({ settings, ranking })
}

// ランキング設定を更新
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const body = await req.json()
  const { from_round, to_round, label } = body

  if (!from_round || !to_round || from_round > to_round) {
    return NextResponse.json({ error: '無効な値です' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('ranking_settings')
    .update({ from_round, to_round, label, updated_at: new Date().toISOString() })
    .eq('id', 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
