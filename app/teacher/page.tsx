import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Test } from '@/lib/supabase/types'
import Link from 'next/link'
import DownloadButtons from './DownloadButtons'
import TestListClient from './TestListClient'

export default async function TeacherPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: tests } = await supabase
    .from('tests')
    .select('*')
    .order('created_at', { ascending: false })

  // 各テストの不正行為最新時刻を取得（2ステップで確実にマッピング）
  const { data: allSessions } = await admin
    .from('sessions')
    .select('id, test_id')

  const { data: cheatData } = await admin
    .from('cheat_logs')
    .select('session_id, occurred_at')

  // session_id → test_id のマップを作成
  const sessionTestMap: Record<string, string> = {}
  for (const s of allSessions ?? []) {
    if (s.id && s.test_id) sessionTestMap[s.id] = s.test_id
  }

  // テストIDごとに最新の不正行為発生時刻を集計
  const cheatLatestMap: Record<string, string> = {}
  for (const log of cheatData ?? []) {
    const testId = sessionTestMap[log.session_id]
    if (!testId) continue
    if (!cheatLatestMap[testId] || log.occurred_at > cheatLatestMap[testId]) {
      cheatLatestMap[testId] = log.occurred_at
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">テスト一覧</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <DownloadButtons />
          <Link
            href="/teacher/tests/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 transition text-sm"
          >
            + 新しいテストを作成
          </Link>
        </div>
      </div>

      <TestListClient tests={(tests ?? []) as Test[]} cheatLatestMap={cheatLatestMap} />
    </div>
  )
}
