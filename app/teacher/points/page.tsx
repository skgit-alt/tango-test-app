'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

interface PointRow {
  student_id: string
  total_points: number
  student: {
    name: string
    class_name: string
    seat_number: number
    test_name: string | null
  } | null
}

export default function PointsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<PointRow[]>([])
  const [currentCycle, setCurrentCycle] = useState(1)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const fetchPoints = async () => {
    setLoading(true)
    const { data: allPoints } = await supabase
      .from('points')
      .select('student_id, points_earned, cycle, students(name, class_name, seat_number, test_name)')
      .order('cycle')

    if (!allPoints) { setLoading(false); return }

    const maxCycle = allPoints.reduce((m, p) => Math.max(m, p.cycle), 1)
    setCurrentCycle(maxCycle)

    const cyclePts = allPoints.filter((p) => p.cycle === maxCycle)

    const grouped: Record<string, PointRow> = {}
    cyclePts.forEach((p) => {
      if (!grouped[p.student_id]) {
        grouped[p.student_id] = {
          student_id: p.student_id,
          total_points: 0,
          student: p.students as PointRow['student'],
        }
      }
      grouped[p.student_id].total_points += p.points_earned
    })

    const sorted = Object.values(grouped).sort((a, b) => b.total_points - a.total_points)
    setRows(sorted)
    setLoading(false)
  }

  useEffect(() => { fetchPoints() }, [])

  const handleReset = async () => {
    setResetting(true)
    const newCycle = currentCycle + 1

    const { error } = await supabase.rpc('increment_points_cycle', { new_cycle: newCycle })
    if (error) {
      console.error(error)
      alert('リセットに失敗しました。管理者に連絡してください。')
    } else {
      setConfirmReset(false)
      await fetchPoints()
    }
    setResetting(false)
  }

  const handleDownload = () => {
    const xlsxRows = rows.map((r, i) => ({
      順位: i + 1,
      クラス: r.student?.class_name ?? '',
      出席番号: r.student?.seat_number ?? '',
      名前: r.student?.name ?? '',
      テストネーム: r.student?.test_name ?? '',
      通算ポイント: r.total_points,
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(xlsxRows)
    XLSX.utils.book_append_sheet(wb, ws, `ポイントランキング（サイクル${currentCycle}）`)
    XLSX.writeFile(wb, `ポイントランキング_cycle${currentCycle}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ポイント管理</h1>
          <p className="text-sm text-gray-500 mt-1">現在のサイクル: {currentCycle}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
          >
            Excelダウンロード
          </button>
          <button
            onClick={() => setConfirmReset(true)}
            className="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-200 transition"
          >
            ポイントリセット
          </button>
        </div>
      </div>

      {/* リセット確認モーダル */}
      {confirmReset && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-800">ポイントをリセットしますか？</h3>
            <p className="text-sm text-gray-500">
              サイクルが{currentCycle}→{currentCycle + 1}になります。
              現在のポイントは保持されますが、新サイクルは0からスタートします。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReset(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition"
              >
                キャンセル
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                {resetting ? 'リセット中...' : 'リセットする'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ランキング */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">通算ポイントランキング（サイクル{currentCycle}）</h2>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">読み込み中...</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-gray-400">ポイントデータがありません</div>
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
                {rows.map((r, i) => (
                  <tr
                    key={r.student_id}
                    className={`hover:bg-gray-50 ${i < 3 ? 'bg-yellow-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${i === 0 ? 'text-yellow-500 text-lg' : i === 1 ? 'text-gray-400 text-base' : i === 2 ? 'text-amber-600 text-base' : 'text-gray-500'}`}>
                        {i === 0 ? '1位' : i === 1 ? '2位' : i === 2 ? '3位' : `${i + 1}位`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.student?.class_name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{r.student?.seat_number ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{r.student?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.student?.test_name ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{r.total_points}pt</td>
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
