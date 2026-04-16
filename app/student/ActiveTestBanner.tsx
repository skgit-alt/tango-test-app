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
  initialTests,
}: {
  studentClass: string
  initialTests: ActiveTest[]
}) {
  const [tests, setTests] = useState<ActiveTest[]>(initialTests)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch('/api/student/active-test', { cache: 'no-store' })
        if (!res.ok) return
        const data: ActiveTest[] = await res.json()
        if (!cancelled) setTests(data ?? [])
      } catch (e) {
        console.error('[ActiveTestBanner] poll error:', e)
      }
    }

    const timeout = setTimeout(poll, 500)
    const interval = setInterval(poll, 3000)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  const activeTests = tests.filter((t) => ['waiting', 'open'].includes(t.status))
  if (activeTests.length === 0) return null

  return (
    <div className="space-y-3">
      {activeTests.map((test) => {
        const classOpen = (test.open_classes ?? []).includes(studentClass)
        const isFullyOpen = test.status === 'open'
        const myClassStarted = isFullyOpen || classOpen

        return (
          <div
            key={test.id}
            className={`rounded-2xl p-5 text-white ${myClassStarted ? 'bg-green-600' : 'bg-blue-600'}`}
          >
            <p className="text-sm mb-1 opacity-80">
              {isFullyOpen
                ? '✅ 全クラス実施中'
                : classOpen
                ? `✅ ${studentClass} 開始済み`
                : '⏳ テスト配信中（開始待ち）'}
            </p>
            <p className="font-bold text-lg">{test.title}</p>
            <p className="text-sm mt-1 opacity-80">{test.mode}問モード</p>

            <Link
              href={`/student/waiting?testId=${test.id}`}
              className="mt-4 block w-full bg-white py-3 rounded-xl font-bold text-center hover:opacity-90 active:scale-95 transition-all text-gray-800"
            >
              {myClassStarted ? 'テスト待機画面へ →' : '待機画面で待つ →'}
            </Link>
          </div>
        )
      })}
    </div>
  )
}
