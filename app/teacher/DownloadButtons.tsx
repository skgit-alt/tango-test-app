'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { calcPoints } from '@/lib/supabase/types'

export default function DownloadButtons() {
  const supabase = createClient()
  const [loading300, setLoading300] = useState(false)
  const [loading50, setLoading50] = useState(false)

  const download300 = async () => {
    setLoading300(true)
    try {
      // 生徒一覧を取得
      const { data: students } = await supabase
        .from('students')
        .select('id, name, class_name, seat_number')
        .order('class_name')
        .order('seat_number')

      // 300問テスト一覧を取得（published のみ）
      const { data: tests } = await supabase
        .from('tests')
        .select('id, title, opened_at, created_at')
        .eq('mode', 300)
        .eq('status', 'published')
        .order('opened_at', { ascending: true })

      if (!students || !tests || tests.length === 0) {
        alert('ダウンロードできるデータがありません')
        return
      }

      // セッションを取得
      const { data: sessions } = await supabase
        .from('sessions')
        .select('student_id, test_id, score')
        .in('test_id', tests.map((t) => t.id))
        .eq('is_submitted', true)

      // student_id + test_id → score のマップを作成
      const scoreMap = new Map<string, number | null>()
      for (const s of sessions ?? []) {
        scoreMap.set(`${s.student_id}__${s.test_id}`, s.score)
      }

      // ヘッダー行を作成
      const header = ['クラス', '番号', '名前', ...tests.map((t) => {
        const date = t.opened_at ?? t.created_at
        return `${t.title}\n(${new Date(date).toLocaleDateString('ja-JP')})`
      })]

      // データ行を作成
      const rows = (students ?? []).map((student) => {
        const row: (string | number | null)[] = [
          student.class_name,
          student.seat_number,
          student.name,
        ]
        for (const test of tests) {
          const score = scoreMap.get(`${student.id}__${test.id}`)
          row.push(score !== undefined ? score : null)
        }
        return row
      })

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])

      // 列幅の設定
      ws['!cols'] = [
        { wch: 8 },
        { wch: 6 },
        { wch: 14 },
        ...tests.map(() => ({ wch: 16 })),
      ]

      XLSX.utils.book_append_sheet(wb, ws, '300問テスト推移')
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
      const { data: students } = await supabase
        .from('students')
        .select('id, name, class_name, seat_number')
        .order('class_name')
        .order('seat_number')

      const { data: tests } = await supabase
        .from('tests')
        .select('id, title, opened_at, created_at')
        .eq('mode', 50)
        .eq('status', 'published')
        .order('opened_at', { ascending: true })

      if (!students || !tests || tests.length === 0) {
        alert('ダウンロードできるデータがありません')
        return
      }

      const { data: sessions } = await supabase
        .from('sessions')
        .select('student_id, test_id, score')
        .in('test_id', tests.map((t) => t.id))
        .eq('is_submitted', true)

      const scoreMap = new Map<string, number | null>()
      for (const s of sessions ?? []) {
        scoreMap.set(`${s.student_id}__${s.test_id}`, s.score)
      }

      // ヘッダー：テストごとに「点数」「ポイント」の2列
      const header = ['クラス', '番号', '名前']
      for (const t of tests) {
        const date = t.opened_at ?? t.created_at
        const label = `${t.title}\n(${new Date(date).toLocaleDateString('ja-JP')})`
        header.push(`${label} 点数`, `${label} ポイント`)
      }

      const rows = (students ?? []).map((student) => {
        const row: (string | number | null)[] = [
          student.class_name,
          student.seat_number,
          student.name,
        ]
        for (const test of tests) {
          const score = scoreMap.get(`${student.id}__${test.id}`)
          if (score !== undefined && score !== null) {
            row.push(score, calcPoints(score))
          } else {
            row.push(null, null)
          }
        }
        return row
      })

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])

      ws['!cols'] = [
        { wch: 8 },
        { wch: 6 },
        { wch: 14 },
        ...tests.flatMap(() => [{ wch: 16 }, { wch: 10 }]),
      ]

      XLSX.utils.book_append_sheet(wb, ws, '50問テスト推移')
      XLSX.writeFile(wb, '50問テスト成績推移.xlsx')
    } catch (err) {
      console.error(err)
      alert('ダウンロードに失敗しました')
    } finally {
      setLoading50(false)
    }
  }

  return (
    <div className="flex gap-2">
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
        {loading50 ? '生成中...' : '📊 50問テスト推移'}
      </button>
    </div>
  )
}
