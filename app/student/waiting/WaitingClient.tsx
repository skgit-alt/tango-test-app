'use client'

import { useState } from 'react'
import { Student, Test, Session } from '@/lib/supabase/types'

export default function WaitingClient({
  student,
  test,
  existingSession,
}: {
  student: Student
  test: Test
  existingSession: Session | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStartTest = async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/student/start-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId: test.id,
          existingSessionId: existingSession?.id ?? null,
        }),
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error ?? 'セッション作成に失敗しました')
      }

      window.location.href = '/student/test'
    } catch (err) {
      console.error(err)
      setError('エラーが発生しました。もう一度お試しください。')
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}分${s > 0 ? `${s}秒` : ''}`
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full space-y-6 text-center">
        <div className="text-5xl">📝</div>

        {/* テスト情報 */}
        <div>
          <h1 className="text-xl font-bold text-gray-800 mb-1">{test.title}</h1>
          <p className="text-sm text-gray-500">
            {test.mode}問 ／ 制限時間 {formatTime(test.time_limit)}
          </p>
        </div>

        {/* 生徒情報 */}
        <div className="bg-blue-50 rounded-xl p-4 text-left">
          <p className="text-xs text-blue-500 mb-1">受験者情報</p>
          <p className="font-semibold text-gray-800">{student.name}</p>
          <p className="text-sm text-gray-500">{student.class_name}　{student.seat_number}番</p>
          {student.test_name && (
            <p className="text-sm text-blue-600 mt-1">テストネーム: {student.test_name}</p>
          )}
        </div>

        {/* 注意事項 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-left">
          <p className="text-xs font-bold text-yellow-800 mb-1">⚠️ 注意事項</p>
          <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
            <li>開始後はタイマーが止まりません</li>
            <li>タブ切り替えは不正行為として記録されます</li>
            <li>自信がない問題は ★ ボタンでマークできます（見直し時にフィルターで絞れます）</li>
            <li>準備ができたら「テスト開始」を押してください</li>
          </ul>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>
        )}

        <button
          onClick={handleStartTest}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 active:bg-blue-800 transition disabled:opacity-50 shadow-md"
        >
          {loading ? '準備中...' : 'テスト開始'}
        </button>

        <a href="/student" className="block text-sm text-gray-400 hover:text-gray-600 transition">
          ホームに戻る
        </a>
      </div>
    </div>
  )
}
