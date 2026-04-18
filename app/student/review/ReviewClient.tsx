'use client'

import { useState } from 'react'
import Link from 'next/link'

type AnswerItem = {
  question_id: string
  selected_answer: number | null
  is_correct: boolean | null
  order_num: number
  question_text: string
  choice1: string
  choice2: string
  choice3: string
  choice4: string | null
  choice5: string | null
  correct_answer: number
  points: number
}

type SortMode = 'all' | 'incorrect' | 'correct'

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
  const totalCount = answers.length

  const filtered = answers.filter((a) => {
    if (sortMode === 'correct') return a.is_correct === true
    if (sortMode === 'incorrect') return a.is_correct === false || a.is_correct === null
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
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
          {(['all', 'incorrect', 'correct'] as SortMode[]).map((mode) => {
            const labels = { all: `全問題 (${totalCount})`, incorrect: `不正解 (${totalCount - correctCount})`, correct: `正解 (${correctCount})` }
            return (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                  sortMode === mode
                    ? 'bg-white text-blue-700'
                    : 'bg-blue-500 text-blue-100 hover:bg-blue-400'
                }`}
              >
                {labels[mode]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-12">該当する問題がありません</div>
        )}

        {filtered.map((a) => {
          const isCorrect = a.is_correct
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
