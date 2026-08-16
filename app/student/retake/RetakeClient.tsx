'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Test = {
  id: string
  title: string
  mode: number
  created_at: string
  pass_score: number | null
}

const MODE_CONFIG = [
  { mode: 50,  label: '50問テスト',  emoji: '⚡', labelClass: 'text-purple-700 bg-purple-100' },
  { mode: 20,  label: '20問テスト',  emoji: '📄', labelClass: 'text-orange-700 bg-orange-100' },
  { mode: 300, label: '300問テスト', emoji: '📋', labelClass: 'text-teal-700   bg-teal-100'   },
  { mode: 600, label: '600問テスト', emoji: '📘', labelClass: 'text-blue-700   bg-blue-100'   },
]

export default function RetakeClient({
  tests,
  lastPracticeMap,
}: {
  tests: Test[]
  lastPracticeMap: Record<string, { score: number; submitted_at: string }>
}) {
  const router = useRouter()
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startPractice = async (testId: string) => {
    setStarting(testId)
    setError(null)
    try {
      const res = await fetch('/api/student/start-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId }),
      })
      const data = await res.json()
      if (data.sessionId) {
        router.push(`/student/test?sessionId=${data.sessionId}`)
      } else {
        setError('テストを開始できませんでした')
        setStarting(null)
      }
    } catch {
      setError('通信エラーが発生しました')
      setStarting(null)
    }
  }

  return (
    <div className="min-h-screen bg-blue-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/student" className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-bold text-gray-800">テストを受け直す</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <p className="text-sm text-gray-500 px-1">
          公開済みのテストを練習として受け直せます。終わったらすぐに結果が確認できます。
        </p>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {tests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-500 font-medium">受け直せるテストがありません</p>
            <p className="text-gray-400 text-sm mt-1">テストが公開されるとここに表示されます</p>
            <Link href="/student" className="mt-6 inline-block text-blue-600 text-sm hover:underline">
              ホームに戻る
            </Link>
          </div>
        ) : (
          <>
            {MODE_CONFIG.map(({ mode, label, emoji, labelClass }) => {
              const modeTests = tests.filter((t) => t.mode === mode)
              if (modeTests.length === 0) return null
              return (
                <div key={mode}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${labelClass}`}>
                      {emoji} {label}
                    </span>
                    <span className="text-xs text-gray-400">{modeTests.length}件</span>
                  </div>
                  <div className="space-y-2">
                    {modeTests.map((test) => {
                      const last = lastPracticeMap[test.id]
                      return (
                        <div
                          key={test.id}
                          className="bg-white rounded-2xl border border-gray-200 px-5 py-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-800 text-sm leading-snug">
                                {test.title}
                              </p>
                              {last ? (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  前回: <span className="font-medium text-gray-600">{last.score}点</span>
                                  　{new Date(last.submitted_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                                </p>
                              ) : (
                                <p className="text-xs text-gray-400 mt-0.5">未受験</p>
                              )}
                            </div>
                            {last ? (
                              <span className="shrink-0 bg-gray-100 text-gray-400 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap cursor-not-allowed">
                                受験済み
                              </span>
                            ) : (
                              <button
                                onClick={() => startPractice(test.id)}
                                disabled={starting !== null}
                                className="shrink-0 bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-600 active:bg-amber-700 transition disabled:opacity-50 whitespace-nowrap"
                              >
                                {starting === test.id ? '準備中...' : '受け直す'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <div className="pt-2 text-center">
              <Link href="/student" className="text-blue-600 text-sm hover:underline">
                ホームに戻る
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
