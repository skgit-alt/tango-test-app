import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// 生徒ホーム画面の「通算ポイント・順位」を返す軽量API
// ページ初期ロードから分離して後から非同期取得することで同時接続の負荷を分散する

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const admin = createAdminClient()

  const { data: rankingSettings } = await admin
    .from('ranking_settings')
    .select('from_round, to_round')
    .eq('id', 1)
    .maybeSingle()

  if (!rankingSettings) return NextResponse.json({ totalPoints: 0, rank: 0 })

  const { data: targetTests } = await admin
    .from('tests')
    .select('id')
    .eq('mode', 50)
    .gte('round_number', rankingSettings.from_round)
    .lte('round_number', rankingSettings.to_round)
    .not('round_number', 'is', null)

  if (!targetTests || targetTests.length === 0) {
    return NextResponse.json({ totalPoints: 0, rank: 0 })
  }

  const testIds = targetTests.map((t: { id: string }) => t.id)
  const { data: allPoints } = await admin
    .from('points')
    .select('student_id, points_earned')
    .in('test_id', testIds)

  if (!allPoints || allPoints.length === 0) {
    return NextResponse.json({ totalPoints: 0, rank: 0 })
  }

  const grouped: Record<string, number> = {}
  allPoints.forEach((p: { student_id: string; points_earned: number }) => {
    grouped[p.student_id] = (grouped[p.student_id] ?? 0) + p.points_earned
  })

  const totalPoints = grouped[user.id] ?? 0
  const sorted = Object.values(grouped).sort((a, b) => b - a)
  const rankIndex = sorted.findIndex((pts) => pts <= totalPoints)
  const rank = totalPoints > 0 ? rankIndex + 1 : 0

  return NextResponse.json({ totalPoints, rank })
}
