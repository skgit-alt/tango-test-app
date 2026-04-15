'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Test, Session, Question } from '@/lib/supabase/types'

const QUESTIONS_PER_PAGE = 100

interface CheatWarning {
  visible: boolean
  count: number
  eventType: string
}

export default function TestClient({
  test,
  session,
  questions,
  initialAnswers,
}: {
  test: Test
  session: Session
  questions: Question[]
  initialAnswers: Record<string, number | null>
}) {
  const supabase = createClient()
  const router = useRouter()

  const [answers, setAnswers] = useState<Record<string, number | null>>(initialAnswers)
  const [currentPage, setCurrentPage] = useState(session.current_page ?? 1)
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (!session.started_at) return test.time_limit
    const elapsed = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
    return Math.max(0, test.time_limit - elapsed)
  })
  const [submitting, setSubmitting] = useState(false)
  const [cheatWarning, setCheatWarning] = useState<CheatWarning>({
    visible: false,
    count: 0,
    eventType: '',
  })
  const [contentHidden, setContentHidden] = useState(false)
  const cheatCountRef = useRef(0)
  const submittingRef = useRef(false)

  const totalPages = test.mode === 300 ? 3 : 1

  // ページごとの問題
  const pageQuestions = test.mode === 300
    ? questions.slice((currentPage - 1) * QUESTIONS_PER_PAGE, currentPage * QUESTIONS_PER_PAGE)
    : questions

  // テスト送信
  const submitTest = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)

    try {
      const answersArray = questions.map((q) => ({
        question_id: q.id,
        selected_answer: answers[q.id] ?? null,
      }))

      const { error } = await supabase.rpc('submit_test', {
        p_session_id: session.id,
        p_answers: answersArray,
      })

      if (error) {
        console.error('submit_test RPC error:', error)
        // フォールバック: 手動で answers を insert して sessions を更新
        const upsertData = answersArray.map((a) => ({
          session_id: session.id,
          question_id: a.question_id,
          selected_answer: a.selected_answer,
          is_correct: null,
        }))

        await supabase.from('answers').upsert(upsertData, { onConflict: 'session_id,question_id' })
        await supabase
          .from('sessions')
          .update({ is_submitted: true, submitted_at: new Date().toISOString() })
          .eq('id', session.id)
      }

      router.push('/student/waiting-result')
    } catch (err) {
      console.error(err)
      setSubmitting(false)
      submittingRef.current = false
    }
  }, [answers, questions, session.id, supabase, router])

  // タイマー
  useEffect(() => {
    if (timeLeft <= 0) {
      submitTest()
      return
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          submitTest()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [timeLeft, submitTest])

  // 不正検知: ログを記録するヘルパー
  const logCheat = useCallback(async (eventType: 'tab_leave' | 'app_switch' | 'split_view') => {
    if (submittingRef.current) return
    cheatCountRef.current += 1
    setCheatWarning({
      visible: true,
      count: cheatCountRef.current,
      eventType,
    })
    setContentHidden(true)

    await supabase.from('cheat_logs').insert({
      session_id: session.id,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
    })
  }, [supabase, session.id])

  // visibilitychange → tab_leave
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        logCheat('tab_leave')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [logCheat])

  // blur → app_switch
  useEffect(() => {
    const handleBlur = () => {
      if (!document.hidden) {
        logCheat('app_switch')
      }
    }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [logCheat])

  // resize → split_view（画面幅が大幅に変化）
  useEffect(() => {
    let initialWidth = window.innerWidth
    const handleResize = () => {
      const currentWidth = window.innerWidth
      const delta = Math.abs(currentWidth - initialWidth)
      if (delta > 200) {
        logCheat('split_view')
        initialWidth = currentWidth
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [logCheat])

  // 現在ページをDBに保存
  const saveCurrentPage = useCallback(async (page: number) => {
    await supabase
      .from('sessions')
      .update({ current_page: page })
      .eq('id', session.id)
  }, [supabase, session.id])

  const handlePageChange = async (newPage: number) => {
    setCurrentPage(newPage)
    await saveCurrentPage(newPage)
  }

  const handleAnswer = (questionId: string, choice: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choice }))
  }

  const handleDismissWarning = () => {
    setCheatWarning((prev) => ({ ...prev, visible: false }))
    setContentHidden(false)
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const answeredCount = questions.filter((q) => answers[q.id] != null).length
  const timerColor = timeLeft <= 30 ? 'text-red-600' : timeLeft <= 60 ? 'text-orange-500' : 'text-gray-800'

  const cheatEventLabel: Record<string, string> = {
    tab_leave: 'タブ離脱',
    app_switch: 'アプリ切替',
    split_view: '画面分割',
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 不正行為警告モーダル */}
      {cheatWarning.visible && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="text-center">
              <div className="text-5xl mb-3">⚠️</div>
              <h2 className="text-lg font-bold text-red-700">不正行為が検出されました</h2>
              <p className="text-sm text-gray-600 mt-2">
                {cheatEventLabel[cheatWarning.eventType] ?? cheatWarning.eventType} が検知されました。
                この行動は記録されています。
              </p>
              <p className="text-sm text-red-600 font-medium mt-2">
                検出回数: {cheatWarning.count}回
              </p>
            </div>
            <button
              onClick={handleDismissWarning}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition"
            >
              テストに戻る
            </button>
          </div>
        </div>
      )}

      {/* ヘッダー（タイマー） */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {test.mode === 300 && (
              <span className="font-medium">{currentPage} / {totalPages} ページ</span>
            )}
          </div>

          <div className={`text-2xl font-bold tabular-nums ${timerColor}`}>
            {formatTime(timeLeft)}
          </div>

          <div className="text-sm text-gray-500">
            {answeredCount} / {questions.length}
          </div>
        </div>

        {/* プログレスバー */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-1000"
            style={{ width: `${((test.time_limit - timeLeft) / test.time_limit) * 100}%` }}
          />
        </div>
      </header>

      {/* メインコンテンツ */}
      {contentHidden ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <p className="text-xl font-medium">問題を表示できません</p>
            <p className="text-sm mt-2">警告を閉じてテストに戻ってください</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
          {pageQuestions.map((q, pageIndex) => {
            const globalIndex = test.mode === 300
              ? (currentPage - 1) * QUESTIONS_PER_PAGE + pageIndex
              : pageIndex

            // 選択肢の作成（Noneまたはnullの選択肢を除外）
            const allChoices = [
              { num: 1, text: q.choice1 },
              { num: 2, text: q.choice2 },
              { num: 3, text: q.choice3 },
              { num: 4, text: q.choice4 },
              { num: 5, text: q.choice5 },
            ]
            const validChoices = allChoices.filter(
              (c) => c.text && c.text !== 'None' && c.text !== 'null'
            )

            const selected = answers[q.id]

            return (
              <div key={q.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                {/* 問題番号と問題文 */}
                <div className="flex items-start gap-3 mb-4">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-lg shrink-0 mt-0.5">
                    {globalIndex + 1}
                  </span>
                  <p className="text-gray-800 font-medium leading-relaxed">{q.question_text}</p>
                </div>

                {/* 選択肢 */}
                <div className="space-y-2">
                  {validChoices.map((choice) => {
                    const isSelected = selected === choice.num
                    return (
                      <button
                        key={choice.num}
                        onClick={() => handleAnswer(q.id, choice.num)}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition text-sm font-medium
                          ${isSelected
                            ? 'border-blue-500 bg-blue-50 text-blue-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/50 active:bg-blue-50'
                          }`}
                      >
                        <span className="text-gray-400 mr-2 text-xs">
                          {choice.num === 1 ? '①' : choice.num === 2 ? '②' : choice.num === 3 ? '③' : choice.num === 4 ? '④' : '⑤'}
                        </span>
                        {choice.text}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* ページング・送信ボタン */}
          <div className="sticky bottom-4">
            {test.mode === 300 ? (
              <div className="flex gap-3">
                {currentPage > 1 && (
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="flex-1 bg-white border border-gray-300 text-gray-700 py-4 rounded-2xl font-semibold hover:bg-gray-50 transition"
                  >
                    ← 前のページ
                  </button>
                )}
                {currentPage < totalPages ? (
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-semibold hover:bg-blue-700 transition shadow-md"
                  >
                    次のページ →
                  </button>
                ) : (
                  <button
                    onClick={submitTest}
                    disabled={submitting}
                    className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 transition disabled:opacity-50 shadow-md"
                  >
                    {submitting ? '送信中...' : '回答を送信する'}
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={submitTest}
                disabled={submitting}
                className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 transition disabled:opacity-50 shadow-md"
              >
                {submitting ? '送信中...' : '回答を送信する'}
              </button>
            )}
          </div>

          <div className="h-4" />
        </div>
      )}
    </div>
  )
}
