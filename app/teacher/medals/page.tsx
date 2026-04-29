import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import MedalsClient from './MedalsClient'

export default async function MedalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

  const { data: medals } = await admin
    .from('medals')
    .select('from_round, to_round, rank, awarded_at')
    .order('awarded_at', { ascending: false })

  // サイクルごとにグループ化
  const cycleMap: Record<string, {
    from_round: number
    to_round: number
    awarded_at: string
    crown: number
    ribbon: number
  }> = {}

  for (const m of medals ?? []) {
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

  const cycles = Object.values(cycleMap).sort((a, b) => b.from_round - a.from_round)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">勲章管理</h1>
      <MedalsClient initialCycles={cycles} />
    </div>
  )
}
