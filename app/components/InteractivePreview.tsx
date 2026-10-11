'use client'

import { useState, useCallback, useRef } from 'react'

export interface PreviewItem {
  id?: string
  order_num: number
  question_text: string
  choice1: string
  choice2: string
  choice3: string
  choice4: string | null
  choice5: string | null
  correct_answer: number
  points: number
  word_slots?: string | null
}

export default function InteractivePreview({
  questions,
  title,
  onClose,
}: {
  questions: PreviewItem[]
  title: string
  onClose: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, number | null>>({})
  const [wordOrders, setWordOrders] = useState<Record<string, number[]>>({})
  const [fillInputs, setFillInputs] = useState<Record<string, string[]>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)

  const [dragInfo, setDragInfo] = useState<{ qKey: string; wordIdx: number; fromPos?: number; ghostX: number; ghostY: number } | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ qKey: string; pos: number } | null>(null)
  const dragRef = useRef<{ qKey: string; wordIdx: number; fromPos?: number; dropPos: number | null } | null>(null)

  const getKey = (q: PreviewItem) => q.id ?? String(q.order_num)

  const insertWordAtPos = useCallback((qKey: string, wordIdx: number, insertPos: number, fromPos?: number) => {
    setWordOrders(prev => {
      const current = [...(prev[qKey] ?? [])]
      let pos = insertPos
      if (fromPos !== undefined) {
        current.splice(fromPos, 1)
        if (pos > fromPos) pos--
      }
      current.splice(pos, 0, wordIdx)
      return { ...prev, [qKey]: current }
    })
  }, [])

  const startWordDrag = useCallback((e: React.PointerEvent, qKey: string, wordIdx: number, fromPos?: number, orderLen?: number) => {
    e.preventDefault()
    const defaultDropPos = fromPos !== undefined ? fromPos : (orderLen ?? 0)
    dragRef.current = { qKey, wordIdx, fromPos, dropPos: defaultDropPos }
    setDragInfo({ qKey, wordIdx, fromPos, ghostX: e.clientX, ghostY: e.clientY })
    setDropIndicator({ qKey, pos: defaultDropPos })

    const onMove = (ev: PointerEvent) => {
      setDragInfo(prev => prev ? { ...prev, ghostX: ev.clientX, ghostY: ev.clientY } : null)
      if (!dragRef.current) return
      const chips = Array.from(document.querySelectorAll<HTMLElement>(`[data-previewchip="${dragRef.current.qKey}"]`))
      if (chips.length === 0) { dragRef.current.dropPos = 0; setDropIndicator({ qKey: dragRef.current.qKey, pos: 0 }); return }
      let newPos = chips.length
      for (let i = 0; i < chips.length; i++) {
        const rect = chips[i].getBoundingClientRect()
        if (ev.clientY < rect.bottom + 10 && ev.clientY > rect.top - 10) {
          if (ev.clientX < rect.left + rect.width / 2) { newPos = i; break }
          else { newPos = i + 1 }
        }
      }
      dragRef.current.dropPos = newPos
      setDropIndicator({ qKey: dragRef.current.qKey, pos: newPos })
    }
    const onUp = () => {
      const d = dragRef.current
      if (d && d.dropPos !== null) insertWordAtPos(d.qKey, d.wordIdx, d.dropPos, d.fromPos)
      dragRef.current = null
      setDragInfo(null)
      setDropIndicator(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [insertWordAtPos])

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

  const isQuestionCorrect = (q: PreviewItem) => {
    const key = getKey(q)
    if (q.word_slots) {
      try {
        const ws = JSON.parse(q.word_slots) as { words?: string[]; answer?: string; blanks?: string[] }
        if (ws.blanks) {
          const inputs = fillInputs[key] ?? []
          return ws.blanks.every((b, i) => normalize(inputs[i] ?? '') === normalize(b))
        }
        const words = ws.words ?? []
        const order = wordOrders[key] ?? []
        if (order.length !== words.length) return false
        return normalize(order.map(i => words[i]).join(' ')) === normalize(ws.answer ?? '')
      } catch { return false }
    }
    return answers[key] === q.correct_answer
  }

  const answeredCount = questions.filter(q => {
    const key = getKey(q)
    if (q.word_slots) return checked[key] || showAll
    return answers[key] != null || showAll
  }).length
  const correctCount = questions.filter(q => {
    const key = getKey(q)
    if (q.word_slots && !checked[key] && !showAll) return false
    if (!q.word_slots && answers[key] == null && !showAll) return false
    return isQuestionCorrect(q)
  }).length

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-blue-600 text-white px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="text-blue-200 hover:text-white transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg leading-tight">問題プレビュー</h2>
          <p className="text-blue-200 text-sm truncate">{title}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-blue-200">正解 / 回答済</p>
          <p className="font-bold text-lg">{correctCount} / {answeredCount}</p>
        </div>
      </div>

      {/* スクロールエリア */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {questions.length === 0 && (
            <div className="text-center text-gray-400 py-12">問題がありません</div>
          )}

          {questions.map(q => {
            const key = getKey(q)

            // Section C / D: word_slots あり
            if (q.word_slots) {
              let ws: { words?: string[]; prefix?: string; suffix?: string; answer?: string; blanks?: string[]; sentence?: string } = {}
              try { ws = JSON.parse(q.word_slots) } catch { /* ignore */ }

              // Section D: 空所補充
              if (ws.blanks) {
                const sentence = ws.sentence ?? ''
                const parts = sentence.split('(     )')
                const inputs = fillInputs[key] ?? new Array(ws.blanks.length).fill('')
                const isChecked = checked[key] || showAll
                const correct = isChecked && ws.blanks.every((b, i) => normalize(inputs[i] ?? '') === normalize(b))
                return (
                  <div key={key} className={`bg-white rounded-2xl border-2 p-5 transition-colors ${isChecked ? (correct ? 'border-green-200' : 'border-red-200') : 'border-gray-200'}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-lg shrink-0 mt-0.5">{q.order_num}</span>
                      <p className="text-gray-500 text-sm flex-1">{q.question_text}</p>
                      <span className="text-xs text-gray-400 shrink-0">{q.points}点</span>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-sm mb-3 leading-loose">
                      {parts.map((part, pi) => (
                        <span key={pi}>
                          <span className="text-gray-700">{part}</span>
                          {pi < parts.length - 1 && (
                            <input
                              type="text"
                              value={inputs[pi] ?? ''}
                              disabled={isChecked}
                              onChange={(e) => {
                                const val = e.target.value
                                setFillInputs(prev => {
                                  const prev2 = prev[key] ?? new Array(ws.blanks!.length).fill('')
                                  const next = [...prev2]
                                  next[pi] = val
                                  return { ...prev, [key]: next }
                                })
                              }}
                              className={`inline-block w-20 text-center border-b-2 px-1 py-0.5 text-sm font-medium focus:outline-none transition mx-0.5 align-baseline rounded-t-sm
                                ${isChecked
                                  ? (normalize(inputs[pi] ?? '') === normalize(ws.blanks![pi])
                                    ? 'border-green-500 text-green-700 bg-green-50'
                                    : 'border-red-400 text-red-700 bg-red-50')
                                  : 'border-blue-400 bg-blue-50/40 text-blue-800 focus:border-blue-600'}`}
                            />
                          )}
                        </span>
                      ))}
                    </div>
                    {!isChecked ? (
                      <button
                        onClick={() => setChecked(prev => ({ ...prev, [key]: true }))}
                        className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-200 transition"
                      >
                        確認する
                      </button>
                    ) : (
                      <div className={`text-sm rounded-xl px-3 py-2 ${correct ? 'bg-green-50 text-green-700' : 'bg-red-50'}`}>
                        {correct ? '✓ 正解！' : (
                          <>
                            <p className="text-red-600 font-medium">✗ 不正解</p>
                            <p className="text-green-700 mt-1">正解: <span className="font-medium">{ws.blanks!.join(' / ')}</span></p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              }

              // Section C: 並べ替え
              const words = ws.words ?? []
              const prefix = ws.prefix ?? ''
              const suffix = ws.suffix ?? ''
              const answer = ws.answer ?? ''
              const order = wordOrders[key] ?? []
              const placedSet = new Set(order)
              const isComplete = order.length === words.length
              const isChecked = checked[key] || showAll
              const arranged = order.map(i => words[i]).join(' ')
              const correct = isChecked && normalize(arranged) === normalize(answer)
              const isDraggingThis = dragInfo?.qKey === key

              return (
                <div key={key} className={`bg-white rounded-2xl border-2 p-5 transition-colors ${isChecked ? (correct ? 'border-green-200' : 'border-red-200') : 'border-gray-200'}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-lg shrink-0 mt-0.5">{q.order_num}</span>
                    <p className="text-gray-500 text-sm flex-1">{q.question_text}</p>
                    <span className="text-xs text-gray-400 shrink-0">{q.points}点</span>
                  </div>
                  {/* 回答エリア */}
                  <div className="bg-gray-50 rounded-xl p-3 mb-3 min-h-[56px] flex flex-wrap items-center gap-1.5">
                    {prefix && <span className="text-gray-700 text-sm">{prefix}</span>}
                    {order.length === 0 && !isDraggingThis && (
                      <span className="text-gray-300 text-sm">ここに単語をドラッグ</span>
                    )}
                    {(() => {
                      const dropPos = (isDraggingThis && dropIndicator?.qKey === key) ? dropIndicator.pos : -1
                      const fromPos = dragRef.current?.fromPos
                      const result: JSX.Element[] = []
                      order.forEach((wordIdx, pos) => {
                        if (dropPos === pos) result.push(<span key={`ind-${pos}`} className="w-1 h-8 bg-blue-400 rounded-full transition-all duration-150" />)
                        const isSource = isDraggingThis && fromPos === pos
                        const isDisplaced = isDraggingThis && dropPos === pos && fromPos !== pos
                        result.push(
                          <button
                            key={pos}
                            data-previewchip={key}
                            disabled={isChecked}
                            onPointerDown={(e) => !isChecked && startWordDrag(e, key, wordIdx, pos, order.length)}
                            className={`px-2.5 py-1.5 rounded-lg border-2 text-sm font-medium select-none touch-none transition-all duration-150
                              ${isChecked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
                              ${isSource ? 'opacity-30 border-dashed border-gray-300 bg-white text-gray-400'
                                : isDisplaced ? 'opacity-40 border-blue-200 bg-blue-50 text-blue-400'
                                : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'}`}
                          >
                            {words[wordIdx]}
                          </button>
                        )
                      })
                      if (dropPos === order.length) result.push(<span key="ind-end" className="w-1 h-8 bg-blue-400 rounded-full transition-all duration-150" />)
                      return result
                    })()}
                    {Array.from({ length: words.length - order.length }).map((_, i) => (
                      <span key={i} className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border-2 border-dashed border-gray-300 text-gray-300 text-xs min-w-[40px]">__</span>
                    ))}
                    {suffix && <span className="text-gray-700 text-sm">{suffix}</span>}
                  </div>
                  {/* 単語バンク */}
                  {!isChecked && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {words.map((word, idx) => {
                        if (placedSet.has(idx)) return null
                        return (
                          <button key={idx}
                            onPointerDown={(e) => startWordDrag(e, key, idx, undefined, order.length)}
                            className="bg-white px-3 py-2 rounded-xl border-2 border-gray-300 text-sm font-medium text-gray-700 cursor-grab select-none touch-none hover:border-blue-400 hover:bg-blue-50 transition shadow-sm"
                          >
                            {word}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {isComplete && !isChecked && (
                      <button
                        onClick={() => setChecked(prev => ({ ...prev, [key]: true }))}
                        className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-200 transition"
                      >
                        確認する
                      </button>
                    )}
                    {order.length > 0 && !isChecked && (
                      <button onClick={() => setWordOrders(prev => ({ ...prev, [key]: [] }))} className="text-xs text-gray-400 hover:text-red-500 transition">
                        リセット
                      </button>
                    )}
                  </div>
                  {isChecked && (
                    <div className={`mt-2 text-sm rounded-xl px-3 py-2 ${correct ? 'bg-green-50 text-green-700' : 'bg-red-50'}`}>
                      {correct ? '✓ 正解！' : (
                        <>
                          <p className="text-red-600 font-medium">✗ 不正解</p>
                          <p className="text-green-700 mt-1">正解: <span className="font-medium">{prefix}{answer}{suffix}</span></p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            }

            // Section A/B: 選択問題
            const selected = answers[key]
            const hasSelected = selected != null
            const isShowingAnswer = hasSelected || showAll
            const validChoices = [
              { num: 1, text: q.choice1 },
              { num: 2, text: q.choice2 },
              { num: 3, text: q.choice3 },
              { num: 4, text: q.choice4 },
              { num: 5, text: q.choice5 },
            ].filter(c => c.text && c.text !== 'None' && c.text !== 'null')

            return (
              <div key={key} className={`bg-white rounded-2xl border-2 p-5 transition-colors ${
                !isShowingAnswer ? 'border-gray-200'
                : selected === q.correct_answer ? 'border-green-200'
                : selected != null ? 'border-red-200'
                : 'border-gray-200'
              }`}>
                <div className="flex items-start gap-3 mb-4">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-lg shrink-0 mt-0.5">{q.order_num}</span>
                  <div className="flex-1 leading-relaxed">
                    {q.question_text.includes('\n') ? (
                      q.question_text.split('\n').map((line, li) => {
                        if (line.includes('(     )')) {
                          const parts = line.split('(     )')
                          return (
                            <p key={li} className="text-gray-800 font-medium mt-3">
                              {parts.map((part, pi) => (
                                <span key={pi}>{part}{pi < parts.length - 1 && <span>（　　　）</span>}</span>
                              ))}
                            </p>
                          )
                        }
                        return <p key={li} className="text-gray-500 text-sm mb-1">{line}</p>
                      })
                    ) : (
                      <p className="text-gray-800 font-medium">{q.question_text}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{q.points}点</span>
                </div>
                <div className="space-y-2">
                  {validChoices.map(choice => {
                    const isSelected = selected === choice.num
                    const isAnswer = q.correct_answer === choice.num
                    let cls = 'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm w-full text-left transition'
                    if (!isShowingAnswer) {
                      cls += ' border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer active:scale-[0.99]'
                    } else if (isSelected && isAnswer) {
                      cls += ' border-green-400 bg-green-50 text-green-800 font-medium'
                    } else if (isSelected && !isAnswer) {
                      cls += ' border-red-400 bg-red-50 text-red-700'
                    } else if (isAnswer) {
                      cls += ' border-green-400 bg-green-50 text-green-800 font-medium'
                    } else {
                      cls += ' border-gray-100 text-gray-500'
                    }
                    return (
                      <button
                        key={choice.num}
                        onClick={() => { if (!hasSelected && !showAll) setAnswers(prev => ({ ...prev, [key]: choice.num })) }}
                        className={cls}
                      >
                        <span className="text-gray-400 text-xs shrink-0">{['①','②','③','④','⑤'][choice.num - 1]}</span>
                        <span className="flex-1">{choice.text}</span>
                        {isShowingAnswer && isAnswer && <span className="text-green-600 text-xs font-bold shrink-0">正解</span>}
                        {isSelected && !isAnswer && <span className="text-red-500 text-xs shrink-0">✗</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {!showAll && (
            <div className="py-4 text-center">
              <button
                onClick={() => setShowAll(true)}
                className="bg-gray-700 text-white px-6 py-3 rounded-2xl font-semibold hover:bg-gray-800 transition"
              >
                全問の答えを見る
              </button>
            </div>
          )}
          <div className="h-4" />
        </div>
      </div>

      {/* ドラッグゴースト */}
      {dragInfo && (() => {
        const dq = questions.find(q => getKey(q) === dragInfo.qKey)
        let ghostWord = '...'
        if (dq?.word_slots) {
          try { ghostWord = (JSON.parse(dq.word_slots) as { words?: string[] }).words?.[dragInfo.wordIdx] ?? '...' } catch { /* ignore */ }
        }
        return (
          <div style={{ position: 'fixed', left: dragInfo.ghostX, top: dragInfo.ghostY, transform: 'translate(-50%,-50%)', zIndex: 9999, pointerEvents: 'none' }}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-xl opacity-90 select-none">
            {ghostWord}
          </div>
        )
      })()}
    </div>
  )
}
