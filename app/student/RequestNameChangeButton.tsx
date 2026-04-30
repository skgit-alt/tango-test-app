'use client'

import { useState } from 'react'

export default function RequestNameChangeButton({ currentTestName }: { currentTestName: string }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!newName.trim()) { setError('新しいテストネームを入力してください'); return }
    if (newName.trim() === currentTestName) { setError('現在のテストネームと同じです'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/student/request-name-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requested_name: newName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setSuccess(true)
      setOpen(false)
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <p className="text-green-600 text-xs mt-2">
        ✅ テストネーム変更の申請を送りました。先生の承認をお待ちください。
      </p>
    )
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-blue-500 hover:underline"
        >
          テストネームの変更を申請する
        </button>
      ) : (
        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-500">
            現在のテストネーム：<span className="font-medium text-gray-700">{currentTestName}</span>
          </p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">新しいテストネーム</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setError(null) }}
              placeholder="例：タナカ"
              maxLength={20}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={loading || !newName.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? '送信中...' : '申請する'}
            </button>
            <button
              onClick={() => { setOpen(false); setNewName(''); setError(null) }}
              className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 transition"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
