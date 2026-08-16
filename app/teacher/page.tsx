import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Test } from '@/lib/supabase/types'
import Link from 'next/link'
import DownloadButtons from './DownloadButtons'
import TestListClient from './TestListClient'

export default async function TeacherPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: tests }, { data: practiceSessions }] = await Promise.all([
    supabase.from('tests').select('*').order('created_at', { ascending: false }),
    admin.from('sessions').select('test_id').eq('is_practice', true).eq('is_submitted', true),
  ])

  const retakeCounts: Record<string, number> = {}
  for (const s of practiceSessions ?? []) {
    retakeCounts[s.test_id] = (retakeCounts[s.test_id] ?? 0) + 1
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

      <TestListClient tests={(tests ?? []) as Test[]} retakeCounts={retakeCounts} />
    </div>
  )
}
