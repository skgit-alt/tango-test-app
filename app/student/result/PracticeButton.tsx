'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PracticeButton({ testId }: { testId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handlePractice = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/student/start-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId }),
      })
      if (!res.ok) throw new Error('Failed to start practice')
      // テスト画面に遷移（test/page.tsx が未提出の練習セッションを拾う）
      router.push('/student/test')
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handlePractice}
      disabled={loading}
      className="block w-full bg-amber-500 text-white py-3 rounded-xl font-semibold text-center hover:bg-amber-600 active:bg-amber-700 transition disabled:opacity-60"
    >
      {loading ? '準備中...' : '🔄 練習としてもう一度受け直す'}
    </button>
  )
}
