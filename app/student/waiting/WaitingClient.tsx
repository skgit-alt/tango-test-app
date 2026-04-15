'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
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
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStartTest = async () => {
    if (test.status !== 'open') {
      setError('先生がまだテストを開始していません。少しお待ちください。')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 130人同時接続対策: ランダム遅延 0~2000ms
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000))

      const now = new Date().toISOString()

      if (existingSession) {
        // 既存セッションの開始時刻を更新（まだ started_at が null の場合）
        if (!existingSession.started_at) {
          await supabase
            .from('sessions')
            .update({ started_at: now })
            .eq('id', existingSession.id)
        }
      } else {
        // 新規セッション作成
        const { error: sessionError } = await supabase
          .from('sessions')
          .insert({
            test_id: test.id,
            student_id: student.id,
            started_at: now,
            is_submitted: false,
            current_page: 1,
          })

        if (sessionError) throw sessionError
      }

      router.push('/student/test')
    } catch (err) {
      console.error(err)
      setError('エラーが発生しました。もう一度お試しください。')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full space-y-6 text-center">
        <div className="text-5xl">📝</div>

        {/* テスト情報 */}
        <div>
          <h1 className="text-xl font-bold text-gray-800 mb-1">{test.title}</h1>
          <p className="text-sm text-gray-500">{test.mode}問 / {test.time_limit}秒</p>
        </div>

        {/* 生徒情報 */}
        <div className="bg-blue-50 rounded-xl p-4 text-left">
          <p className="text-xs text-blue-500 mb-1">受験者情報</p>
          <p className="font-semibold text-gray-800">{student.name}</p>
          <p className="text-sm text-gray-500">{student.class_name} &nbsp; {student.seat_number}番</p>
          <p className="text-sm text-blue-600 mt-1">テストネーム: {student.test_name}</p>
        </div>

        {/* ステータス表示 */}
        {test.status === 'waiting' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-yellow-800 text-sm font-medium">先生のテスト開始を待っています...</p>
            <div className="flex justify-center mt-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        {test.status === 'open' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-green-700 text-sm font-medium">テストが開始されました！</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>
        )}

        <button
          onClick={handleStartTest}
          disabled={loading || test.status === 'waiting'}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 active:bg-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          {loading ? '準備中...' : test.status === 'waiting' ? '開始を待っています...' : 'テスト開始'}
        </button>

        <a href="/student" className="block text-sm text-gray-400 hover:text-gray-600 transition">
          ホームに戻る
        </a>
      </div>
    </div>
  )
}
