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

function cardColor(mode: number): string {
  if (mode === 50) return 'bg-violet-600'
  if (mode === 300) return 'bg-blue-600'
  return 'bg-orange-500'
}

function TestCard({ test, studentClass }: { test: ActiveTest; studentClass: string }) {
  const session = test.mySession ?? null
  const submitted = session?.is_submitted ?? false
  const canSee = test._canSeeResult ?? false
  const bgColor = cardColor(test.mode)

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
  } else {
    // 未開始 → 開始ページへ
    button = (
      <Link
        href={`/student/waiting?testId=${test.id}`}
        className="block w-full bg-white py-2 rounded-xl font-bold text-center text-xs hover:opacity-90 active:scale-95 transition-all text-gray-800"
      >
        テストを開始 →
      </Link>
    )
  }

  // ステータスラベル
  let statusLabel: string
  if (submitted && canSee) {
    statusLabel = '✅ 結果公開中'
  } else if (submitted) {
    statusLabel = '📝 提出済み'
  } else {
    statusLabel = '✅ 受付中'
  }

  return (
    <div className={`rounded-2xl p-4 text-white flex flex-col gap-3 ${bgColor}`}>
      <div>
        <p className="text-xs opacity-80 mb-0.5">{statusLabel}</p>
        <p className="font-bold text-sm leading-snug">{test.title}</p>
        <p className="text-xs mt-0.5 opacity-80">{test.mode}問モード</p>
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
    // 初回即座にポーリング
    poll()
    const interval = setInterval(poll, 2000)
    // タブ再表示時も即座にポーリング
    const onVisible = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // APIが既にフィルタリング済みだが、万が一のフォールバック
  const activeTests = tests.filter((t) => ['waiting', 'open'].includes(t.status))
  const tests50 = activeTests.filter((t) => t.mode === 50)
  const tests300 = activeTests.filter((t) => t.mode === 300)
  const testsOther = activeTests.filter((t) => t.mode !== 50 && t.mode !== 300)

  if (activeTests.length === 0) return null

  // 50問と300問が両方ある場合は2列グリッド＋20問テストを下に追加
  if (tests50.length > 0 && tests300.length > 0) {
    return (
      <div className="space-y-3">
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
        {testsOther.length > 0 && (
          <div className="space-y-3">
            {testsOther.map((test) => (
              <TestCard key={test.id} test={test} studentClass={studentClass} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // それ以外は1列で全て表示
  return (
    <div className="space-y-3">
      {activeTests.map((test) => (
        <TestCard key={test.id} test={test} studentClass={studentClass} />
      ))}
    </div>
  )
}
