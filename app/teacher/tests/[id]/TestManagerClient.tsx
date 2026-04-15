'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Test, Session, CheatLog, Student, Question } from '@/lib/supabase/types'
import * as XLSX from 'xlsx'

interface SessionWithStudent extends Session {
  students: Pick<Student, 'name' | 'class_name' | 'seat_number' | 'test_name'> | null
}

interface CheatLogWithStudent extends CheatLog {
  sessions: {
    students: Pick<Student, 'name' | 'class_name' | 'seat_number'> | null
  } | null
}

const statusLabel: Record<string, string> = {
  waiting: '待機中',
  open: '実施中',
  finished: '採点中',
  published: '結果公開済',
}

const statusColor: Record<string, string> = {
  waiting: 'bg-gray-100 text-gray-700',
  open: 'bg-green-100 text-green-800',
  finished: 'bg-yellow-100 text-yellow-800',
  published: 'bg-blue-100 text-blue-800',
}

type PreviewQuestion = Pick<Question, 'id' | 'order_num' | 'question_text' | 'choice1' | 'choice2' | 'choice3' | 'choice4' | 'choice5' | 'correct_answer' | 'points'>

export default function TestManagerClient({
  test: initialTest,
  questions,
}: {
  test: Test
  questions: PreviewQuestion[]
}) {
  const supabase = createClient()
  const [test, setTest] = useState<Test>(initialTest)
  const [sessions, setSessions] = useState<SessionWithStudent[]>([])
  const [cheatLogs, setCheatLogs] = useState<CheatLogWithStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const fetchData = useCallback(async () => {
    const { data: sessData } = await supabase
      .from('sessions')
      .select('*, students(name, class_name, seat_number, test_name)')
      .eq('test_id', test.id)
      .order('created_at')

    if (sessData) setSessions(sessData as SessionWithStudent[])

    const { data: cheatData } = await supabase
      .from('cheat_logs')
      .select('*, sessions(students(name, class_name, seat_number))')
      .in(
        'session_id',
        (sessData ?? []).map((s) => s.id)
      )
      .order('occurred_at', { ascending: false })

    if (cheatData) setCheatLogs(cheatData as CheatLogWithStudent[])
  }, [supabase, test.id])

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel(`test-${test.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `test_id=eq.${test.id}` },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tests', filter: `id=eq.${test.id}` },
        (payload) => {
          if (payload.new) setTest(payload.new as Test)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cheat_logs' },
        () => fetchData()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchData, supabase, test.id])

  const handleOpenTest = async () => {
    setLoading(true)
    setActionError('')
    const { error } = await supabase
      .from('tests')
      .update({ status: 'open', opened_at: new Date().toISOString() })
      .eq('id', test.id)
    if (error) setActionError('テスト開始に失敗しました')
    setLoading(false)
  }

  const handlePublishResult = async () => {
    setLoading(true)
    setActionError('')
    const { error } = await supabase
      .from('tests')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', test.id)
    if (error) setActionError('結果公開に失敗しました')
    setLoading(false)
  }

  const handleDownloadExcel = async () => {
    const { data: answers } = await supabase
      .from('answers')
      .select('*, questions(order_num, question_text, correct_answer, points)')
      .in('session_id', sessions.map((s) => s.id))

    const rows = sessions.map((s) => {
      const studentAnswers = (answers ?? []).filter((a) => a.session_id === s.id)
      const score = s.score ?? 0
      return {
        クラス: s.students?.class_name ?? '',
        出席番号: s.students?.seat_number ?? '',
        名前: s.students?.name ?? '',
        テストネーム: s.students?.test_name ?? '',
        点数: score,
        提出済み: s.is_submitted ? '済' : '未',
        開始時刻: s.started_at ? new Date(s.started_at).toLocaleString('ja-JP') : '',
        提出時刻: s.submitted_at ? new Date(s.submitted_at).toLocaleString('ja-JP') : '',
        回答数: studentAnswers.length,
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, '結果一覧')
    XLSX.writeFile(wb, `${test.title}_結果.xlsx`)
  }

  const submittedCount = sessions.filter((s) => s.is_submitted).length
  const startedCount = sessions.filter((s) => s.started_at).length
  const pagesMap = Object.fromEntries(sessions.map((s) => [s.id, s.current_page]))

  const cheatEventLabel: Record<string, string> = {
    tab_leave: 'タブ離脱',
    app_switch: 'アプリ切替',
    split_view: '画面分割',
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <a href="/teacher" className="text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <h1 className="text-2xl font-bold text-gray-800">{test.title}</h1>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[test.status]}`}>
              {statusLabel[test.status]}
            </span>
          </div>
          <p className="text-sm text-gray-500 ml-8">
            {test.mode}問モード / 制限時間 {test.time_limit}秒
            {test.pass_score && ` / 合格点 ${test.pass_score}点`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowPreview(true)}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition text-sm"
          >
            問題プレビュー
          </button>
          {test.status === 'waiting' && (
            <button
              onClick={handleOpenTest}
              disabled={loading}
              className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-green-700 transition disabled:opacity-50"
            >
              テスト開始
            </button>
          )}
          {(test.status === 'open' || test.status === 'finished') && (
            <button
              onClick={handlePublishResult}
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              結果を公開する
            </button>
          )}
          {sessions.length > 0 && (
            <button
              onClick={handleDownloadExcel}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition text-sm"
            >
              Excelダウンロード
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">{actionError}</div>
      )}

      {/* 統計カード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: '総問題数', value: questions.length, color: 'text-gray-800' },
          { label: '接続済み', value: sessions.length, color: 'text-blue-600' },
          { label: '開始済み', value: startedCount, color: 'text-green-600' },
          { label: '提出済み', value: submittedCount, color: 'text-purple-600' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* 生徒状況一覧 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">生徒ステータス</h2>
          <button
            onClick={fetchData}
            className="text-sm text-blue-600 hover:text-blue-800 transition"
          >
            更新
          </button>
        </div>
        {sessions.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">まだ接続している生徒がいません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">クラス</th>
                  <th className="px-4 py-3 text-left">番号</th>
                  <th className="px-4 py-3 text-left">名前</th>
                  <th className="px-4 py-3 text-left">開始時刻</th>
                  <th className="px-4 py-3 text-center">ページ</th>
                  <th className="px-4 py-3 text-center">提出</th>
                  <th className="px-4 py-3 text-right">点数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions
                  .sort((a, b) => {
                    const aName = `${a.students?.class_name}${String(a.students?.seat_number).padStart(3, '0')}`
                    const bName = `${b.students?.class_name}${String(b.students?.seat_number).padStart(3, '0')}`
                    return aName.localeCompare(bName)
                  })
                  .map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{s.students?.class_name ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{s.students?.seat_number ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{s.students?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {s.started_at ? new Date(s.started_at).toLocaleTimeString('ja-JP') : '未開始'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.started_at ? (
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                            {pagesMap[s.id] ?? 1}ページ
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.is_submitted ? (
                          <span className="text-green-600 font-medium">済</span>
                        ) : (
                          <span className="text-gray-400">未</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {s.score !== null ? `${s.score}点` : '-'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 問題プレビューモーダル */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
          {/* モーダルヘッダー */}
          <div className="bg-blue-600 text-white px-4 py-4 flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowPreview(false)}
              className="text-blue-200 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div>
              <h2 className="font-bold text-lg leading-tight">問題プレビュー</h2>
              <p className="text-blue-200 text-sm">{test.title} — {questions.length}問 / 正解は緑でハイライト</p>
            </div>
          </div>

          {/* スクロールエリア */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
              {questions.length === 0 && (
                <div className="text-center text-gray-400 py-12">問題がありません</div>
              )}
              {questions.map((q) => {
                const choices = [
                  { num: 1, text: q.choice1 },
                  { num: 2, text: q.choice2 },
                  { num: 3, text: q.choice3 },
                  { num: 4, text: q.choice4 },
                  { num: 5, text: q.choice5 },
                ].filter((c) => c.text && c.text !== 'None' && c.text !== 'null')

                return (
                  <div key={q.id} className="bg-white rounded-2xl border-2 border-gray-200 p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-lg shrink-0 mt-0.5">
                        {q.order_num}
                      </span>
                      <p className="text-gray-800 font-medium leading-relaxed flex-1">{q.question_text}</p>
                      <span className="text-xs text-gray-400 shrink-0">{q.points}点</span>
                    </div>
                    <div className="space-y-2">
                      {choices.map((choice) => {
                        const isCorrect = choice.num === q.correct_answer
                        return (
                          <div
                            key={choice.num}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-sm ${
                              isCorrect
                                ? 'border-green-400 bg-green-50 text-green-800 font-medium'
                                : 'border-gray-100 text-gray-600'
                            }`}
                          >
                            <span className="text-gray-400 text-xs shrink-0">
                              {['①', '②', '③', '④', '⑤'][choice.num - 1]}
                            </span>
                            <span className="flex-1">{choice.text}</span>
                            {isCorrect && (
                              <span className="text-green-600 text-xs font-bold shrink-0">✓ 正解</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <div className="h-4" />
            </div>
          </div>
        </div>
      )}

      {/* 不正ログ */}
      {cheatLogs.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100 bg-red-50">
            <h2 className="font-semibold text-red-800">不正行為ログ ({cheatLogs.length}件)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">時刻</th>
                  <th className="px-4 py-3 text-left">クラス</th>
                  <th className="px-4 py-3 text-left">名前</th>
                  <th className="px-4 py-3 text-left">イベント</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cheatLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-red-50">
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(log.occurred_at).toLocaleTimeString('ja-JP')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {log.sessions?.students?.class_name ?? '-'} {log.sessions?.students?.seat_number ?? ''}
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-medium">
                      {log.sessions?.students?.name ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        {cheatEventLabel[log.event_type] ?? log.event_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
