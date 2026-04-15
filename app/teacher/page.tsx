import { createClient } from '@/lib/supabase/server'
import { Test } from '@/lib/supabase/types'
import Link from 'next/link'

const statusLabel: Record<string, string> = {
  waiting: '待機中',
  open: '実施中',
  finished: '採点中',
  published: '結果公開済',
}

const statusColor: Record<string, string> = {
  waiting: 'bg-gray-100 text-gray-600',
  open: 'bg-green-100 text-green-700',
  finished: 'bg-yellow-100 text-yellow-700',
  published: 'bg-blue-100 text-blue-700',
}

export default async function TeacherPage() {
  const supabase = await createClient()
  const { data: tests } = await supabase
    .from('tests')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">テスト一覧</h1>
        <Link
          href="/teacher/tests/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 transition text-sm"
        >
          + 新しいテストを作成
        </Link>
      </div>

      {!tests || tests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <p className="text-lg">テストがありません</p>
          <p className="text-sm mt-2">「新しいテストを作成」から追加してください</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {(tests as Test[]).map((test) => (
            <Link
              key={test.id}
              href={`/teacher/tests/${test.id}`}
              className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="font-semibold text-gray-800">{test.title}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[test.status]}`}>
                    {statusLabel[test.status]}
                  </span>
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-3">
                  <span>{test.mode}問モード</span>
                  <span>制限時間: {test.time_limit}秒</span>
                  {test.pass_score && <span>合格点: {test.pass_score}点</span>}
                  <span>作成: {new Date(test.created_at).toLocaleDateString('ja-JP')}</span>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
