'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PracticeButton({ testId }: { testId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePractice = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/student/start-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました')
        setLoading(false)
        return
      }
      // sessionId をURLに渡してテスト画面へ遷移
      router.push(`/student/test?practiceSessionId=${data.sessionId}`)
    } catch (err) {
      console.error(err)
      setError('通信エラーが発生しました')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handlePractice}
        disabled={loading}
        className="block w-full bg-amber-500 text-white py-3 rounded-xl font-semibold text-center hover:bg-amber-600 active:bg-amber-700 transition disabled:opacity-60"
      >
        {loading ? '準備中...' : '🔄 練習としてもう一度受け直す'}
      </button>
      {error && (
        <p className="text-red-500 text-xs text-center">{error}</p>
      )}
    </div>
  )
}
