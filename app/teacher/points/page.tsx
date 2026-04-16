'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'

interface RankEntry {
  rank: number
  student_id: string
  name: string
  class_name: string
  seat_number: number
  test_name: string
  total: number
}

interface Settings {
  from_round: number
  to_round: number
  label: string
}

export default function PointsPage() {
  const [ranking, setRanking] = useState<RankEntry[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 編集フォーム用
  const [editing, setEditing] = useState(false)
  const [fromRound, setFromRound] = useState('')
  const [toRound, setToRound] = useState('')
  const [label, setLabel] = useState('')

  const fetchData = async () => {
    setLoading(true)
    const res = await fetch('/api/teacher/ranking-data', { cache: 'no-store' })
    if (res.ok) {
      const { settings: s, ranking: r } = await res.json()
      setSettings(s)
      setRanking(r ?? [])
      if (s) {
        setFromRound(String(s.from_round))
        setToRound(String(s.to_round))
        setLabel(s.label ?? '')
      }
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleSaveSettings = async () => {
    const from = parseInt(fromRound)
    const to = parseInt(toRound)
    if (isNaN(from) || isNaN(to) || from > to || from < 1) {
      alert('正しい回数を入力してください')
      return
    }
    setSaving(true)
    const res = await fetch('/api/teacher/ranking-data', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_round: from, to_round: to, label: label || `第${from}回〜第${to}回` }),
    })
    if (res.ok) {
      setEditing(false)
      await fetchData()
    } else {
      alert('保存に失敗しました')
    }
    setSaving(false)
  }

  const handleDownload = () => {
    const rows = ranking.map((r) => ({
      順位: r.rank,
      クラス: r.class_name,
      出席番号: r.seat_number,
      名前: r.name,
      テストネーム: r.test_name,
      通算ポイント: r.total,
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'ポイントランキング')
    XLSX.writeFile(wb, `ポイントランキング_${settings?.label ?? ''}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">ポイント管理</h1>
        {ranking.length > 0 && (
          <button
            onClick={handleDownload}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
          >
            Excelダウンロード
          </button>
        )}
      </div>

      {/* ランキング期間設定 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">ランキング集計期間</h2>
            {settings && !editing && (
              <p className="text-sm text-gray-500 mt-0.5">
                {settings.label || `第${settings.from_round}回〜第${settings.to_round}回`}
                <span className="text-gray-400 ml-2">（{settings.to_round - settings.from_round + 1}回分）</span>
              </p>
            )}
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-blue-600 border border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition"
            >
              期間を変更
            </button>
          )}
        </div>

        {editing && (
          <div className="space-y-4 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">第</span>
                <input
                  type="number"
                  min={1}
                  value={fromRound}
                  onChange={(e) => setFromRound(e.target.value)}
                  className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">回 〜 第</span>
                <input
                  type="number"
                  min={1}
                  value={toRound}
                  onChange={(e) => setToRound(e.target.value)}
                  className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">回</span>
              </div>
              {fromRound && toRound && !isNaN(parseInt(fromRound)) && !isNaN(parseInt(toRound)) && parseInt(fromRound) <= parseInt(toRound) && (
                <span className="text-xs text-gray-400">
                  → {parseInt(toRound) - parseInt(fromRound) + 1}回分の合計ポイントで集計
                </span>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">表示名（任意）</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`第${fromRound || '?'}回〜第${toRound || '?'}回`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存して再集計'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ランキングテーブル */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            通算ポイントランキング
            {settings && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                {settings.label || `第${settings.from_round}回〜第${settings.to_round}回`}
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">読み込み中...</div>
        ) : ranking.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p>該当するポイントデータがありません</p>
            <p className="text-xs mt-1">各テストに「第何回」を設定してください</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-center w-16">順位</th>
                  <th className="px-4 py-3 text-left">クラス</th>
                  <th className="px-4 py-3 text-left">番号</th>
                  <th className="px-4 py-3 text-left">名前</th>
                  <th className="px-4 py-3 text-left">テストネーム</th>
                  <th className="px-4 py-3 text-right">ポイント</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ranking.map((r) => (
                  <tr key={r.student_id} className={`hover:bg-gray-50 ${r.rank <= 3 ? 'bg-yellow-50' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${r.rank === 1 ? 'text-yellow-500 text-lg' : r.rank === 2 ? 'text-gray-400' : r.rank === 3 ? 'text-amber-600' : 'text-gray-500'}`}>
                        {r.rank}位
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.class_name}</td>
                    <td className="px-4 py-3 text-gray-700">{r.seat_number}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.test_name}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{r.total}pt</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
