'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Test, Session, CheatLog, Student, Question, calcPoints } from '@/lib/supabase/types'
import * as XLSX from 'xlsx'

interface SessionWithStudent extends Session {
  students: Pick<Student, 'name' | 'class_name' | 'seat_number' | 'test_name'> | null
}

interface StudentInfo {
  id: string
  name: string
  class_name: string
  seat_number: number
  test_name: string
}

// テーブル表示用の統合行型（セッションあり・なし両対応）
interface TableRow {
  sessionId: string | null
  studentId: string
  class_name: string
  seat_number: number
  name: string
  test_name: string
  started_at: string | null
  submitted_at: string | null
  is_submitted: boolean
  is_absent: boolean
  score: number | null
}

type EditStatus = 'none' | 'submitted' | 'absent'
type SortKey = 'class_name' | 'seat_number' | 'name' | 'started_at' | 'is_submitted' | 'score'

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
  const [allStudents, setAllStudents] = useState<StudentInfo[]>([])
  const [cheatLogs, setCheatLogs] = useState<CheatLogWithStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [classes, setClasses] = useState<string[]>([])
  const [loadingClass, setLoadingClass] = useState<string | null>(null)
  // 修正モーダル
  const [editTarget, setEditTarget] = useState<TableRow | null>(null)
  const [editScore, setEditScore] = useState('')
  const [editStatus, setEditStatus] = useState<EditStatus>('none')
  const [editSaving, setEditSaving] = useState(false)
  // チェックボックス一括操作
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  // テーブルソート
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // モード別にクラスを絞り込む
  // 20問テスト → 1～6組（数字始まり）のみ / 50問テスト → A～D組（英字始まり）のみ
  // 数字でも英字でも始まらないクラス（実験用クラス等）は全テストで常に表示
  const visibleClasses = classes.filter((cls) => {
    const isNumeric = /^\d/.test(cls)
    const isAlpha = /^[A-Za-z]/.test(cls)
    if (!isNumeric && !isAlpha) return true   // 実験用クラス等 → 常に表示
    if (test.mode === 50) return isAlpha       // 50問 → A～D組のみ
    if (test.mode === 300) return true         // 300問 → 全クラス
    return isNumeric                           // 20問 → 1～6組のみ
  })
  // テスト名編集
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(test.title)
  // 第何回編集
  const [editingRound, setEditingRound] = useState(false)
  const [roundInput, setRoundInput] = useState(String(test.round_number ?? ''))
  // 制限時間編集
  const [editingTimeLimit, setEditingTimeLimit] = useState(false)
  const [timeLimitMin, setTimeLimitMin] = useState(String(Math.floor(test.time_limit / 60)))
  const [timeLimitSec, setTimeLimitSec] = useState(String(test.time_limit % 60))
  // 開始モーダル
  const [startModal, setStartModal] = useState<{ open: boolean; target: string | 'all' }>({ open: false, target: 'all' })
  const [modalScheduleMode, setModalScheduleMode] = useState(false)
  const [modalScheduledAt, setModalScheduledAt] = useState('')
  // 先生メッセージ編集
  const DEFAULT_TEACHER_MESSAGE = '「単語・熟語の勉強は前日にちょっと頑張って７割取った！」みたいな勉強では短期記憶で身に付きません。スパイラルで繰り返して繰り返して勉強するしか知識として身に付きません。満点が取れるくらい繰り返して勉強してください。'
  const [showMessageEditor, setShowMessageEditor] = useState(false)
  const [messageInput, setMessageInput] = useState(test.teacher_message ?? DEFAULT_TEACHER_MESSAGE)
  const [savingMessage, setSavingMessage] = useState(false)
  const [messageSaved, setMessageSaved] = useState(false)
  // 提出リセット
  const [resettingId, setResettingId] = useState<string | null>(null)
  // 結果公開
  const [publishingClass, setPublishingClass] = useState<string | null>(null)
  const [publishingStudent, setPublishingStudent] = useState<string | null>(null)
  // 予約開始（datetime-local はローカル時刻＝JST で表示する必要がある）
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    if (!test.scheduled_at) return ''
    const d = new Date(test.scheduled_at)
    // getTimezoneOffset() は UTC との差を分単位で返す（JST は -540）
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return local.toISOString().slice(0, 16)  // YYYY-MM-DDTHH:MM（ローカル時刻）
  })
  const [savingSchedule, setSavingSchedule] = useState(false)

  const fetchData = useCallback(async () => {
    // admin権限APIでRLSをバイパスしてセッション・生徒一覧取得
    const res = await fetch(`/api/teacher/test-sessions?testId=${test.id}`)
    if (res.ok) {
      const data = await res.json()
      if (data.sessions) setSessions(data.sessions as SessionWithStudent[])
      if (data.cheatLogs) setCheatLogs(data.cheatLogs as CheatLogWithStudent[])
      if (data.allStudents) setAllStudents(data.allStudents as StudentInfo[])
    }
  }, [test.id])

  useEffect(() => {
    fetchData()

    // クラス一覧を取得
    fetch('/api/teacher/classes').then(r => r.ok ? r.json() : null).then((data) => {
      if (data?.classes) setClasses(data.classes)
    }).catch(() => {})

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

  const updateTest = async (patch: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch('/api/teacher/update-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testId: test.id, patch }),
    })
    return res.ok
  }

  const handleOpenClass = async (className: string) => {
    const current = test.open_classes ?? []
    if (current.includes(className)) return
    setLoadingClass(className)
    const newClasses = [...current, className]
    const ok = await updateTest({ open_classes: newClasses })
    if (!ok) setActionError(`${className}の開始に失敗しました`)
    else setTest((prev) => ({ ...prev, open_classes: newClasses }))
    setLoadingClass(null)
  }

  const handleOpenTest = async () => {
    setLoading(true)
    setActionError('')
    const openedAt = new Date().toISOString()
    const ok = await updateTest({ status: 'open', opened_at: openedAt })
    if (!ok) setActionError('テスト開始に失敗しました')
    else setTest((prev) => ({ ...prev, status: 'open', opened_at: openedAt }))
    setLoading(false)
  }

  // 予約開始を設定・解除
  const handleSaveSchedule = async () => {
    setSavingSchedule(true)
    setActionError('')
    const value = scheduledAt ? new Date(scheduledAt).toISOString() : null
    const ok = await updateTest({ scheduled_at: value })
    if (!ok) setActionError('予約の保存に失敗しました')
    else setTest((prev) => ({ ...prev, scheduled_at: value }))
    setSavingSchedule(false)
  }

  const handleCancelSchedule = async () => {
    if (!confirm('予約を解除しますか？')) return
    setSavingSchedule(true)
    await updateTest({ scheduled_at: null })
    setTest((prev) => ({ ...prev, scheduled_at: null }))
    setScheduledAt('')
    setSavingSchedule(false)
  }

  // クラス別予約を解除
  const handleCancelClassSchedule = async (cls: string) => {
    if (!confirm(`${cls} の予約を解除しますか？`)) return
    setSavingSchedule(true)
    const current = { ...(test.scheduled_class_starts ?? {}) }
    delete current[cls]
    const ok = await updateTest({ scheduled_class_starts: current })
    if (ok) setTest((prev) => ({ ...prev, scheduled_class_starts: current }))
    setSavingSchedule(false)
  }

  // モーダル：今すぐ開始
  const handleModalImmediateStart = async () => {
    const target = startModal.target
    setStartModal({ open: false, target: 'all' })
    if (target === 'all') {
      await handleOpenTest()
    } else {
      await handleOpenClass(target)
    }
  }

  // モーダル：予約開始を保存
  const handleModalScheduledStart = async () => {
    if (!modalScheduledAt) return
    setSavingSchedule(true)
    const target = startModal.target
    const isoValue = new Date(modalScheduledAt).toISOString()
    if (target === 'all') {
      const ok = await updateTest({ scheduled_at: isoValue })
      if (!ok) setActionError('予約の保存に失敗しました')
      else { setTest((prev) => ({ ...prev, scheduled_at: isoValue })); setScheduledAt(modalScheduledAt) }
    } else {
      const current = test.scheduled_class_starts ?? {}
      const updated = { ...current, [target]: isoValue }
      const ok = await updateTest({ scheduled_class_starts: updated })
      if (!ok) setActionError('予約の保存に失敗しました')
      else setTest((prev) => ({ ...prev, scheduled_class_starts: updated }))
    }
    setSavingSchedule(false)
    setStartModal({ open: false, target: 'all' })
  }

  // 提出をリセット（回答削除 + セッション未提出に戻す）
  const handleResetSession = async (sessionId: string, studentName: string) => {
    if (!confirm(`${studentName} の提出をリセットしますか？\n回答データが削除され、もう一度受け直せるようになります。`)) return
    setResettingId(sessionId)
    try {
      const res = await fetch('/api/teacher/reset-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) throw new Error('failed')
      await fetchData()
    } catch (err) {
      console.error(err)
      setActionError('リセットに失敗しました')
    } finally {
      setResettingId(null)
    }
  }

  // 修正モーダルを開く
  const handleOpenEdit = (row: TableRow) => {
    setEditTarget(row)
    setEditScore(row.score !== null ? String(row.score) : '')
    if (row.is_absent) setEditStatus('absent')
    else if (row.is_submitted) setEditStatus('submitted')
    else setEditStatus('none')
  }

  // 修正を保存
  const handleSaveEdit = async () => {
    if (!editTarget) return
    setEditSaving(true)
    const scoreVal = editScore.trim() === '' ? null : Number(editScore)
    try {
      const res = await fetch('/api/teacher/update-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId: test.id,
          studentId: editTarget.studentId,
          sessionId: editTarget.sessionId,
          score: editStatus === 'absent' ? null : scoreVal,
          is_submitted: editStatus === 'submitted',
          is_absent: editStatus === 'absent',
        }),
      })
      if (!res.ok) throw new Error('failed')
      await fetchData()
      setEditTarget(null)
    } catch {
      setActionError('更新に失敗しました')
    } finally {
      setEditSaving(false)
    }
  }

  // チェックボックス操作
  const handleSelectToggle = (studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const handleSelectAll = (rows: TableRow[]) => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.studentId)))
    }
  }

  // 一括：欠席にする
  const handleBulkAbsent = async (rows: TableRow[]) => {
    const targets = rows.filter((r) => selectedIds.has(r.studentId))
    if (targets.length === 0) return
    if (!confirm(`${targets.length}人を欠席にしますか？`)) return
    setBulkLoading(true)
    try {
      await Promise.all(
        targets.map((row) =>
          fetch('/api/teacher/update-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              testId: test.id,
              studentId: row.studentId,
              sessionId: row.sessionId,
              score: null,
              is_submitted: false,
              is_absent: true,
            }),
          })
        )
      )
      await fetchData()
      setSelectedIds(new Set())
    } catch {
      setActionError('一括欠席処理に失敗しました')
    } finally {
      setBulkLoading(false)
    }
  }

  // 一括：リセット（提出済みのみ対象）
  const handleBulkReset = async (rows: TableRow[]) => {
    const targets = rows.filter(
      (r) => selectedIds.has(r.studentId) && r.sessionId && r.is_submitted
    )
    if (targets.length === 0) {
      alert('リセット対象（提出済み）の生徒が選択されていません')
      return
    }
    if (!confirm(`${targets.length}人の提出をリセットしますか？\n回答データが削除されます。`)) return
    setBulkLoading(true)
    try {
      await Promise.all(
        targets.map((row) =>
          fetch('/api/teacher/reset-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: row.sessionId }),
          })
        )
      )
      await fetchData()
      setSelectedIds(new Set())
    } catch {
      setActionError('一括リセットに失敗しました')
    } finally {
      setBulkLoading(false)
    }
  }

  // 第何回を保存
  const handleSaveRound = async () => {
    const val = roundInput.trim() === '' ? null : parseInt(roundInput)
    if (roundInput.trim() !== '' && (isNaN(val!) || val! < 1)) return
    const ok = await updateTest({ round_number: val })
    if (!ok) {
      setActionError('回数の保存に失敗しました')
    } else {
      setTest((prev) => ({ ...prev, round_number: val }))
      setEditingRound(false)
    }
  }

  const handleSaveTimeLimit = async () => {
    const minutes = parseInt(timeLimitMin) || 0
    const secs = parseInt(timeLimitSec) || 0
    const total = minutes * 60 + secs
    if (total < 1 || total > 10800) return
    const ok = await updateTest({ time_limit: total })
    if (!ok) {
      setActionError('制限時間の保存に失敗しました')
    } else {
      setTest((prev) => ({ ...prev, time_limit: total }))
      setEditingTimeLimit(false)
    }
  }

  const handleSaveMessage = async (asDefault: boolean) => {
    setSavingMessage(true)
    const ok = await updateTest({ teacher_message: messageInput })
    if (!ok) { setActionError('メッセージの保存に失敗しました'); setSavingMessage(false); return }
    setTest((prev) => ({ ...prev, teacher_message: messageInput }))
    if (asDefault) {
      await fetch('/api/teacher/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: messageInput }),
      })
    }
    setSavingMessage(false)
    setShowMessageEditor(false)
    setMessageSaved(true)
    setTimeout(() => setMessageSaved(false), 3000)
  }

  // 待機状態に戻す（open_classes・opened_atもリセット）
  const handleResetToWaiting = async () => {
    if (!confirm('テストを待機状態に戻しますか？\n開始済みのクラスもリセットされます。\n※すでに開始した生徒のセッションはそのまま残ります。')) return
    setLoading(true)
    setActionError('')
    const ok = await updateTest({ status: 'waiting', open_classes: null, opened_at: null })
    if (!ok) setActionError('待機状態への変更に失敗しました')
    else setTest((prev) => ({ ...prev, status: 'waiting', open_classes: null, opened_at: null }))
    setLoading(false)
  }

  // テスト名を保存
  const handleSaveTitle = async () => {
    const trimmed = titleInput.trim()
    if (!trimmed) return
    const ok = await updateTest({ title: trimmed })
    if (!ok) {
      setActionError('テスト名の保存に失敗しました')
    } else {
      setTest((prev) => ({ ...prev, title: trimmed }))
      setEditingTitle(false)
    }
  }

  // 全員一括公開
  const handlePublishResult = async () => {
    if (!confirm('全員の結果を一括公開します。この操作は元に戻せません。よろしいですか？')) return
    setLoading(true)
    setActionError('')
    const publishedAt = new Date().toISOString()
    const ok = await updateTest({ status: 'published', published_at: publishedAt })
    if (!ok) setActionError('結果公開に失敗しました')
    else setTest((prev) => ({ ...prev, status: 'published', published_at: publishedAt }))
    setLoading(false)
  }

  // クラスごとに公開
  const handlePublishToClass = async (className: string) => {
    const current = test.published_classes ?? []
    if (current.includes(className)) return
    setPublishingClass(className)
    const newList = [...current, className]
    const ok = await updateTest({ published_classes: newList })
    if (!ok) setActionError(`${className}への公開に失敗しました`)
    else setTest((prev) => ({ ...prev, published_classes: newList }))
    setPublishingClass(null)
  }

  // 個人ごとに公開
  const handlePublishToStudent = async (studentId: string) => {
    const current = test.published_student_ids ?? []
    if (current.includes(studentId)) return
    setPublishingStudent(studentId)
    const newList = [...current, studentId]
    const ok = await updateTest({ published_student_ids: newList })
    if (!ok) setActionError('個人公開に失敗しました')
    else setTest((prev) => ({ ...prev, published_student_ids: newList }))
    setPublishingStudent(null)
  }

  const handleDownloadExcel = () => {
    // クラス・出席番号順でソート（毎回確実に）
    const sorted = [...tableRows].sort((a, b) => {
      const ak = `${a.class_name}${String(a.seat_number).padStart(3, '0')}`
      const bk = `${b.class_name}${String(b.seat_number).padStart(3, '0')}`
      return ak.localeCompare(bk)
    })

    const rows = sorted.map((row) => {
      const absent = row.is_absent === true
      const scoreVal = !absent && row.score !== null ? row.score : null
      return {
        クラス: row.class_name,
        出席番号: row.seat_number,
        名前: row.name,
        テストネーム: row.test_name,
        点数: scoreVal !== null ? scoreVal : '',
        ポイント: test.mode === 50 && scoreVal !== null ? calcPoints(scoreVal) : '',
        提出済み: absent ? '欠席' : row.is_submitted ? '済' : '未',
        開始時刻: row.started_at ? new Date(row.started_at).toLocaleString('ja-JP') : '',
        提出時刻: row.submitted_at ? new Date(row.submitted_at).toLocaleString('ja-JP') : '',
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, '結果一覧')
    XLSX.writeFile(wb, `${test.title}_結果.xlsx`)
  }

  const submittedCount = sessions.filter((s) => s.is_submitted).length
  const startedCount = sessions.filter((s) => s.started_at).length

  // セッションあり・なし両方を統合した表示行
  const sessionByStudentId = Object.fromEntries(sessions.map((s) => [s.student_id, s]))
  const tableRows: TableRow[] = [
    // セッションあり
    ...sessions.map((s) => ({
      sessionId: s.id,
      studentId: s.student_id,
      class_name: s.students?.class_name ?? '',
      seat_number: s.students?.seat_number ?? 0,
      name: s.students?.name ?? '-',
      test_name: s.students?.test_name ?? '',
      started_at: s.started_at,
      submitted_at: s.submitted_at,
      is_submitted: s.is_submitted,
      is_absent: (s as Session & { is_absent?: boolean }).is_absent ?? false,
      score: s.score,
    })),
    // セッションなし（未受験者）
    ...allStudents
      .filter((st) => !sessionByStudentId[st.id])
      .map((st) => ({
        sessionId: null,
        studentId: st.id,
        class_name: st.class_name,
        seat_number: st.seat_number,
        name: st.name,
        test_name: st.test_name,
        started_at: null,
        submitted_at: null,
        is_submitted: false,
        is_absent: false,
        score: null,
      })),
  ].sort((a, b) => {
    const ak = `${a.class_name}${String(a.seat_number).padStart(3, '0')}`
    const bk = `${b.class_name}${String(b.seat_number).padStart(3, '0')}`
    return ak.localeCompare(bk)
  })

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedTableRows = sortKey === null ? tableRows : [...tableRows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    switch (sortKey) {
      case 'class_name': {
        const cmp = a.class_name.localeCompare(b.class_name, 'ja')
        return cmp !== 0 ? dir * cmp : a.seat_number - b.seat_number
      }
      case 'seat_number':
        return dir * (a.seat_number - b.seat_number)
      case 'name':
        return dir * a.name.localeCompare(b.name, 'ja')
      case 'started_at': {
        if (!a.started_at && !b.started_at) return 0
        if (!a.started_at) return 1
        if (!b.started_at) return -1
        return dir * (new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
      }
      case 'is_submitted': {
        const val = (r: TableRow) => r.is_absent ? -1 : r.is_submitted ? 1 : 0
        return dir * (val(a) - val(b))
      }
      case 'score': {
        if (a.score === null && b.score === null) return 0
        if (a.score === null) return 1
        if (b.score === null) return -1
        return dir * (a.score - b.score)
      }
      default:
        return 0
    }
  })

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
            <span className="flex items-center gap-1">
              {test.mode}問モード /
              {editingTimeLimit ? (
                <>
                  <span className="ml-1">制限時間</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={timeLimitMin}
                    onChange={(e) => setTimeLimitMin(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTimeLimit(); if (e.key === 'Escape') setEditingTimeLimit(false) }}
                    className="w-14 border border-blue-400 rounded px-2 py-0.5 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    autoFocus
                  />
                  <span>分</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={timeLimitSec}
                    onChange={(e) => setTimeLimitSec(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTimeLimit(); if (e.key === 'Escape') setEditingTimeLimit(false) }}
                    className="w-14 border border-blue-400 rounded px-2 py-0.5 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span>秒</span>
                  <button onClick={handleSaveTimeLimit} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700">保存</button>
                  <button onClick={() => setEditingTimeLimit(false)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
                </>
              ) : (
                <>
                  <span className="ml-1">制限時間 {Math.floor(test.time_limit / 60)}分{test.time_limit % 60 > 0 ? `${test.time_limit % 60}秒` : ''}</span>
                  <button
                    onClick={() => { setTimeLimitMin(String(Math.floor(test.time_limit / 60))); setTimeLimitSec(String(test.time_limit % 60)); setEditingTimeLimit(true) }}
                    className="text-gray-400 hover:text-blue-500 transition"
                    title="制限時間を編集"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </>
              )}
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
          {test.status === 'published' && (
            <span className="bg-blue-100 text-blue-700 px-4 py-2.5 rounded-xl text-sm font-semibold">
              ✅ 全員に公開済み
            </span>
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

      {/* テスト開始 */}
      {(test.status === 'waiting' || test.status === 'open') && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">テスト開始</h2>
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

          {/* 予約済み情報（全クラス一括） */}
          {test.status === 'waiting' && test.scheduled_at && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-yellow-700 mb-0.5">🕐 全クラス一括 — 予約開始</p>
                <p className="text-sm font-semibold text-yellow-800">
                  {new Date(test.scheduled_at).toLocaleString('ja-JP', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
              <button
                onClick={handleCancelSchedule}
                disabled={savingSchedule}
                className="text-xs text-red-500 border border-red-200 bg-white hover:bg-red-50 px-3 py-1.5 rounded-lg font-medium transition ml-3 shrink-0"
              >
                解除
              </button>
            </div>
          )}

          {/* 予約済み情報（クラス別） */}
          {test.status === 'waiting' && Object.keys(test.scheduled_class_starts ?? {}).length > 0 && (
            <div className="space-y-2">
              {Object.entries(test.scheduled_class_starts ?? {}).map(([cls, isoTime]) => (
                <div key={cls} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-blue-700 mb-0.5">🕐 {cls} — 予約開始</p>
                    <p className="text-sm font-semibold text-blue-800">
                      {new Date(isoTime).toLocaleString('ja-JP', {
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancelClassSchedule(cls)}
                    disabled={savingSchedule}
                    className="text-xs text-red-500 border border-red-200 bg-white hover:bg-red-50 px-3 py-1.5 rounded-lg font-medium transition ml-3 shrink-0"
                  >
                    解除
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* クラス別ボタン */}
          {visibleClasses.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {visibleClasses.map((cls) => {
                  const opened = (test.open_classes ?? []).includes(cls) || test.status === 'open'
                  const isScheduled = !!(test.scheduled_class_starts ?? {})[cls]
                  const isLoading = loadingClass === cls
                  return (
                    <button
                      key={cls}
                      onClick={() => {
                        if (opened || test.status === 'open') return
                        const existing = (test.scheduled_class_starts ?? {})[cls]
                        const localExisting = existing
                          ? (() => { const d = new Date(existing); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })()
                          : ''
                        setModalScheduledAt(localExisting)
                        setModalScheduleMode(false)
                        setStartModal({ open: true, target: cls })
                      }}
                      disabled={opened || isLoading || test.status === 'open'}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition active:scale-95 ${
                        opened
                          ? 'bg-green-100 text-green-700 cursor-default'
                          : isScheduled
                          ? 'bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200'
                          : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                      }`}
                    >
                      {isLoading ? '...' : opened ? `${cls} ✓` : isScheduled ? `${cls} 🕐` : cls}
                    </button>
                  )
                })}
              </div>
              {test.status === 'waiting' && (
                <button
                  onClick={() => {
                    const existing = test.scheduled_at
                    const localExisting = existing
                      ? (() => { const d = new Date(existing); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })()
                      : ''
                    setModalScheduledAt(localExisting)
                    setModalScheduleMode(false)
                    setStartModal({ open: true, target: 'all' })
                  }}
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
        </div>
      )}

      {/* 結果を返す — テストが開始された後は常に表示 */}
      {((test.open_classes ?? []).length > 0 || test.status === 'open' || test.status === 'finished' || test.status === 'published') && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
          <h2 className="font-semibold text-gray-800">結果を返す</h2>

          {/* 一括公開 */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">① 全員に一括公開</p>
            {test.status === 'published' ? (
              <div className="flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-xl text-sm font-semibold">✅ 全員に公開済み</span>
                <p className="text-xs text-gray-400">再受験者の結果も自動で閲覧可能です</p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePublishResult}
                  disabled={loading}
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 active:scale-95 transition disabled:opacity-50 shadow-sm"
                >
                  {loading ? '処理中...' : '全員に一括公開'}
                </button>
                <p className="text-xs text-gray-400">全生徒に一斉に結果を公開します</p>
              </div>
            )}
          </div>

          {/* クラスごと公開 — 開始済みクラスのみ・全員公開済みでなければ表示 */}
          {test.status !== 'published' && ((test.status === 'open' ? visibleClasses : (test.open_classes ?? [])).length > 0) && (
            <div className="space-y-2 pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">② クラスごとに公開</p>
              <p className="text-xs text-gray-400">開始済みのクラスに結果を返します</p>
              <div className="flex flex-wrap gap-2">
                {(test.status === 'open' ? visibleClasses : (test.open_classes ?? [])).map((cls) => {
                  const published = (test.published_classes ?? []).includes(cls)
                  const isLoading = publishingClass === cls
                  return (
                    <button
                      key={cls}
                      onClick={() => handlePublishToClass(cls)}
                      disabled={published || isLoading}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition active:scale-95 ${
                        published
                          ? 'bg-green-100 text-green-700 cursor-default'
                          : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'
                      }`}
                    >
                      {isLoading ? '...' : published ? `${cls} ✓ 公開済` : `${cls} に公開`}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 先生メッセージ（50問モードのみ） */}
          {test.mode === 50 && (
            <div className="space-y-2 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">④ 結果画面のメッセージ</p>
                <div className="flex items-center gap-3">
                  {messageSaved && (
                    <span className="text-green-600 text-sm font-medium">✓ 保存しました</span>
                  )}
                  {!showMessageEditor && (
                    <button
                      onClick={() => { setMessageInput(test.teacher_message ?? DEFAULT_TEACHER_MESSAGE); setShowMessageEditor(true) }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      編集
                    </button>
                  )}
                </div>
              </div>
              {showMessageEditor ? (
                <div className="space-y-3">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleSaveMessage(false)}
                      disabled={savingMessage}
                      className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {savingMessage ? '保存中...' : 'このテストだけ変更'}
                    </button>
                    <button
                      onClick={() => handleSaveMessage(true)}
                      disabled={savingMessage}
                      className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {savingMessage ? '保存中...' : '今後のデフォルトにする'}
                    </button>
                    <button
                      onClick={() => setShowMessageEditor(false)}
                      className="text-gray-500 px-4 py-2 rounded-xl text-sm hover:text-gray-700"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                  {test.teacher_message ?? DEFAULT_TEACHER_MESSAGE}
                </p>
              )}
            </div>
          )}

          {/* 個人ごと公開 — 提出済み生徒がいれば常に表示（再受験対応） */}
          {sessions.filter((s) => s.is_submitted).length > 0 && (
            <div className="space-y-2 pt-3 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">③ 個人ごとに公開（提出済みの生徒）</p>
              {test.status === 'published' && (
                <p className="text-xs text-blue-500">全員公開済みのため「閲覧可」が自動適用されています。再受験者も同様です。</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sessions
                  .filter((s) => s.is_submitted)
                  .sort((a, b) => {
                    const aKey = `${a.students?.class_name}${String(a.students?.seat_number).padStart(3, '0')}`
                    const bKey = `${b.students?.class_name}${String(b.students?.seat_number).padStart(3, '0')}`
                    return aKey.localeCompare(bKey)
                  })
                  .map((s) => {
                    const alreadyPublished =
                      test.status === 'published' ||
                      (test.published_classes ?? []).includes(s.students?.class_name ?? '') ||
                      (test.published_student_ids ?? []).includes(s.student_id)
                    const isLoading = publishingStudent === s.student_id
                    return (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                          alreadyPublished ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="text-sm">
                          <span className="text-gray-400 text-xs mr-1">{s.students?.class_name} {s.students?.seat_number}番</span>
                          <span className="font-medium text-gray-800">{s.students?.name ?? '-'}</span>
                          {s.score !== null && (
                            <span className="ml-2 text-gray-500 text-xs">{s.score}点</span>
                          )}
                        </div>
                        {alreadyPublished ? (
                          <span className="text-xs text-green-600 font-medium shrink-0">✓ 閲覧可</span>
                        ) : (
                          <button
                            onClick={() => handlePublishToStudent(s.student_id)}
                            disabled={isLoading}
                            className="text-xs bg-orange-500 text-white px-3 py-1 rounded-lg font-medium hover:bg-orange-600 transition disabled:opacity-50 shrink-0 ml-2"
                          >
                            {isLoading ? '...' : '公開'}
                          </button>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 生徒状況一覧 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">
            生徒ステータス
            <span className="ml-2 text-xs text-gray-400 font-normal">
              提出済み {submittedCount} / 全体 {tableRows.length}
            </span>
          </h2>
          <button onClick={fetchData} className="text-sm text-blue-600 hover:text-blue-800 transition">
            更新
          </button>
        </div>
        {tableRows.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">まだデータがありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {/* 全選択チェックボックス */}
                  <th className="pl-4 pr-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === tableRows.length && tableRows.length > 0}
                      onChange={() => handleSelectAll(tableRows)}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                    />
                  </th>
                  {([
                    { key: 'class_name', label: 'クラス', align: 'text-left' },
                    { key: 'seat_number', label: '番号', align: 'text-left' },
                    { key: 'name', label: '名前', align: 'text-left' },
                    { key: 'started_at', label: '開始時刻', align: 'text-left' },
                    { key: 'is_submitted', label: '提出', align: 'text-center' },
                    { key: 'score', label: '点数', align: 'text-right' },
                  ] as { key: SortKey; label: string; align: string }[]).map(({ key, label, align }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className={`px-4 py-3 ${align} cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap`}
                    >
                      {label}
                      <span className={`ml-1 text-xs ${sortKey === key ? 'text-blue-500' : 'text-gray-300'}`}>
                        {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </th>
                  ))}
                  {test.mode === 50 && <th className="px-4 py-3 text-right">pt</th>}
                  <th className="px-4 py-3 text-center">修正</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedTableRows.map((row) => {
                  const submitted = row.is_submitted === true
                  const absent = row.is_absent === true
                  const hasData = row.sessionId !== null
                  const isChecked = selectedIds.has(row.studentId)
                  const dash = <span className="text-gray-300">———</span>
                  return (
                    <tr
                      key={row.sessionId ?? `ns-${row.studentId}`}
                      className={`hover:bg-gray-50 ${isChecked ? 'bg-blue-50' : ''}`}
                    >
                      <td className="pl-4 pr-2 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectToggle(row.studentId)}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.class_name || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{row.seat_number || '-'}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {hasData && row.started_at
                          ? new Date(row.started_at).toLocaleTimeString('ja-JP')
                          : dash}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {absent ? (
                          <span className="text-orange-500 font-medium text-xs bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">欠席</span>
                        ) : submitted ? (
                          <span className="text-green-600 font-medium">済</span>
                        ) : (
                          <span className="text-red-500 font-medium">未</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {!absent && row.score !== null ? `${row.score}点` : dash}
                      </td>
                      {test.mode === 50 && (
                        <td className="px-4 py-3 text-right text-purple-700 font-medium">
                          {!absent && row.score !== null ? `${calcPoints(row.score)}pt` : dash}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleOpenEdit(row)}
                          className="text-xs text-blue-600 border border-blue-300 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg font-medium transition"
                        >
                          修正
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 一括操作バー（下からスライド） */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-out ${
          selectedIds.size > 0 ? 'translate-y-0 visible' : 'translate-y-full invisible'
        }`}
      >
        <div className="bg-white border-t-2 border-blue-200 shadow-2xl">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                {selectedIds.size}人
              </span>
              <span className="text-sm font-medium text-gray-700 truncate">を選択中</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkAbsent(tableRows)}
                disabled={bulkLoading}
                className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600 active:scale-95 transition disabled:opacity-50"
              >
                {bulkLoading ? '処理中...' : '欠席にする'}
              </button>
              <button
                onClick={() => handleBulkReset(tableRows)}
                disabled={bulkLoading}
                className="bg-red-100 text-red-700 border border-red-300 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-200 active:scale-95 transition disabled:opacity-50"
              >
                {bulkLoading ? '処理中...' : 'リセット'}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkLoading}
                className="text-gray-500 border border-gray-200 px-3 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
              >
                解除
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 修正モーダル */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div>
              <h3 className="font-bold text-gray-800 text-lg">データ修正</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {editTarget.class_name} {editTarget.seat_number}番　{editTarget.name}
              </p>
            </div>

            {/* 提出状態 */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">ステータス</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editStatus"
                    checked={editStatus === 'none'}
                    onChange={() => setEditStatus('none')}
                    className="accent-gray-500"
                  />
                  <span className="text-sm text-red-500 font-medium">未</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editStatus"
                    checked={editStatus === 'submitted'}
                    onChange={() => setEditStatus('submitted')}
                    className="accent-green-600"
                  />
                  <span className="text-sm text-green-600 font-medium">済</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="editStatus"
                    checked={editStatus === 'absent'}
                    onChange={() => setEditStatus('absent')}
                    className="accent-orange-500"
                  />
                  <span className="text-sm text-orange-500 font-medium">欠席</span>
                </label>
              </div>
            </div>

            {/* 点数（欠席時は非表示） */}
            {editStatus !== 'absent' && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  点数（0〜{test.mode === 50 ? 100 : test.mode === 300 ? 300 : test.mode}）
                </label>
                <input
                  type="number"
                  min={0}
                  max={test.mode === 300 ? 300 : test.mode === 50 ? 100 : test.mode}
                  value={editScore}
                  onChange={(e) => setEditScore(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="点数を入力"
                />
                {test.mode === 50 && editScore.trim() !== '' && (
                  <p className="text-xs text-purple-600 font-medium">
                    → {calcPoints(Number(editScore))} pt
                  </p>
                )}
              </div>
            )}

            {/* 欠席時のメッセージ */}
            {editStatus === 'absent' && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
                欠席として記録します。点数・ポイントは空白になり、ランキングには含まれません。
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {editSaving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={() => setEditTarget(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 開始モーダル */}
      {startModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">
              {startModal.target === 'all' ? '全クラス一括' : startModal.target} を開始
            </h3>

            {!modalScheduleMode ? (
              <div className="space-y-3">
                <button
                  onClick={handleModalImmediateStart}
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 active:scale-95 transition disabled:opacity-50"
                >
                  今すぐ開始
                </button>
                <button
                  onClick={() => setModalScheduleMode(true)}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition"
                >
                  予約開始
                </button>
                <button
                  onClick={() => setStartModal({ open: false, target: 'all' })}
                  className="w-full text-gray-500 py-2 text-sm hover:text-gray-700 transition"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">開始日時を選択</label>
                  <input
                    type="datetime-local"
                    value={modalScheduledAt}
                    onChange={(e) => setModalScheduledAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleModalScheduledStart}
                  disabled={!modalScheduledAt || savingSchedule}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition disabled:opacity-50"
                >
                  {savingSchedule ? '保存中...' : '予約する'}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalScheduleMode(false)}
                    className="flex-1 text-gray-500 border border-gray-200 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
                  >
                    戻る
                  </button>
                  <button
                    onClick={() => setStartModal({ open: false, target: 'all' })}
                    className="flex-1 text-gray-500 border border-gray-200 py-2 rounded-xl text-sm hover:bg-gray-50 transition"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                      <div className="text-gray-800 font-medium leading-relaxed flex-1">
                        {q.question_text.includes('\n') ? (
                          q.question_text.split('\n').map((line, li) => {
                            if (line.includes('(     )')) {
                              const parts = line.split('(     )')
                              return (
                                <p key={li} className="mt-3">
                                  {parts.map((part, pi) => (
                                    <span key={pi}>
                                      {part}
                                      {pi < parts.length - 1 && <span>（　　　）</span>}
                                    </span>
                                  ))}
                                </p>
                              )
                            }
                            return (
                              <p key={li} className="text-gray-500 text-sm mb-1">{line}</p>
                            )
                          })
                        ) : (
                          <p>{q.question_text}</p>
                        )}
                      </div>
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
