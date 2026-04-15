'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function WaitingResultPage() {
  const supabase = createClient()
  const router = useRouter()
  const [testTitle, setTestTitle] = useState('')

  useEffect(() => {
    // 最新のテストを取得して監視
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: session } = await supabase
        .from('sessions')
        .select('test_id, tests(title, status)')
        .eq('is_submitted', true)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!session) { router.push('/student'); return }

      const testData = session.tests as { title: string; status: string } | null
      if (!testData) { router.push('/student'); return }

      setTestTitle(testData.title)

      // 既に公開済みならすぐに遷移
      if (testData.status === 'published') {
        router.push('/student/result')
        return
      }

      // Realtime でテストステータスを監視
      const channel = supabase
        .channel('waiting-result')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tests',
            filter: `id=eq.${session.test_id}`,
          },
          (payload) => {
            if (payload.new?.status === 'published') {
              router.push('/student/result')
            }
          }
        )
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }

    init()
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
