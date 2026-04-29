'use client'

import { useState } from 'react'

interface Cycle {
  from_round: number
  to_round: number
  awarded_at: string
  crown: number
  ribbon: number
}

interface RankedStudent {
  student_id: string
  rank: number
  name: string
  class_name: string
  test_name: string
  total: number
}

export default function MedalsClient({ initialCycles }: { initialCycles: Cycle[] }) {
  const [cycles, setCycles] = useState<Cycle[]>(initialCycles)
  const [showForm, setShowForm] = useState(false)
  const [fromRound, setFromRound] = useState('')
  const [toRound, setToRound] = useState('')
  const [preview, setPreview] = useState<RankedStudent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handlePreview = async () => {
    setError(null)
    setPreview(null)
    setLoading(true)
    try {
      const res = await fetch('/api/teacher/medals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_round: Number(fromRound),
          to_round: Number(toRound),
          preview: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setPreview(data.ranked)
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleAward = async () => {
    if (!confirm(`第${fromRound}回〜第${toRound}回の勲章を確定します。よろしいですか？`)) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/teacher/medals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_round: Number(fromRound),
          to_round: Number(toRound),
          preview: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }

      setSuccess(true)
      setShowForm(false)
      setPreview(null)
      setFromRound('')
      setToRound('')

      // サイクル一覧を再取得
      const listRes = await fetch('/api/teacher/medals')
      const listData = await listRes.json()
      setCycles(listData.cycles ?? [])
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 成功メッセージ */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 font-medium">
          ✅ 勲章を付与しました！
        </div>
      )}

      {/* 勲章を確定するボタン */}
      {!showForm && (
        <button
          onClick={() => { setShowForm(true); setSuccess(false) }}
          className="bg-yellow-500 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-yellow-600 transition text-sm"
        >
          👑 勲章を確定する
        </button>
      )}

      {/* 入力フォーム */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <h2 className="font-bold text-gray-800">勲章の付与設定</h2>

          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">開始回</label>
              <input
                type="number"
                value={fromRound}
                onChange={(e) => { setFromRound(e.target.value); setPreview(null) }}
                placeholder="例: 1"
                className="border border-gray-300 rounded-lg px-3 py-2 w-24 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
            <span className="text-gray-400 mt-4">〜</span>
            <div>
              <label className="text-xs text-gray-500 block mb-1">終了回</label>
              <input
                type="number"
                value={toRound}
                onChange={(e) => { setToRound(e.target.value); setPreview(null) }}
                placeholder="例: 5"
                className="border border-gray-300 rounded-lg px-3 py-2 w-24 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handlePreview}
              disabled={!fromRound || !toRound || loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading && !preview ? '計算中...' : 'プレビューを表示'}
            </button>
            <button
              onClick={() => { setShowForm(false); setPreview(null); setError(null) }}
              className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
            >
              キャンセル
            </button>
          </div>

          {/* プレビュー */}
          {preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-700 text-sm">
                  第{fromRound}回〜第{toRound}回 ランキング上位{preview.length}名
                </p>
                <button
                  onClick={handleAward}
                  disabled={loading}
                  className="bg-yellow-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-yellow-600 transition disabled:opacity-50"
                >
                  {loading ? '処理中...' : '✅ この内容で確定する'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-center">順位</th>
                      <th className="px-3 py-2 text-left">テストネーム</th>
                      <th className="px-3 py-2 text-left">クラス</th>
                      <th className="px-3 py-2 text-right">合計pt</th>
                      <th className="px-3 py-2 text-center">勲章</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((r) => (
                      <tr key={r.student_id} className={r.rank === 1 ? 'bg-yellow-50' : ''}>
                        <td className="px-3 py-2 text-center font-bold text-gray-600">{r.rank}</td>
                        <td className="px-3 py-2 text-gray-800">{r.test_name}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{r.class_name}</td>
                        <td className="px-3 py-2 text-right text-blue-600 font-medium">{r.total}pt</td>
                        <td className="px-3 py-2 text-center text-lg">
                          {r.rank === 1 ? '👑' : '🎖️'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 付与済みサイクル一覧 */}
      <div>
        <h2 className="font-bold text-gray-700 mb-3">付与済み勲章サイクル</h2>
        {cycles.length === 0 ? (
          <p className="text-gray-400 text-sm">まだ付与されていません</p>
        ) : (
          <div className="space-y-2">
            {cycles.map((c) => (
              <div
                key={`${c.from_round}_${c.to_round}`}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-800 text-sm">
                    第{c.from_round}回 〜 第{c.to_round}回
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(c.awarded_at).toLocaleDateString('ja-JP')} 付与
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-lg">👑 × {c.crown}</span>
                  <span className="text-lg">🎖️ × {c.ribbon}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
