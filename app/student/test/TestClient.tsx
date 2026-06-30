'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  isPractice = false,
}: {
  test: Test
  session: Session
  questions: Question[]
  initialAnswers: Record<string, number | null>
  isPractice?: boolean
}) {
  const router = useRouter()

  const [answers, setAnswers] = useState<Record<string, number | null>>(initialAnswers)
  const [currentPage, setCurrentPage] = useState(session.current_page ?? 1)
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (!session.started_at) return test.time_limit
    const elapsed = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
    return Math.max(0, test.time_limit - elapsed)
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [cheatWarning, setCheatWarning] = useState<CheatWarning>({
    visible: false,
    count: 0,
    eventType: '',
  })
  const [contentHidden, setContentHidden] = useState(false)
  const [deviceBlocked, setDeviceBlocked] = useState(false)
  const [splitViewBlocked, setSplitViewBlocked] = useState(false)
  const cheatCountRef = useRef(0)
  const submittingRef = useRef(false)
  const deviceTokenRef = useRef<string>('')
  const topRef = useRef<HTMLDivElement>(null)
  const answersRef = useRef(answers)
  const submitTestRef = useRef<() => void>(() => {})

  const MAX_RETRIES = 3
  const RETRY_DELAYS = [1000, 2000, 3000]
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  const totalPages = test.mode === 300 ? 3 : 1

  const pageQuestions = test.mode === 300
    ? questions.slice((currentPage - 1) * QUESTIONS_PER_PAGE, currentPage * QUESTIONS_PER_PAGE)
    : questions

  // ★絞り込み時は全問題から flagged のものだけを表示
  const displayQuestions = showFlaggedOnly
    ? questions.filter((q) => flagged.has(q.id))
    : pageQuestions

  // answersRefを常に最新の状態に保つ（定期保存用）
  useEffect(() => { answersRef.current = answers }, [answers])

  const submitTest = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    setRetryCount(0)

    const answersArray = questions.map((q) => ({
      question_id: q.id,
      selected_answer: answers[q.id] ?? null,
      flagged: flagged.has(q.id),
    }))

    let lastError = '不明なエラー'

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        setRetryCount(attempt)
        await sleep(RETRY_DELAYS[attempt - 1])
      }
      try {
        const res = await fetch('/api/student/submit-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, answers: answersArray }),
        })
        if (res.ok) {
          // 成功 → ページ遷移（submittingRefはリセットしない）
          if (isPractice) router.push(`/student/result?sessionId=${session.id}`)
          else router.push('/student/waiting-result')
          return
        }
        lastError = `サーバーエラー (${res.status})`
        console.error(`[submit-test] attempt ${attempt + 1} failed: HTTP ${res.status}`)
      } catch (err) {
        lastError = 'ネットワークエラー'
        console.error(`[submit-test] attempt ${attempt + 1} network error:`, err)
      }
    }

    // 全リトライ失敗
    console.error('[submit-test] all retries failed:', lastError)
    setSubmitting(false)
    setRetryCount(0)
    submittingRef.current = false
    setSubmitError(lastError)
  }, [answers, questions, session.id, router, flagged, isPractice])

  // started_at が null（リセット後の受け直し）のときは開始時刻を今に設定
  useEffect(() => {
    if (!session.started_at && !isPractice) {
      fetch('/api/student/start-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId: test.id }),
      }).catch((e) => console.error('[start-test on retake]', e))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 端末ロック：このデバイスでセッションを確保し、30秒ごとにハートビート送信
  useEffect(() => {
    const token = crypto.randomUUID()
    deviceTokenRef.current = token

    const claim = async () => {
      try {
        const res = await fetch('/api/student/claim-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, deviceToken: token }),
        })
        const data = await res.json()
        if (data.blocked) setDeviceBlocked(true)
      } catch (e) {
        console.error('[claim-session] error:', e)
      }
    }
    claim()

    const heartbeat = setInterval(async () => {
      if (submittingRef.current) return
      try {
        await fetch('/api/student/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, deviceToken: token }),
        })
      } catch (e) {
        console.error('[heartbeat] error:', e)
      }
    }, 30000)

    return () => clearInterval(heartbeat)
  }, [session.id])

  // 60秒ごとに答案をDBへ定期保存（練習テストは除外）
  useEffect(() => {
    if (isPractice) return
    const interval = setInterval(async () => {
      if (submittingRef.current) return
      const answersArray = questions.map((q) => ({
        question_id: q.id,
        selected_answer: answersRef.current[q.id] ?? null,
      }))
      try {
        await fetch('/api/student/save-answers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, answers: answersArray }),
        })
      } catch (e) {
        console.error('[save-answers] periodic save failed:', e)
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [questions, session.id, isPractice])

  useEffect(() => { submitTestRef.current = submitTest }, [submitTest])

  useEffect(() => {
    if (timeLeft <= 0) { submitTestRef.current(); return }
    // インターバルのカウントではなく実時刻から残り秒を計算する
    // （連打等でJSスレッドが詰まっても時間が止まらない）
    const startedAt = session.started_at
      ? new Date(session.started_at).getTime()
      : Date.now()
    const endAt = startedAt + test.time_limit * 1000
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        clearInterval(timer)
        submitTestRef.current()
      }
    }, 500)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logCheat = useCallback(async (eventType: 'tab_leave' | 'app_switch' | 'split_view') => {
    if (submittingRef.current) return
    cheatCountRef.current += 1
    setCheatWarning({ visible: true, count: cheatCountRef.current, eventType })
    setContentHidden(true)
    try {
      await fetch('/api/student/log-cheat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, eventType }),
      })
    } catch (e) {
      console.error('[logCheat] failed:', e)
    }
  }, [session.id])

  useEffect(() => {
    const fn = () => { if (document.visibilityState === 'hidden') logCheat('tab_leave') }
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [logCheat])

  useEffect(() => {
    const fn = () => {
      setTimeout(() => { if (!document.hidden) logCheat('app_switch') }, 100)
    }
    window.addEventListener('blur', fn)
    return () => window.removeEventListener('blur', fn)
  }, [logCheat])

  // Slide Over等でキーボードが出たことを検知（テスト画面に入力欄はないので外部キーボードと判断）
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let prevKeyboardShowing = false
    const onResize = () => {
      const keyboardShowing = window.innerHeight - vv.height > 150
      if (keyboardShowing && !prevKeyboardShowing) logCheat('app_switch')
      prevKeyboardShowing = keyboardShowing
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [logCheat])

  useEffect(() => {
    const isSplitView = () => {
      // Method 1: screen.widthが全画面幅を返す場合（デスクトップ・iPhone等）
      if (screen.width > 0 && (window.innerWidth / screen.width) < 0.65) return true
      // Method 2: iPadOSはscreen.width = window.innerWidthになるため絶対値で判定
      // iPadOS 13以降はMacintoshとして検出されるため両方チェック
      const isIPad = /iPad/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
      if (!isIPad) return false
      // 横向き全画面の最小幅(iPad mini)=1024px → 1000px未満ならSplit View
      // 縦向き全画面の最小幅(iPad mini)=744px  →  700px未満ならSplit View
      const isLandscape = screen.orientation
        ? screen.orientation.type.includes('landscape')
        : window.matchMedia('(orientation: landscape)').matches
      return window.innerWidth < (isLandscape ? 1000 : 700)
    }
    let prevInSplitView = isSplitView()

    // 初期チェック（テスト開始前から画面分割していた場合）
    if (prevInSplitView) {
      setSplitViewBlocked(true)
      logCheat('split_view')
    }

    const check = () => {
      const nowSplit = isSplitView()
      if (nowSplit && !prevInSplitView) {
        // 分割に入った → ブロック＋記録
        setSplitViewBlocked(true)
        logCheat('split_view')
      } else if (!nowSplit && prevInSplitView) {
        // 分割を解除した → ブロック解除
        setSplitViewBlocked(false)
      }
      prevInSplitView = nowSplit
    }

    window.addEventListener('resize', check)
    const interval = setInterval(check, 5000)

    return () => {
      window.removeEventListener('resize', check)
      clearInterval(interval)
    }
  }, [logCheat])

  const saveCurrentPage = useCallback(async (page: number) => {
    try {
      await fetch('/api/student/save-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, page }),
      })
    } catch (e) {
      console.error('[saveCurrentPage] failed:', e)
    }
  }, [session.id])

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    window.scrollTo({ top: 0, behavior: 'instant' })
    saveCurrentPage(newPage) // fire and forget
  }

  const handleAnswer = (questionId: string, choice: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choice }))
  }

  const toggleFlag = (questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) { next.delete(questionId) } else { next.add(questionId) }
      return next
    })
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
  const flaggedCount = flagged.size
  const timerColor = timeLeft <= 30 ? 'text-red-600' : timeLeft <= 60 ? 'text-orange-500' : 'text-gray-800'
  const cheatEventLabel: Record<string, string> = { tab_leave: 'タブ離脱', app_switch: 'アプリ切替', split_view: '画面分割' }

  // 別端末でテスト中の場合はブロック画面を表示
  if (deviceBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🚫</div>
          <h2 className="text-xl font-bold text-red-700">別の端末でテストが開かれています</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            このアカウントは現在、別の端末でテストを受験中です。<br />
            同時に2台以上の端末でテストを開くことはできません。
          </p>
          <p className="text-gray-400 text-xs">
            前の端末を閉じてから約1分後に、こちらでもう一度お試しください。
          </p>
          <a
            href="/student"
            className="block w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition"
          >
            ホームに戻る
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 画面分割ブロックオーバーレイ（閉じられない） */}
      {splitViewBlocked && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="text-5xl">🚫</div>
            <h2 className="text-xl font-bold text-red-700">画面分割が検出されました</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              テスト中は画面分割できません。<br />
              分割を解除すると自動的に再開されます。
            </p>
            <p className="text-xs text-gray-400">この行動は記録されています</p>
          </div>
        </div>
      )}
      {/* 送信中オーバーレイ */}
      {submitting && (
        <div className="fixed inset-0 bg-white/90 z-50 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          {retryCount === 0 ? (
            <>
              <p className="text-lg font-bold text-gray-700">送信中...</p>
              <p className="text-sm text-gray-400">しばらくお待ちください</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-orange-600">再送信中... ({retryCount}/{MAX_RETRIES})</p>
              <p className="text-sm text-gray-400">接続を再試行しています</p>
            </>
          )}
        </div>
      )}

      {/* 送信失敗オーバーレイ */}
      {submitError && !submitting && (
        <div className="fixed inset-0 bg-white/95 z-50 flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-5xl">⚠️</div>
          <div className="text-center space-y-2">
            <p className="text-xl font-bold text-red-700">送信に失敗しました</p>
            <p className="text-sm text-gray-600">
              通信エラーが発生しました。<br />
              <span className="font-semibold text-gray-800">回答はまだ残っています。</span><br />
              もう一度お試しください。
            </p>
            <p className="text-xs text-gray-400">({submitError})</p>
          </div>
          <button
            onClick={() => { setSubmitError(null); submitTest() }}
            className="w-full max-w-xs bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 active:scale-95 transition-all shadow-md"
          >
            もう一度送信する
          </button>
          <p className="text-xs text-gray-400 text-center">
            何度試しても失敗する場合は、先生に知らせてください。
          </p>
        </div>
      )}

      {/* 送信確認ダイアログ */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-5 shadow-2xl">
            <div className="text-center">
              <div className="text-5xl mb-3">📝</div>
              <h2 className="text-lg font-bold text-gray-800">回答を送信しますか？</h2>
              <p className="text-sm text-gray-500 mt-2">
                送信後は回答を変更できません。<br />
                よろしければ「送信する」を押してください。
              </p>
              {questions.filter((q) => answers[q.id] == null).length > 0 && (
                <p className="text-sm text-orange-600 font-medium mt-2">
                  ⚠️ 未回答: {questions.filter((q) => answers[q.id] == null).length}問
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowSubmitConfirm(false); submitTest() }}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition"
              >
                送信する
              </button>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {cheatWarning.visible && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="text-center">
              <div className="text-5xl mb-3">⚠️</div>
              <h2 className="text-lg font-bold text-red-700">不正行為が検出されました</h2>
              <p className="text-sm text-gray-600 mt-2">{cheatEventLabel[cheatWarning.eventType]} が検知されました。この行動は記録されています。</p>
              <p className="text-sm text-red-600 font-medium mt-2">検出回数: {cheatWarning.count}回</p>
            </div>
            <button onClick={handleDismissWarning} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition">テストに戻る</button>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {test.mode === 300 && <span className="font-medium">{currentPage} / {totalPages} ページ</span>}
          </div>
          <div className={`text-2xl font-bold tabular-nums ${timerColor}`}>{formatTime(timeLeft)}</div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {flaggedCount > 0 && <span className="text-yellow-600 font-medium">★ {flaggedCount}</span>}
            <span>{answeredCount} / {questions.length}</span>
          </div>
        </div>
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${((test.time_limit - timeLeft) / test.time_limit) * 100}%` }} />
        </div>
      </header>

      {contentHidden ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <p className="text-xl font-medium">問題を表示できません</p>
            <p className="text-sm mt-2">警告を閉じてテストに戻ってください</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
          <div ref={topRef} />
          {/* ★絞り込みモード時のバナー */}
          {showFlaggedOnly && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-yellow-800">
              <span className="text-yellow-500 font-bold">★</span>
              <span>自信がない <span className="font-bold">{flagged.size}問</span> を表示中です</span>
            </div>
          )}
          {displayQuestions.map((q, pageIndex) => {
            const globalIndex = showFlaggedOnly
              ? questions.findIndex((item) => item.id === q.id)
              : test.mode === 300
                ? (currentPage - 1) * QUESTIONS_PER_PAGE + pageIndex
                : pageIndex
            const validChoices = [
              { num: 1, text: q.choice1 },
              { num: 2, text: q.choice2 },
              { num: 3, text: q.choice3 },
              { num: 4, text: q.choice4 },
              { num: 5, text: q.choice5 },
            ].filter((c) => c.text && c.text !== 'None' && c.text !== 'null')
            const selected = answers[q.id]
            const isFlagged = flagged.has(q.id)
            return (
              <div key={q.id} className={`rounded-2xl border-2 p-5 transition-colors ${isFlagged ? 'bg-yellow-50 border-yellow-400' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start gap-3 mb-4">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-lg shrink-0 mt-0.5">{globalIndex + 1}</span>
                  <div className="flex-1 leading-relaxed">
                    {q.question_text.includes('\n') ? (
                      // 複数行：Section B（日本語文＋英文穴埋め）
                      q.question_text.split('\n').map((line, li) => {
                        if (line.includes('(     )')) {
                          // 英文の空欄を（　　　）で表示
                          const parts = line.split('(     )')
                          return (
                            <p key={li} className="text-gray-800 font-medium mt-3">
                              {parts.map((part, pi) => (
                                <span key={pi}>
                                  {part}
                                  {pi < parts.length - 1 && (
                                    <span>（　　　）</span>
                                  )}
                                </span>
                              ))}
                            </p>
                          )
                        }
                        // 日本語ヒント行
                        return (
                          <p key={li} className="text-gray-500 text-sm mb-1">
                            {line}
                          </p>
                        )
                      })
                    ) : (
                      <p className="text-gray-800 font-medium">{q.question_text}</p>
                    )}
                  </div>
                  <button onClick={() => toggleFlag(q.id)} className={`shrink-0 text-xl transition-colors ${isFlagged ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`} title="自信がない">★</button>
                </div>
                <div className="space-y-2">
                  {validChoices.map((choice) => (
                    <button key={choice.num} onClick={() => handleAnswer(q.id, choice.num)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition text-sm font-medium ${selected === choice.num ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/50'}`}>
                      <span className="text-gray-400 mr-2 text-xs">{['①','②','③','④','⑤'][choice.num - 1]}</span>
                      {choice.text}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="sticky bottom-4">
            {/* ★絞り込みモード中のボタン */}
            {showFlaggedOnly ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFlaggedOnly(false)}
                  className="flex-1 bg-white border border-gray-300 text-gray-700 py-4 rounded-2xl font-semibold hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all shadow-sm"
                >
                  ← 元に戻る
                </button>
                <button
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={submitting}
                  className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 active:bg-green-800 active:scale-95 transition-all disabled:opacity-50 shadow-md"
                >
                  {submitting ? '送信中...' : '送信する'}
                </button>
              </div>
            ) : test.mode === 300 ? (
              /* 300問モード（通常） */
              <div className="flex gap-2">
                {currentPage > 1 && (
                  <button onClick={() => handlePageChange(currentPage - 1)} className="flex-1 bg-white border border-gray-300 text-gray-700 py-4 rounded-2xl font-semibold hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all">← 前のページ</button>
                )}
                {currentPage < totalPages ? (
                  <button onClick={() => handlePageChange(currentPage + 1)} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-semibold hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all shadow-md">次のページ →</button>
                ) : (
                  <>
                    {flaggedCount > 0 && (
                      <button
                        onClick={() => { setShowFlaggedOnly(true); window.scrollTo({ top: 0, behavior: 'instant' }) }}
                        className="bg-yellow-400 text-white px-4 py-4 rounded-2xl font-bold hover:bg-yellow-500 active:scale-95 transition-all shadow-md whitespace-nowrap text-sm"
                      >
                        ★ {flaggedCount}問確認
                      </button>
                    )}
                    <button onClick={() => setShowSubmitConfirm(true)} disabled={submitting} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold hover:bg-green-700 active:bg-green-800 active:scale-95 transition-all disabled:opacity-50 shadow-md">{submitting ? '送信中...' : '回答を送信する'}</button>
                  </>
                )}
              </div>
            ) : (
              /* 50問モード（通常） */
              <div className="flex gap-2">
                {flaggedCount > 0 && (
                  <button
                    onClick={() => { setShowFlaggedOnly(true); window.scrollTo({ top: 0, behavior: 'instant' }) }}
                    className="bg-yellow-400 text-white px-4 py-4 rounded-2xl font-bold hover:bg-yellow-500 active:scale-95 transition-all shadow-md whitespace-nowrap text-sm"
                  >
                    ★ {flaggedCount}問を確認
                  </button>
                )}
                <button onClick={() => setShowSubmitConfirm(true)} disabled={submitting} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 transition disabled:opacity-50 shadow-md">{submitting ? '送信中...' : '回答を送信する'}</button>
              </div>
            )}
          </div>
          <div className="h-4" />
        </div>
      )}
    </div>
  )
}
