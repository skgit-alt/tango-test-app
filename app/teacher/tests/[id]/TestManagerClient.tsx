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
  const [classes, setClasses] = useState<string[]>([])
  const [loadingClass, setLoadingClass] = useState<string | null>(null)
  // テスト名編集
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(test.title)
  // 第何回編集
  const [editingRound, setEditingRound] = useState(false)
  const [roundInput, setRoundInput] = useState(String(test.round_number ?? ''))
  // 提出リセット
  const [resettingId, setResettingId] = useState<string | null>(null)
  // 予約開始
  const [scheduledAt, setScheduledAt] = useState<string>(
    test.scheduled_at
      ? new Date(test.scheduled_at).toISOString().slice(0, 16)  // datetime-local 形式
      : ''
  )
  const [savingSchedule, setSavingSchedule] = useState(false)

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

    // クラス一覧を取得
    supabase.from('students').select('class_name').order('class_name').then(({ data }) => {
      if (data) setClasses([...new Set(data.map(s => s.class_name))].filter(Boolean).sort())
    })

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
          // IDを検証して自分のテストの更新のみ適用する
          if (payload.new && payload.new.id === test.id) setTest(payload.new as Test)
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

  const handleOpenClass = async (className: string) => {
    const current = test.open_classes ?? []
    if (current.includes(className)) return
    setLoadingClass(className)
    const newClasses = [...current, className]
    const { error } = await supabase
      .from('tests')
      .update({ open_classes: newClasses })
      .eq('id', test.id)
    if (error) setActionError(`${className}の開始に失敗しました`)
    setLoadingClass(null)
  }

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

  // 予約開始を設定・解除
  const handleSaveSchedule = async () => {
    setSavingSchedule(true)
    setActionError('')
    const value = scheduledAt ? new Date(scheduledAt).toISOString() : null
    const { error } = await supabase
      .from('tests')
      .update({ scheduled_at: value })
      .eq('id', test.id)
    if (error) setActionError('予約の保存に失敗しました')
    else setTest((prev) => ({ ...prev, scheduled_at: value }))
    setSavingSchedule(false)
  }

  const handleCancelSchedule = async () => {
    if (!confirm('予約を解除しますか？')) return
    setSavingSchedule(true)
    await supabase.from('tests').update({ scheduled_at: null }).eq('id', test.id)
    setTest((prev) => ({ ...prev, scheduled_at: null }))
    setScheduledAt('')
    setSavingSchedule(false)
  }

  // 提出をリセット（回答削除 + セッション未提出に戻す）
  const handleResetSession = async (sessionId: string, studentName: string) => {
    if (!confirm(`${studentName} の提出をリセットしますか？\n回答データが削除され、もう一度受け直せるようになります。`)) return
    setResettingId(sessionId)
    try {
      await supabase.from('answers').delete().eq('session_id', sessionId)
      await supabase
        .from('sessions')
        .update({ is_submitted: false, score: null, submitted_at: null, current_page: 1 })
        .eq('id', sessionId)
      await fetchData()
    } catch (err) {
      console.error(err)
      setActionError('リセットに失敗しました')
    } finally {
      setResettingId(null)
    }
  }

  // 第何回を保存
  const handleSaveRound = async () => {
    const val = roundInput.trim() === '' ? null : parseInt(roundInput)
    if (roundInput.trim() !== '' && (isNaN(val!) || val! < 1)) return
    const { error } = await supabase
      .from('tests')
      .update({ round_number: val })
      .eq('id', test.id)
    if (error) {
      setActionError('回数の保存に失敗しました')
    } else {
      setTest((prev) => ({ ...prev, round_number: val }))
      setEditingRound(false)
    }
  }

  // 待機状態に戻す（open_classes・opened_atもリセット）
  const handleResetToWaiting = async () => {
    if (!confirm('テストを待機状態に戻しますか？\n開始済みのクラスもリセットされます。\n※すでに開始した生徒のセッションはそのまま残ります。')) return
    setLoading(true)
    setActionError('')
    const { error } = await supabase
      .from('tests')
      .update({ status: 'waiting', open_classes: null, opened_at: null })
      .eq('id', test.id)
    if (error) setActionError('待機状態への変更に失敗しました')
    setLoading(false)
  }

  // テスト名を保存
  const handleSaveTitle = async () => {
    const trimmed = titleInput.trim()
    if (!trimmed) return
    const { error } = await supabase
      .from('tests')
      .update({ title: trimmed })
      .eq('id', test.id)
    if (error) {
      setActionError('テスト名の保存に失敗しました')
    } else {
      setTest((prev) => ({ ...prev, title: trimmed }))
      setEditingTitle(false)
    }
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
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <a href="/teacher" className="text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>

            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                  className="border border-blue-400 rounded-lg px-3 py-1.5 text-lg font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[280px]"
                  autoFocus
                />
                <button onClick={handleSaveTitle} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">保存</button>
                <button onClick={() => { setEditingTitle(false); setTitleInput(test.title) }} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-200 transition">キャンセル</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-800">{test.title}</h1>
                <button
                  onClick={() => { setTitleInput(test.title); setEditingTitle(true) }}
                  className="text-gray-400 hover:text-blue-500 transition p-1 rounded"
                  title="テスト名を編集"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            )}

            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[test.status]}`}>
              {statusLabel[test.status]}
            </span>
          </div>
          <div className="text-sm text-gray-500 ml-8 flex items-center gap-3 flex-wrap">
            <span>
              {test.mode}問モード / 制限時間 {test.time_limit}秒
              {test.pass_score ? ` / 合格点 ${test.pass_score}点` : ''}
            </span>
            {/* 50問モードのみ「第何回」を表示・編集 */}
            {test.mode === 50 && (
              <span className="flex items-center gap-1">
                {editingRound ? (
                  <>
                    <span>第</span>
                    <input
                      type="number"
                      min={1}
                      value={roundInput}
                      onChange={(e) => setRoundInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRound(); if (e.key === 'Escape') setEditingRound(false) }}
                      className="w-16 border border-blue-400 rounded px-2 py-0.5 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      autoFocus
                    />
                    <span>回</span>
                    <button onClick={handleSaveRound} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700">保存</button>
                    <button onClick={() => setEditingRound(false)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
                  </>
                ) : (
                  <>
                    <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-medium">
                      {test.round_number != null ? `第${test.round_number}回` : '回数未設定'}
                    </span>
                    <button
                      onClick={() => { setRoundInput(String(test.round_number ?? '')); setEditingRound(true) }}
                      className="text-gray-400 hover:text-blue-500 transition"
                      title="回数を編集"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowPreview(true)}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition text-sm"
          >
            問題プレビュー
          </button>
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

      {/* 予約開始 */}
      {test.status === 'waiting' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">予約開始</h2>
              <p className="text-xs text-gray-400 mt-0.5">指定日時に全クラスを自動で開始します</p>
            </div>
            {test.scheduled_at && (
              <span className="text-xs bg-yellow-100 text-yellow-700 font-medium px-3 py-1 rounded-full">
                🕐 予約済み
              </span>
            )}
          </div>

          {test.scheduled_at && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-yellow-800">
                  {new Date(test.scheduled_at).toLocaleString('ja-JP', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })} に自動開始
                </p>
                <p className="text-xs text-yellow-600 mt-0.5">その時刻になると全クラスが一斉に開始されます</p>
              </div>
              <button
                onClick={handleCancelSchedule}
                disabled={savingSchedule}
                className="text-xs text-red-500 border border-red-200 bg-white hover:bg-red-50 px-3 py-1.5 rounded-lg font-medium transition ml-3 shrink-0"
              >
                予約を解除
              </button>
            </div>
          )}

          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">日時を選択</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSaveSchedule}
              disabled={savingSchedule || !scheduledAt}
              className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              {savingSchedule ? '保存中...' : test.scheduled_at ? '予約を更新' : '予約を設定'}
            </button>
          </div>
        </div>
      )}

      {/* クラス別開始 */}
      {(test.status === 'waiting' || test.status === 'open') && classes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">クラス別開始</h2>
            {/* 待機状態に戻すボタン：open_classesに1つ以上開始済み、またはstatus=open の場合に表示 */}
            {(test.status === 'open' || (test.open_classes ?? []).length > 0) && (
              <button
                onClick={handleResetToWaiting}
                disabled={loading}
                className="text-sm text-orange-600 border border-orange-300 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50"
              >
                ↩ 待機状態に戻す
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {classes.map((cls) => {
              const opened = (test.open_classes ?? []).includes(cls) || test.status === 'open'
              const isLoading = loadingClass === cls
              return (
                <button
                  key={cls}
                  onClick={() => handleOpenClass(cls)}
                  disabled={opened || isLoading || test.status === 'open'}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition active:scale-95 ${
                    opened
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                  }`}
                >
                  {isLoading ? '...' : opened ? `${cls} ✓` : `${cls} 開始`}
                </button>
              )
            })}
          </div>
          {test.status === 'waiting' && (
            <button
              onClick={handleOpenTest}
              disabled={loading}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 active:scale-95 transition disabled:opacity-50"
            >
              全クラス一括開始
            </button>
          )}
          {test.status === 'open' && (
            <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm font-semibold text-center">
              ✅ 全クラス実施中
            </div>
          )}
        </div>
      )}

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
                  <th className="px-4 py-3 text-center">再受験</th>
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
                      <td className="px-4 py-3 text-center">
                        {s.is_submitted && (
                          <button
                            onClick={() => handleResetSession(s.id, s.students?.name ?? '生徒')}
                            disabled={resettingId === s.id}
                            className="text-xs text-orange-600 border border-orange-300 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-lg font-medium transition disabled:opacity-50"
                          >
                            {resettingId === s.id ? '...' : 'リセット'}
                          </button>
                        )}
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
