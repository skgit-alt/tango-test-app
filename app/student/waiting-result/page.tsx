'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function WaitingResultPage() {
  const supabase = createClient()
  const router = useRouter()
  const [testTitle, setTestTitle] = useState('')
  const testIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // admin API 経由でセッションを取得（RLSバイパス）
      const sessionRes = await fetch(
        `/api/student/test-status?_session_lookup=1`,
        { cache: 'no-store' }
      )
      // 最新の自分のセッションのtestIdを取得
      const { data: recentSession } = await supabase
        .from('sessions')
        .select('test_id, tests(title)')
        .eq('student_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!recentSession) { router.push('/student'); return }

      const testRaw = recentSession.tests as { title: string } | { title: string }[] | null
      const testData = Array.isArray(testRaw) ? testRaw[0] : testRaw
      if (!testData) { router.push('/student'); return }

      setTestTitle(testData.title)
      testIdRef.current = recentSession.test_id

      // ポーリング：2秒ごとに公開状態を確認（_canSeeResult を使用）
      const poll = async () => {
        if (cancelled || !testIdRef.current) return
        try {
          const res = await fetch(`/api/student/test-status?testId=${testIdRef.current}`, { cache: 'no-store' })
          if (!res.ok) return
          const data = await res.json()
          if (data?._canSeeResult && !cancelled) {
            router.push('/student/result')
          }
        } catch (e) {
          console.error('[waiting-result] poll error:', e)
        }
      }

      // 既に公開済みならすぐに遷移
      await poll()
      if (cancelled) return

      const interval = setInterval(poll, 2000)

      // Realtimeも併用（変更があればポーリングを即時実行）
      const channel = supabase
        .channel('waiting-result')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tests', filter: `id=eq.${recentSession.test_id}` },
          () => { if (!cancelled) poll() }
        )
        .subscribe()

      return () => {
        cancelled = true
        clearInterval(interval)
        supabase.removeChannel(channel)
      }
    }

    const cleanup = init()
    return () => {
      cancelled = true
      cleanup.then(fn => fn?.())
    }
  }, [supabase, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full space-y-6 text-center">
        <div className="text-5xl">🎉</div>

        <div>
          <h1 className="text-xl font-bold text-gray-800 mb-1">回答を送信しました！</h1>
          {testTitle && <p className="text-sm text-gray-500">{testTitle}</p>}
        </div>

        <div className="bg-blue-50 rounded-2xl p-6 space-y-3">
          <div className="flex justify-center">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
          <p className="text-blue-700 font-medium">先生の結果公開を待っています...</p>
          <p className="text-blue-500 text-sm">結果が公開されると自動的に移動します</p>
        </div>

        <p className="text-xs text-gray-400">
          このページを閉じても結果は保存されています
        </p>
      </div>
    </div>
  )
}
