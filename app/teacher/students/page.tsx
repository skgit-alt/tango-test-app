'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Student } from '@/lib/supabase/types'
import * as XLSX from 'xlsx'

type EditForm = {
  name: string
  class_name: string
  seat_number: string
  student_id: string
}

export default function StudentsPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', class_name: '', seat_number: '', student_id: '' })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [resetTarget, setResetTarget] = useState<Student | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('*')
      .order('class_name')
      .order('seat_number')
    if (data) setStudents(data as Student[])
    setLoading(false)
  }

  useEffect(() => { fetchStudents() }, [])

  const filtered = students.filter((s) => {
    if (!searchText) return true
    const q = searchText.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      s.class_name.toLowerCase().includes(q) ||
      s.student_id.toLowerCase().includes(q) ||
      (s.test_name ?? '').toLowerCase().includes(q)
    )
  })

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((s) => next.delete(s.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((s) => next.add(s.id))
        return next
      })
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    const confirmed = confirm(`選択した ${selectedIds.size} 名を削除しますか？\nこの操作は元に戻せません。`)
    if (!confirmed) return

    setDeleting(true)
    setError('')
    try {
      const ids = Array.from(selectedIds)
      const res = await fetch('/api/teacher/delete-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('削除に失敗しました')
      setSuccess(`${ids.length}名を削除しました`)
      setSelectedIds(new Set())
      await fetchStudents()
    } catch (err) {
      console.error(err)
      setError('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  const openReset = (s: Student) => {
    setResetTarget(s)
    setResetPassword('')
    setResetConfirm('')
    setResetError('')
  }

  const handleReset = async () => {
    if (!resetTarget) return
    if (resetPassword.length < 6) { setResetError('パスワードは6文字以上で入力してください'); return }
    if (resetPassword !== resetConfirm) { setResetError('パスワードが一致しません'); return }

    setResetting(true)
    setResetError('')
    try {
      const res = await fetch('/api/teacher/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resetTarget.id, password: resetPassword }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? 'リセットに失敗しました')
      setSuccess(`${resetTarget.name} のパスワードをリセットしました`)
      setResetTarget(null)
      await fetchStudents()
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'リセットに失敗しました')
    } finally {
      setResetting(false)
    }
  }

  const openEdit = (s: Student) => {
    setEditingStudent(s)
    setEditForm({
      name: s.name,
      class_name: s.class_name,
      seat_number: String(s.seat_number),
      student_id: s.student_id,
    })
    setEditError('')
  }

  const handleSave = async () => {
    if (!editingStudent) return
    if (!editForm.name.trim()) { setEditError('名前を入力してください'); return }
    if (!editForm.class_name.trim()) { setEditError('クラスを入力してください'); return }
    if (!editForm.student_id.trim()) { setEditError('IDを入力してください'); return }

    setSaving(true)
    setEditError('')
    const seatNum = parseInt(editForm.seat_number, 10)

    try {
      const { error } = await supabase
        .from('students')
        .update({
          name: editForm.name.trim(),
          class_name: editForm.class_name.trim(),
          seat_number: isNaN(seatNum) ? 0 : seatNum,
          student_id: editForm.student_id.trim(),
        })
        .eq('id', editingStudent.id)

      if (error) throw error
      setSuccess(`${editForm.name.trim()} の情報を更新しました`)
      setEditingStudent(null)
      await fetchStudents()
    } catch (err) {
      console.error(err)
      setEditError('更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')
    setSuccess('')

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

      const studentData = rows.map((row) => {
        const seatRaw = Number(row['seat_number'] ?? row['出席番号'] ?? 0)
        return {
          student_id: String(row['student_id'] ?? row['ID'] ?? '').trim().toLowerCase(),
          name: String(row['name'] ?? row['名前'] ?? '').trim(),
          class_name: String(row['class_name'] ?? row['クラス'] ?? '').trim(),
          seat_number: isNaN(seatRaw) ? 0 : seatRaw,
          password: String(row['password'] ?? row['パスワード'] ?? '').trim(),
        }
      }).filter((r) => r.student_id && r.name && r.password)

      if (studentData.length === 0) {
        setError('有効なデータが見つかりませんでした。列名を確認してください。')
        setUploading(false)
        return
      }

      const res = await fetch('/api/teacher/create-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: studentData }),
      })
      const result = await res.json()

      if (result.errors?.length > 0) {
        const errDetails = result.errors.map((e: { student_id: string; error?: string }) => `${e.student_id}${e.error ? `: ${e.error}` : ''}`).join(' / ')
        setError(`${result.errors.length}件のエラーがありました: ${errDetails}`)
      }
      setSuccess(`${result.successCount}名の生徒を登録しました`)
      await fetchStudents()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDownloadTemplate = () => {
    const rows = [
      { student_id: 'tkd250001', name: '山田 太郎', class_name: 'A', seat_number: 1, password: 'Pass1234' },
      { student_id: 'tkd250002', name: '鈴木 花子', class_name: 'A', seat_number: 2, password: 'Pass5678' },
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, '生徒情報')
    XLSX.writeFile(wb, '生徒情報テンプレート.xlsx')
  }

  const handleDownloadList = () => {
    const rows = students.map((s) => ({
      student_id: s.student_id,
      name: s.name,
      class_name: s.class_name,
      seat_number: s.seat_number,
      test_name: s.test_name ?? '',
      初回設定: s.must_change_password ? '未完了' : '完了',
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, '生徒一覧')
    XLSX.writeFile(wb, '生徒一覧.xlsx')
  }

  return (
    <div className="space-y-6">

      {/* 編集モーダル */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-800">生徒情報を修正</h2>
            <div className="space-y-3">
              {[
                { label: '生徒ID', key: 'student_id', type: 'text', placeholder: 'tkd250001' },
                { label: '名前', key: 'name', type: 'text', placeholder: '山田 太郎' },
                { label: 'クラス', key: 'class_name', type: 'text', placeholder: 'A' },
                { label: '出席番号', key: 'seat_number', type: 'number', placeholder: '1' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <input
                    type={type}
                    value={editForm[key as keyof EditForm]}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>

            {editError && (
              <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{editError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                {saving ? '保存中...' : '保存する'}
              </button>
              <button onClick={() => setEditingStudent(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-semibold hover:bg-gray-200 transition">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* パスワードリセットモーダル */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-800">パスワードリセット</h2>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-medium text-gray-700">{resetTarget.name}</span>（{resetTarget.student_id}）の新しいパスワードを設定します。
              </p>
              <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mt-2">
                リセット後、生徒は次回ログイン時に初回設定画面が表示されます。
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">新しいパスワード</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => { setResetPassword(e.target.value); setResetError('') }}
                  placeholder="6文字以上"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">パスワード（確認）</label>
                <input
                  type="password"
                  value={resetConfirm}
                  onChange={(e) => { setResetConfirm(e.target.value); setResetError('') }}
                  placeholder="もう一度入力"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            {resetError && (
              <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{resetError}</div>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={handleReset} disabled={resetting || !resetPassword || !resetConfirm}
                className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50">
                {resetting ? 'リセット中...' : 'リセットする'}
              </button>
              <button onClick={() => setResetTarget(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-semibold hover:bg-gray-200 transition">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">生徒管理</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
            {uploading ? 'アップロード中...' : 'Excelで一括登録'}
          </button>
          <button onClick={handleDownloadTemplate}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
            テンプレート
          </button>
          <button onClick={handleDownloadList}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
            一覧ダウンロード
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFileUpload} className="hidden" />
        </div>
      </div>

      <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
        必要な列: <span className="font-mono text-gray-600">student_id, name, class_name, seat_number, password</span>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 rounded-xl p-4 text-sm">{success}</div>}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-800">生徒一覧 ({students.length}名)</h2>
            {selectedIds.size > 0 && (
              <button onClick={handleDeleteSelected} disabled={deleting}
                className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-600 transition disabled:opacity-50">
                {deleting ? '削除中...' : `選択した ${selectedIds.size} 名を削除`}
              </button>
            )}
          </div>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="名前・クラス・IDで検索..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            {students.length === 0 ? 'まだ生徒が登録されていません' : '検索結果がありません'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-center w-10">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
                  </th>
                  <th className="px-4 py-3 text-left">クラス</th>
                  <th className="px-4 py-3 text-left">番号</th>
                  <th className="px-4 py-3 text-left">名前</th>
                  <th className="px-4 py-3 text-left">生徒ID</th>
                  <th className="px-4 py-3 text-left">テストネーム</th>
                  <th className="px-4 py-3 text-center">初回設定</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <tr key={s.id} className={`hover:bg-gray-50 ${selectedIds.has(s.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{s.class_name}</td>
                    <td className="px-4 py-3 text-gray-700">{s.seat_number}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.student_id}</td>
                    <td className="px-4 py-3">
                      <span className={s.test_name ? 'text-gray-800' : 'text-gray-400 italic'}>
                        {s.test_name ?? '未設定'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.must_change_password ? (
                        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">未完了</span>
                      ) : (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">完了</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button onClick={() => openEdit(s)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline">
                          修正
                        </button>
                        <button onClick={() => openReset(s)}
                          className="text-orange-500 hover:text-orange-700 text-xs font-medium hover:underline">
                          PW リセット
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
