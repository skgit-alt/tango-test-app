'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Test } from '@/lib/supabase/types'

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

export default function TestListClient({ tests: initialTests }: { tests: Test[] }) {
  const supabase = createClient()
  const router = useRouter()

  const [tests, setTests] = useState<Test[]>(initialTests)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const allSelected = tests.length > 0 && tests.every((t) => selectedIds.has(t.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(tests.map((t) => t.id)))
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    const names = tests.filter((t) => selectedIds.has(t.id)).map((t) => `・${t.title}`).join('\n')
    const confirmed = confirm(
      `以下の ${selectedIds.size} 件のテストを削除しますか？\n生徒の回答データもすべて削除されます。この操作は元に戻せません。\n\n${names}`
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      const ids = Array.from(selectedIds)

      // セッションIDを取得してから回答を削除（カスケード対応）
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .in('test_id', ids)

      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map((s) => s.id)
        await supabase.from('answers').delete().in('session_id', sessionIds)
        await supabase.from('cheat_logs').delete().in('session_id', sessionIds)
        await supabase.from('sessions').delete().in('id', sessionIds)
      }

      await supabase.from('questions').delete().in('test_id', ids)
      await supabase.from('tests').delete().in('id', ids)

      setTests((prev) => prev.filter((t) => !selectedIds.has(t.id)))
      setSelectedIds(new Set())
      router.refresh()
    } catch (err) {
      console.error(err)
      alert('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const tests50 = tests.filter((t) => t.mode === 50)
  const tests300 = tests.filter((t) => t.mode === 300)

  const renderTestItem = (test: Test) => (
    <div
      key={test.id}
      className={`bg-white rounded-2xl border-2 p-5 flex items-center gap-3 transition ${
        selectedIds.has(test.id) ? 'border-red-300 bg-red-50' : 'border-gray-200'
      }`}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(test.id)}
        onChange={() => toggleSelect(test.id)}
        className="w-4 h-4 rounded border-gray-300 text-red-500 cursor-pointer shrink-0"
        onClick={(e) => e.stopPropagation()}
      />
      <Link
        href={`/teacher/tests/${test.id}`}
        className="flex-1 flex items-center justify-between min-w-0 hover:opacity-75 transition"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h2 className="font-semibold text-gray-800">{test.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[test.status]}`}>
              {statusLabel[test.status]}
            </span>
            {test.mode === 50 && test.round_number != null && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                第{test.round_number}回
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 flex items-center gap-3 flex-wrap">
            <span>制限時間: {test.time_limit}秒</span>
            {test.pass_score && <span>合格点: {test.pass_score}点</span>}
            <span>作成: {new Date(test.created_at).toLocaleDateString('ja-JP')}</span>
          </div>
        </div>
        <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )

  if (tests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
        <p className="text-lg">テストがありません</p>
        <p className="text-sm mt-2">「新しいテストを作成」から追加してください</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 一括操作バー */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
          />
          全て選択
        </label>
        {selectedIds.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-600 transition disabled:opacity-50"
          >
            {deleting ? '削除中...' : `選択した ${selectedIds.size} 件を削除`}
          </button>
        )}
      </div>

      {/* 50問テスト */}
      {tests50.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-500 flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">⚡ 50問テスト</span>
            <span className="text-gray-400 font-normal">{tests50.length}件</span>
          </h2>
          <div className="grid gap-3">
            {tests50.map(renderTestItem)}
          </div>
        </div>
      )}

      {/* 300問テスト */}
      {tests300.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-500 flex items-center gap-2">
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">📝 300問テスト</span>
            <span className="text-gray-400 font-normal">{tests300.length}件</span>
          </h2>
          <div className="grid gap-3">
            {tests300.map(renderTestItem)}
          </div>
        </div>
      )}
    </div>
  )
}
