'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Test } from '@/lib/supabase/types'

// ─── 実施日表示（opened_at → タイトル先頭の日付 → created_at の優先順）────────

function getDisplayDate(test: Test): string {
  if (test.opened_at) {
    return new Date(test.opened_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }
  // タイトル先頭の "M.D" または "MM.DD" 形式を解析
  const m = test.title.match(/^(\d{1,2})\.(\d{1,2})/)
  if (m) return `${parseInt(m[1])}/${parseInt(m[2])}`
  return new Date(test.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

// ─── ステータス表示 ───────────────────────────────────────────────────────────

const statusLabel: Record<string, string> = {
  waiting: '待機中',
  open: '実施中',
  finished: '採点中',
  published: '公開済',
}

const statusColor: Record<string, string> = {
  waiting: 'bg-gray-100 text-gray-600',
  open: 'bg-green-100 text-green-700',
  finished: 'bg-yellow-100 text-yellow-700',
  published: 'bg-blue-100 text-blue-700',
}

// ─── カラム設定 ───────────────────────────────────────────────────────────────

interface ColumnConfig {
  key: string
  label: string
  emoji: string
  headerBg: string
  roundBadge: string
}

const COLUMNS: ColumnConfig[] = [
  {
    key: '50',
    label: 'Ⅱ類50問テスト',
    emoji: '⚡',
    headerBg: 'bg-blue-600',
    roundBadge: 'bg-blue-100 text-blue-700',
  },
  {
    key: 'other',
    label: 'Ⅰ類20問テスト',
    emoji: '📄',
    headerBg: 'bg-green-600',
    roundBadge: 'bg-green-100 text-green-700',
  },
  {
    key: '300',
    label: '300問テスト',
    emoji: '📗',
    headerBg: 'bg-orange-500',
    roundBadge: 'bg-orange-100 text-orange-700',
  },
  {
    key: '600',
    label: '600問テスト',
    emoji: '📘',
    headerBg: 'bg-violet-600',
    roundBadge: 'bg-violet-100 text-violet-700',
  },
]

// ─── テストカード ─────────────────────────────────────────────────────────────

function TestCard({
  test,
  config,
  selected,
  onToggle,
  retakeCount,
}: {
  test: Test
  config: ColumnConfig
  selected: boolean
  onToggle: () => void
  retakeCount: number
}) {
  const isBookType = (test.mode === 300 || test.mode === 600) && test.book_type
  const cardBg = isBookType && test.book_type === '1200'
    ? (selected ? 'bg-yellow-300' : 'bg-yellow-200 hover:bg-yellow-300')
    : isBookType && test.book_type === '1900'
    ? (selected ? 'bg-blue-300' : 'bg-blue-200 hover:bg-blue-300')
    : (selected ? 'bg-red-50' : 'hover:bg-gray-50')

  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 transition ${cardBg}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="w-4 h-4 mt-0.5 rounded border-gray-300 text-red-500 cursor-pointer shrink-0"
        onClick={(e) => e.stopPropagation()}
      />
      <Link href={`/teacher/tests/${test.id}`} className="flex-1 min-w-0 group">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 group-hover:text-blue-600 transition">
            {test.title}
          </p>
          <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColor[test.status]}`}>
            {statusLabel[test.status]}
          </span>
          {test.book_type && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${test.book_type === '1200' ? 'bg-yellow-200 text-yellow-800' : 'bg-blue-200 text-blue-800'}`}>
              📚 {test.book_type}
            </span>
          )}
          {test.round_number != null && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${config.roundBadge}`}>
              第{test.round_number}回
            </span>
          )}
          {retakeCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
              🔄 {retakeCount}件
            </span>
          )}
          <span className="text-xs text-gray-400">
            {getDisplayDate(test)}
          </span>
        </div>
      </Link>
    </div>
  )
}

// ─── テストカラム ─────────────────────────────────────────────────────────────

function TestColumn({
  config,
  tests,
  selectedIds,
  onToggle,
  onToggleAll,
  retakeCounts,
}: {
  config: ColumnConfig
  tests: Test[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[], selectAll: boolean) => void
  retakeCounts: Record<string, number>
}) {
  const visible = tests

  const allSelected = tests.length > 0 && tests.every((t) => selectedIds.has(t.id))
  const someSelected = tests.some((t) => selectedIds.has(t.id))

  const handleToggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    onToggleAll(tests.map((t) => t.id), !allSelected)
  }

  return (
    <div className="flex flex-col min-w-0 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      {/* ヘッダー */}
      <div className={`${config.headerBg} text-white px-4 py-3 flex items-center justify-between shrink-0`}>
        <span className="font-bold text-sm tracking-wide">
          {config.emoji} {config.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
            {tests.length}件
          </span>
          {tests.length > 0 && (
            <label className="flex items-center gap-1 cursor-pointer select-none text-xs text-white/90 hover:text-white transition">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                onChange={handleToggleAll}
                className="w-3.5 h-3.5 rounded border-white/50 text-white cursor-pointer accent-white"
              />
              全選択
            </label>
          )}
        </div>
      </div>

      {/* スクロールエリア */}
      <div className="flex flex-col flex-1 bg-white overflow-hidden">
        {tests.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            テストがありません
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[65vh] divide-y divide-gray-100">
            {visible.map((test) => (
              <TestCard
                key={test.id}
                test={test}
                config={config}
                selected={selectedIds.has(test.id)}
                onToggle={() => onToggle(test.id)}
                retakeCount={retakeCounts[test.id] ?? 0}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

export default function TestListClient({ tests: initialTests, retakeCounts }: { tests: Test[]; retakeCounts: Record<string, number> }) {
  const router = useRouter()

  const [tests, setTests] = useState<Test[]>(initialTests)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleColumnAll = (ids: string[], selectAll: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selectAll) { ids.forEach((id) => next.add(id)) }
      else { ids.forEach((id) => next.delete(id)) }
      return next
    })
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
      const res = await fetch('/api/teacher/delete-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testIds: ids }),
      })
      if (!res.ok) {
        const r = await res.json()
        throw new Error(r.error ?? '削除に失敗しました')
      }
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

  const tests50    = tests.filter((t) => t.mode === 50)
  const testsOther = tests.filter((t) => t.mode !== 50 && t.mode !== 300 && t.mode !== 600)
  const tests300   = tests.filter((t) => t.mode === 300)
  const tests600   = tests.filter((t) => t.mode === 600)

  const grouped: Record<string, Test[]> = {
    '50': tests50,
    'other': testsOther,
    '300': tests300,
    '600': tests600,
  }

  if (tests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
        <p className="text-lg">テストがありません</p>
        <p className="text-sm mt-2">「新しいテストを作成」から追加してください</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 削除バー（選択時のみ表示） */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition disabled:opacity-50"
          >
            {deleting ? '削除中...' : `選択した ${selectedIds.size} 件を削除`}
          </button>
          <span className="text-sm text-gray-500">
            チェックを外すには各列の「全選択」を再度クリック
          </span>
        </div>
      )}

      {/* 3列カラムレイアウト */}
      <div className="grid grid-cols-4 gap-4 items-start">
        {COLUMNS.map((col) => (
          <TestColumn
            key={col.key}
            config={col}
            tests={grouped[col.key]}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onToggleAll={toggleColumnAll}
            retakeCounts={retakeCounts}
          />
        ))}
      </div>
    </div>
  )
}
