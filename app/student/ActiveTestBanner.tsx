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

function TestCard({ test, studentClass }: { test: ActiveTest; studentClass: string }) {
  const classOpen = (test.open_classes ?? []).includes(studentClass)
  const isFullyOpen = test.status === 'open'
  const myClassStarted = isFullyOpen || classOpen

  return (
    <div className={`rounded-2xl p-4 text-white flex flex-col gap-3 ${myClassStarted ? 'bg-green-600' : 'bg-blue-600'}`}>
      <div>
        <p className="text-xs opacity-80 mb-0.5">
          {isFullyOpen ? '✅ 全クラス実施中' : classOpen ? `✅ ${studentClass}` : '⏳ 開始待ち'}
        </p>
        <p className="font-bold text-sm leading-snug">{test.title}</p>
        <p className="text-xs mt-0.5 opacity-80">{test.mode}問モード</p>
      </div>
      <Link
        href={`/student/waiting?testId=${test.id}`}
        className="block w-full bg-white py-2 rounded-xl font-bold text-center text-xs hover:opacity-90 active:scale-95 transition-all text-gray-800"
      >
        {myClassStarted ? '待機画面へ →' : '待機で待つ →'}
      </Link>
    </div>
  )
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
    return () => { cancelled = true; clearTimeout(timeout); clearInterval(interval) }
  }, [])

  const activeTests = tests.filter((t) => ['waiting', 'open'].includes(t.status))
  const tests50 = activeTests.filter((t) => t.mode === 50)
  const tests300 = activeTests.filter((t) => t.mode === 300)

  if (activeTests.length === 0) return null

  // 片方しかない場合は1カラム
  if (tests50.length === 0 || tests300.length === 0) {
    return (
      <div className="space-y-3">
        {activeTests.map((test) => (
          <TestCard key={test.id} test={test} studentClass={studentClass} />
        ))}
      </div>
    )
  }

  // 両方ある場合は2カラム
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* 左：50問テスト */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 px-1">⚡ 50問テスト</p>
        {tests50.map((test) => (
          <TestCard key={test.id} test={test} studentClass={studentClass} />
        ))}
      </div>
      {/* 右：300問テスト */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 px-1">📝 300問テスト</p>
        {tests300.map((test) => (
          <TestCard key={test.id} test={test} studentClass={studentClass} />
        ))}
      </div>
    </div>
  )
}
