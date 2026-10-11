'use client'

import { useState } from 'react'
import Link from 'next/link'

type AnswerItem = {
  question_id: string
  selected_answer: number | null
  is_correct: boolean | null
  flagged: boolean
  order_num: number
  question_text: string
  choice1: string
  choice2: string
  choice3: string
  choice4: string | null
  choice5: string | null
  correct_answer: number
  points: number
  word_slots: string | null
  student_answer_text: string | null
}

type SortMode = 'all' | 'incorrect' | 'correct' | 'flagged'

export default function ReviewClient({
  answers,
  testTitle,
  score,
  backUrl,
}: {
  answers: AnswerItem[]
  testTitle: string
  score: number
  backUrl: string
}) {
  const [sortMode, setSortMode] = useState<SortMode>('all')

  const correctCount = answers.filter((a) => a.is_correct).length
  const flaggedCount = answers.filter((a) => a.flagged).length
  const totalCount = answers.length

  const filtered = answers.filter((a) => {
    if (sortMode === 'correct') return a.is_correct === true
    if (sortMode === 'incorrect') return a.is_correct === false || a.is_correct === null
    if (sortMode === 'flagged') return a.flagged === true
    return true
  })

  const choiceLabel = (n: number) => ['①', '②', '③', '④', '⑤'][n - 1] ?? `${n}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-blue-600 text-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-1">
            <Link href={backUrl} className="text-blue-200 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="font-bold text-lg">回答確認</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-blue-200 ml-8">
            <span>{testTitle}</span>
            <span>正解: {correctCount} / {totalCount}</span>
            <span>{score}点</span>
          </div>
        </div>

        {/* ソートボタン */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 flex-wrap">
          {([
            { mode: 'all',       label: `全問題 (${totalCount})` },
            { mode: 'incorrect', label: `不正解 (${totalCount - correctCount})` },
            { mode: 'correct',   label: `正解 (${correctCount})` },
            { mode: 'flagged',   label: `★ 自信なし (${flaggedCount})` },
          ] as { mode: SortMode; label: string }[]).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                mode === 'flagged'
                  ? sortMode === mode
                    ? 'bg-yellow-300 text-yellow-900'
                    : 'bg-yellow-500/70 text-yellow-100 hover:bg-yellow-400/70'
                  : sortMode === mode
                    ? 'bg-white text-blue-700'
                    : 'bg-blue-500 text-blue-100 hover:bg-blue-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-12">該当する問題がありません</div>
        )}

        {filtered.map((a) => {
          const isCorrect = a.is_correct

          // Section C / D: word_slots あり
          if (a.word_slots) {
            let ws: { words?: string[]; prefix?: string; suffix?: string; answer?: string; blanks?: string[]; sentence?: string } = {}
            try { ws = JSON.parse(a.word_slots) } catch { /* ignore */ }

            if (ws.blanks) {
              // Section D: 空所補充
              const sentence = ws.sentence ?? ''
              const parts = sentence.split('(     )')
              const studentWords = a.student_answer_text ? a.student_answer_text.split(' / ') : []
              const hasStudentAnswer = studentWords.length > 0
              return (
                <div key={a.question_id} className={`bg-white rounded-2xl border-2 overflow-hidden ${isCorrect ? 'border-green-200' : 'border-red-200'}`}>
                  <div className={`px-5 py-3 flex items-center gap-2 ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className={`text-lg font-bold ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>{isCorrect ? '✅' : '❌'}</span>
                    <span className="text-sm font-medium text-gray-600">問題 {a.order_num}</span>
                    {a.flagged && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">★ 自信なし</span>}
                    <span className="ml-auto text-xs text-gray-400">{a.points}点</span>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-gray-500 text-sm">{a.question_text}</p>
                    {/* 自分の回答（記録がある場合・不正解時のみ） */}
                    {hasStudentAnswer && !isCorrect && (
                      <div className="bg-red-50 rounded-xl p-3 text-sm leading-loose">
                        <p className="text-xs font-medium mb-1 text-red-500">あなたの回答：</p>
                        <div className="text-gray-700">
                          {parts.map((part, pi) => (
                            <span key={pi}>
                              <span>{part}</span>
                              {pi < parts.length - 1 && (
                                <span className="inline-block border-b-2 border-red-400 text-red-700 font-bold px-2 mx-0.5">
                                  {studentWords[pi] ?? '？'}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 正解（常に表示） */}
                    <div className="bg-green-50 rounded-xl p-3 text-sm leading-loose">
                      <p className="text-xs text-green-600 font-medium mb-1">{isCorrect ? '✓ あなたの回答（正解）：' : '正解：'}</p>
                      <div>
                        {parts.map((part, pi) => (
                          <span key={pi}>
                            <span className="text-gray-700">{part}</span>
                            {pi < parts.length - 1 && (
                              <span className="inline-block border-b-2 border-green-500 text-green-700 font-bold px-2 mx-0.5">{ws.blanks![pi]}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

            // Section C: 並べ替え
            const words = ws.words ?? []
            const prefix = ws.prefix ?? ''
            const suffix = ws.suffix ?? ''
            const answer = ws.answer ?? ''
            const studentArranged = a.student_answer_text ?? ''
            return (
              <div key={a.question_id} className={`bg-white rounded-2xl border-2 overflow-hidden ${isCorrect ? 'border-green-200' : 'border-red-200'}`}>
                <div className={`px-5 py-3 flex items-center gap-2 ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className={`text-lg font-bold ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>{isCorrect ? '✅' : '❌'}</span>
                  <span className="text-sm font-medium text-gray-600">問題 {a.order_num}</span>
                  {a.flagged && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">★ 自信なし</span>}
                  <span className="ml-auto text-xs text-gray-400">{a.points}点</span>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-gray-500 text-sm">{a.question_text}</p>
                  {/* 自分の回答 */}
                  {studentArranged ? (
                    <div className={`rounded-xl p-3 text-sm ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                      <p className={`text-xs font-medium mb-1 ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                        {isCorrect ? '✓ あなたの回答（正解）：' : 'あなたの回答：'}
                      </p>
                      <p className={`font-medium ${isCorrect ? 'text-green-800' : 'text-red-700'}`}>{prefix}{studentArranged}{suffix}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 px-1">（あなたの回答は記録されていません）</p>
                  )}
                  {/* 正解（不正解のときのみ） */}
                  {!isCorrect && (
                    <div className="bg-green-50 rounded-xl p-3 text-sm">
                      <p className="text-xs text-green-600 font-medium mb-1">正解：</p>
                      <p className="text-green-800 font-medium">{prefix}{answer}{suffix}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          }

          // 通常の選択問題
          const selected = a.selected_answer
          const allChoices = [
            { num: 1, text: a.choice1 },
            { num: 2, text: a.choice2 },
            { num: 3, text: a.choice3 },
            { num: 4, text: a.choice4 },
            { num: 5, text: a.choice5 },
          ].filter((c) => c.text && c.text !== 'None' && c.text !== 'null')

          return (
            <div
              key={a.question_id}
              className={`bg-white rounded-2xl border-2 overflow-hidden ${
                isCorrect ? 'border-green-200' : 'border-red-200'
              }`}
            >
              <div className={`px-5 py-3 flex items-center gap-2 ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className={`text-lg font-bold ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                  {isCorrect ? '✅' : '❌'}
                </span>
                <span className="text-sm font-medium text-gray-600">問題 {a.order_num}</span>
                {a.flagged && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">★ 自信なし</span>
                )}
                <span className="ml-auto text-xs text-gray-400">{a.points}点</span>
              </div>

              <div className="px-5 py-4">
                <div className="text-gray-800 font-medium mb-4 leading-relaxed">
                  {a.question_text.includes('\n') ? (
                    a.question_text.split('\n').map((line, li) => {
                      if (line.includes('(     )')) {
                        const parts = line.split('(     )')
                        return (
                          <p key={li} className="mt-3">
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
                      return (
                        <p key={li} className="text-gray-500 text-sm mb-1">
                          {line}
                        </p>
                      )
                    })
                  ) : (
                    <p>{a.question_text}</p>
                  )}
                </div>

                <div className="space-y-2">
                  {allChoices.map((choice) => {
                    const isSelected = selected === choice.num
                    const isAnswer = a.correct_answer === choice.num

                    let className = 'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm'
                    if (isSelected && isCorrect) {
                      className += ' border-green-400 bg-green-50 text-green-800 font-medium'
                    } else if (isSelected && !isCorrect) {
                      className += ' border-red-400 bg-red-50 text-red-700 line-through'
                    } else if (isAnswer && !isCorrect) {
                      className += ' border-green-400 bg-green-50 text-green-800 font-medium'
                    } else {
                      className += ' border-gray-100 text-gray-600'
                    }

                    return (
                      <div key={choice.num} className={className}>
                        <span className="text-gray-400 text-xs shrink-0">{choiceLabel(choice.num)}</span>
                        <span className="flex-1">{choice.text}</span>
                        {isSelected && isCorrect && <span className="text-green-600 text-xs font-bold shrink-0">✓ あなたの回答</span>}
                        {isSelected && !isCorrect && <span className="text-red-500 text-xs shrink-0">✗ あなたの回答</span>}
                        {!isSelected && isAnswer && <span className="text-green-600 text-xs font-bold shrink-0">正解</span>}
                      </div>
                    )
                  })}

                  {selected === null && <p className="text-xs text-gray-400 px-2">未回答</p>}
                </div>
              </div>
            </div>
          )
        })}

        <div className="py-4 text-center">
          <Link href={backUrl} className="text-blue-600 hover:underline text-sm">
            結果画面に戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
