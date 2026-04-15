'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type ActiveTest = {
  id: string
  title: string
  mode: number
  status: string
  open_classes: string[] | null
}

export default function ActiveTestBanner({
  studentClass,
  initialTest,
}: {
  studentClass: string
  initialTest: ActiveTest | null
}) {
  const supabase = createClient()
  const [test, setTest] = useState<ActiveTest | null>(initialTest)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      const { data } = await supabase
        .from('tests')
        .select('id, title, mode, status, open_classes')
        .in('status', ['waiting', 'open'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled) setTest(data ?? null)
    }

    // 初回即時取得 + 3秒ごとにポーリング
    poll()
    const interval = setInterval(poll, 3000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [supabase])

  if (!test) return null

  // 自分のクラスが開放されているか
  const classOpen = (test.open_classes ?? []).includes(studentClass)
  const canEnter = test.status === 'open' || test.status === 'waiting'

  if (!canEnter) return null

  return (
    <div className="bg-blue-600 rounded-2xl p-5 text-white">
      <p className="text-blue-200 text-sm mb-1">
        {test.status === 'open'
          ? '実施中のテスト'
          : classOpen
          ? `${studentClass} のテストが開始されました`
          : '実施予定のテスト'}
      </p>
      <p className="font-bold text-lg">{test.title}</p>
      <p className="text-blue-200 text-sm mt-1">{test.mode}問モード</p>

      {(test.status === 'open' || classOpen) && (
        <Link
          href="/student/waiting"
          className="mt-4 block w-full bg-white text-blue-600 py-3 rounded-xl font-bold text-center hover:bg-blue-50 active:scale-95 transition-all"
        >
          テスト待機画面へ →
        </Link>
      )}

      {test.status === 'waiting' && !classOpen && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
          </div>
          <p className="text-blue-200 text-sm">開始を待っています...</p>
        </div>
      )}
    </div>
  )
}
