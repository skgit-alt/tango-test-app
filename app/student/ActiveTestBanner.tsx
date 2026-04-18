'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type MySession = {
  id: string
  test_id: string
  is_submitted: boolean
  score: number | null
} | null

type ActiveTest = {
  id: string
  title: string
  mode: number
  status: string
  open_classes: string[] | null
  published_classes?: string[] | null
  published_student_ids?: string[] | null
  mySession?: MySession
  _canSeeResult?: boolean
}

function cardColor(mode: number, started: boolean): string {
  if (started) return 'bg-green-600'
  if (mode === 50) return 'bg-violet-600'
  return 'bg-orange-500'
}

function TestCard({ test, studentClass }: { test: ActiveTest; studentClass: string }) {
  const classOpen = (test.open_classes ?? []).includes(studentClass)
  const isFullyOpen = test.status === 'open'
  const myClassStarted = isFullyOpen || classOpen
  const bgColor = cardColor(test.mode, myClassStarted)

  const session = test.mySession ?? null
  const submitted = session?.is_submitted ?? false
  const canSee = test._canSeeResult ?? false

  // ボタンの内容を決定
  let button: React.ReactNode

  if (submitted && canSee) {
    // 結果が公開されている → 結果を見る
    button = (
      <Link
        href={`/student/result?sessionId=${session!.id}`}
        className="block w-full bg-white py-2 rounded-xl font-bold text-center text-xs hover:opacity-90 active:scale-95 transition-all text-blue-700"
      >
        📊 結果を見る →
      </Link>
    )
  } else if (submitted && !canSee) {
    // 提出済みだが未公開 → 採点待ち
    button = (
      <Link
        href="/student/waiting-result"
        className="block w-full bg-white/80 py-2 rounded-xl font-bold text-center text-xs text-gray-500 cursor-default"
      >
        ⏳ 採点待ち...
      </Link>
    )
  } else if (session && !submitted) {
    // 開始したが未提出 → 再開
    button = (
      <Link
        href="/student/test"
        className="block w-full bg-white py-2 rounded-xl font-bold text-center text-xs hover:opacity-90 active:scale-95 transition-all text-orange-700"
      >
        ▶ テスト再開 →
      </Link>
    )
  } else if (myClassStarted) {
    // 自分のクラスが開始済み・未入室
    button = (
      <Link
        href={`/student/waiting?testId=${test.id}`}
        className="block w-full bg-white py-2 rounded-xl font-bold text-center text-xs hover:opacity-90 active:scale-95 transition-all text-gray-800"
      >
        待機画面へ →
      </Link>
    )
  } else {
    // まだ開始待ち
    button = (
      <Link
        href={`/student/waiting?testId=${test.id}`}
        className="block w-full bg-white py-2 rounded-xl font-bold text-center text-xs hover:opacity-90 active:scale-95 transition-all text-gray-800"
      >
        待機で待つ →
      </Link>
    )
  }

  // ステータスラベル
  let statusLabel: string
  if (submitted && canSee) {
    statusLabel = `✅ 結果公開中`
  } else if (submitted) {
    statusLabel = `📝 提出済み`
  } else if (isFullyOpen) {
    statusLabel = '✅ 全クラス実施中'
  } else if (classOpen) {
    statusLabel = `✅ ${studentClass}`
  } else {
    statusLabel = '⏳ 開始待ち'
  }

  return (
    <div className={`rounded-2xl p-4 text-white flex flex-col gap-3 ${bgColor}`}>
      <div>
        <p className="text-xs opacity-80 mb-0.5">{statusLabel}</p>
        <p className="font-bold text-sm leading-snug">{test.title}</p>
        <p className="text-xs mt-0.5 opacity-80">{test.mode}問モード</p>
        {submitted && session?.score !== null && session?.score !== undefined && (
          <p className="text-sm font-bold mt-1">
            {canSee ? `${session.score}点` : ''}
          </p>
        )}
      </div>
      {button}
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

  if (tests50.length === 0 || tests300.length === 0) {
    return (
      <div className="space-y-3">
        {activeTests.map((test) => (
          <TestCard key={test.id} test={test} studentClass={studentClass} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 px-1">⚡ 50問テスト</p>
        {tests50.map((test) => (
          <TestCard key={test.id} test={test} studentClass={studentClass} />
        ))}
      </div>
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 px-1">📝 300問テスト</p>
        {tests300.map((test) => (
          <TestCard key={test.id} test={test} studentClass={studentClass} />
        ))}
      </div>
    </div>
  )
}
