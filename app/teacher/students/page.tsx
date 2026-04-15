'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Student } from '@/lib/supabase/types'
import * as XLSX from 'xlsx'

export default function StudentsPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTestName, setEditTestName] = useState('')
  const [searchText, setSearchText] = useState('')

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

      const upsertData = rows.map((row) => ({
        email: String(row['email'] ?? row['メール'] ?? ''),
        name: String(row['name'] ?? row['名前'] ?? ''),
        class_name: String(row['class_name'] ?? row['クラス'] ?? ''),
        seat_number: Number(row['seat_number'] ?? row['出席番号'] ?? 0),
        test_name: (row['test_name'] ?? row['テストネーム']) ? String(row['test_name'] ?? row['テストネーム']) : null,
      })).filter((r) => r.email && r.name)

      if (upsertData.length === 0) {
        setError('有効なデータが見つかりませんでした。列名を確認してください。')
        return
      }

      const { error: upsertError } = await supabase
        .from('students')
        .upsert(upsertData, { onConflict: 'email' })

      if (upsertError) throw upsertError

      setSuccess(`${upsertData.length}名の生徒情報を登録しました`)
      await fetchStudents()
    } catch (err) {
      console.error(err)
      setError('アップロードに失敗しました')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSaveTestName = async (id: string) => {
    const trimmed = editTestName.trim()
    const { error } = await supabase
      .from('students')
      .update({ test_name: trimmed || null })
      .eq('id', id)

    if (error) {
      setError('更新に失敗しました')
    } else {
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, test_name: trimmed || null } : s))
      )
      setEditingId(null)
    }
  }

  const handleDownload = () => {
    const rows = students.map((s) => ({
      email: s.email,
      name: s.name,
      class_name: s.class_name,
      seat_number: s.seat_number,
      test_name: s.test_name ?? '',
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, '生徒一覧')
    XLSX.writeFile(wb, '生徒一覧.xlsx')
  }

  const handleDownloadTemplate = () => {
    const rows = [
      { email: 'student1@school.ed.jp', name: '山田 太郎', class_name: '2-A', seat_number: 1, test_name: '' },
      { email: 'student2@school.ed.jp', name: '鈴木 花子', class_name: '2-A', seat_number: 2, test_name: '' },
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, '生徒情報')
    XLSX.writeFile(wb, '生徒情報テンプレート.xlsx')
  }

  const filtered = students.filter((s) => {
    if (!searchText) return true
    const q = searchText.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      s.class_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.test_name ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">生徒管理</h1>
        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {uploading ? 'アップロード中...' : 'Excel/CSVで一括登録'}
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
          >
            テンプレート
          </button>
          <button
            onClick={handleDownload}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
          >
            一覧ダウンロード
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" onChange={handleFileUpload} className="hidden" />
        </div>
      </div>

      <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
        必要な列: email, name, class_name, seat_number, test_name (任意)
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 rounded-xl p-4 text-sm">{success}</div>}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">生徒一覧 ({students.length}名)</h2>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="名前・クラスで検索..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
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
                  <th className="px-4 py-3 text-left">クラス</th>
                  <th className="px-4 py-3 text-left">番号</th>
                  <th className="px-4 py-3 text-left">名前</th>
                  <th className="px-4 py-3 text-left">メール</th>
                  <th className="px-4 py-3 text-left">テストネーム</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{s.class_name}</td>
                    <td className="px-4 py-3 text-gray-700">{s.seat_number}</td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.email}</td>
                    <td className="px-4 py-3">
                      {editingId === s.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTestName}
                            onChange={(e) => setEditTestName(e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveTestName(s.id)}
                            className="text-green-600 hover:text-green-800 text-xs font-medium"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <span className={s.test_name ? 'text-gray-800' : 'text-gray-400 italic'}>
                          {s.test_name ?? '未設定'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingId !== s.id && (
                        <button
                          onClick={() => {
                            setEditingId(s.id)
                            setEditTestName(s.test_name ?? '')
                          }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          修正
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
    </div>
  )
}
