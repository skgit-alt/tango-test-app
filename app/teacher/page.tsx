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

  // 各テストの未確認不正行為数を取得
  // cheat_logs → sessions.test_id でグルーピング
  const { data: cheatData } = await admin
    .from('cheat_logs')
    .select('occurred_at, sessions!inner(test_id)')

  // テストIDごとに最新の不正行為発生時刻を集計
  const cheatLatestMap: Record<string, string> = {}
  for (const log of cheatData ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testId = (log.sessions as any)?.test_id as string | undefined
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
