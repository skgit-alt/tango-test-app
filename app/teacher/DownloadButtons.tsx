'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'

export default function DownloadButtons() {
  const [loading300, setLoading300] = useState(false)
  const [loading50, setLoading50] = useState(false)
  const [loading20, setLoading20] = useState(false)

  const download300 = async () => {
    setLoading300(true)
    try {
      const res = await fetch('/api/teacher/download-excel?mode=300')
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'ダウンロードに失敗しました' }))
        alert(error ?? 'ダウンロードに失敗しました')
        return
      }
      const { header, rows, sheetName } = await res.json()

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      ws['!cols'] = [
        { wch: 8 },
        { wch: 6 },
        { wch: 14 },
        ...(header.slice(3).map(() => ({ wch: 16 }))),
      ]
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(wb, '300問テスト成績推移.xlsx')
    } catch (err) {
      console.error(err)
      alert('ダウンロードに失敗しました')
    } finally {
      setLoading300(false)
    }
  }

  const download50 = async () => {
    setLoading50(true)
    try {
      const res = await fetch('/api/teacher/download-excel?mode=50')
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'ダウンロードに失敗しました' }))
        alert(error ?? 'ダウンロードに失敗しました')
        return
      }
      const { header, rows, sheetName } = await res.json()

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      // 50問：固定3列 + テストごとに「点数」「ポイント」の2列
      const testCount = (header.length - 3) / 2
      ws['!cols'] = [
        { wch: 8 },
        { wch: 6 },
        { wch: 14 },
        ...Array.from({ length: testCount }).flatMap(() => [{ wch: 20 }, { wch: 10 }]),
      ]
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(wb, '50問テスト成績推移.xlsx')
    } catch (err) {
      console.error(err)
      alert('ダウンロードに失敗しました')
    } finally {
      setLoading50(false)
    }
  }

  const download20 = async () => {
    setLoading20(true)
    try {
      const res = await fetch('/api/teacher/download-excel?mode=20')
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'ダウンロードに失敗しました' }))
        alert(error ?? 'ダウンロードに失敗しました')
        return
      }
      const { header, rows, sheetName } = await res.json()

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      // 20問：固定3列 + テストごとに1列
      ws['!cols'] = [
        { wch: 8 },
        { wch: 6 },
        { wch: 14 },
        ...(header.slice(3).map(() => ({ wch: 16 }))),
      ]
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(wb, '20問テスト成績推移.xlsx')
    } catch (err) {
      console.error(err)
      alert('ダウンロードに失敗しました')
    } finally {
      setLoading20(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={download300}
        disabled={loading300}
        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
      >
        {loading300 ? '生成中...' : '📊 300問テスト推移'}
      </button>
      <button
        onClick={download50}
        disabled={loading50}
        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
      >
        {loading50 ? '生成中...' : '📊 50問テスト推移 (A〜D組)'}
      </button>
      <button
        onClick={download20}
        disabled={loading20}
        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
      >
        {loading20 ? '生成中...' : '📊 20問テスト推移 (1〜6組)'}
      </button>
    </div>
  )
}
