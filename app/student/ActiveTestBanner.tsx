'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
  const [test, setTest] = useState<ActiveTest | null>(initialTest)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch('/api/student/active-test', { cache: 'no-store' })
        if (!res.ok) return // 失敗したときは前の値を保持
        const data: ActiveTest | null = await res.json()
        if (!cancelled) setTest(data)
      } catch (e) {
        // ネットワークエラー時は前の値を保持
        console.error('[ActiveTestBanner] poll error:', e)
      }
    }

    // 初回は少し遅らせて initialTest を先に表示する
    const timeout = setTimeout(poll, 500)
    const interval = setInterval(poll, 3000)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  if (!test || !['waiting', 'open'].includes(test.status)) return null

  const classOpen = (test.open_classes ?? []).includes(studentClass)
  const isFullyOpen = test.status === 'open'
  const myClassStarted = isFullyOpen || classOpen

  return (
    <div className={`rounded-2xl p-5 text-white ${myClassStarted ? 'bg-green-600' : 'bg-blue-600'}`}>
      <p className="text-sm mb-1 opacity-80">
        {isFullyOpen ? '✅ 全クラス実施中' : classOpen ? `✅ ${studentClass} 開始済み` : '⏳ テスト配信中（開始待ち）'}
      </p>
      <p className="font-bold text-lg">{test.title}</p>
      <p className="text-sm mt-1 opacity-80">{test.mode}問モード</p>

      {/* 状態にかかわらず常にボタンを表示 */}
      <Link
        href="/student/waiting"
        className="mt-4 block w-full bg-white py-3 rounded-xl font-bold text-center hover:opacity-90 active:scale-95 transition-all text-gray-800"
      >
        {myClassStarted ? 'テスト待機画面へ →' : '待機画面で待つ →'}
      </Link>
    </div>
  )
}
