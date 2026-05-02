'use client'

import { useState, useEffect } from 'react'

export default function RequestNameChangeButton({ currentTestName }: { currentTestName: string }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // 初回ロード時に最新申請状況を確認
  const [initLoading, setInitLoading] = useState(true)
  const [latestStatus, setLatestStatus] = useState<'pending' | 'rejected' | 'approved' | null>(null)
  const [rejectReason, setRejectReason] = useState<string | null>(null)
  const [rejectedName, setRejectedName] = useState<string | null>(null)

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await fetch('/api/student/request-name-change')
        if (res.ok) {
          const data = await res.json()
          if (data.request) {
            setLatestStatus(data.request.status)
            setRejectReason(data.request.reject_reason ?? null)
            setRejectedName(data.request.requested_name ?? null)
          }
        }
      } catch {
        // 無視
      } finally {
        setInitLoading(false)
      }
    }
    fetchLatest()
  }, [])

  const handleSubmit = async () => {
    const trimmed = newName.trim()
    if (!trimmed) { setError('新しいテストネームを入力してください'); return }
    if (trimmed === currentTestName) { setError('現在のテストネームと同じです'); return }
    if (trimmed.length < 3) { setError('テストネームは3文字以上で入力してください'); return }
    if (trimmed.length > 10) { setError('テストネームは10文字以内で入力してください'); return }
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
      setLatestStatus('pending')
      setOpen(false)
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  if (initLoading) return null

  // 申請が却下された場合
  if (latestStatus === 'rejected') {
    return (
      <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
        <p className="text-red-600 text-xs font-medium">
          ❌ テストネーム変更の申請が却下されました
        </p>
        {rejectReason && (
          <p className="text-xs text-gray-600">
            <span className="text-gray-400">理由：</span>{rejectReason}
          </p>
        )}
        {rejectedName && (
          <p className="text-xs text-gray-400">申請していたテストネーム：{rejectedName}</p>
        )}
        <button
          onClick={() => { setLatestStatus(null); setRejectReason(null); setRejectedName(null) }}
          className="text-xs text-blue-500 hover:underline mt-1 block"
        >
          再度申請する
        </button>
      </div>
    )
  }

  // 申請が承認待ち（ページリロード後も表示）
  if (latestStatus === 'pending' || success) {
    return (
      <p className="text-blue-600 text-xs mt-2">
        ⏳ テストネーム変更の申請中です。先生の承認をお待ちください。
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
            <ul className="text-xs text-gray-400 mb-2 space-y-1 list-none">
              <li>・3文字以上・10文字以内で入力してください</li>
              <li>・他人と被りそうな名前は避けてください（例：あいうえお、123 など）</li>
              <li>・他人の名前を登録して成りすます行為はやめてください</li>
            </ul>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setError(null) }}
              placeholder="例：タナカ"
              maxLength={10}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{newName.trim().length} / 10文字</p>
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
