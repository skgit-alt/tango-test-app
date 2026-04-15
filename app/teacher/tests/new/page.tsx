'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

interface QuestionRow {
  order_num: number
  question_text: string
  choice1: string
  choice2: string
  choice3: string
  choice4: string
  choice5: string | null
  correct_answer: number
  points: number
}

export default function NewTestPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [dragging, setDragging] = useState(false)

  const processFile = async (file: File) => {
    setFileName(file.name)
    setError('')

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      // header:1 で配列形式で取得（列位置で読み込む）
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

      // 1行目がヘッダーか数字かで判定してスキップ
      const firstRow = allRows[0] as unknown[]
      const hasHeader = firstRow && isNaN(Number(firstRow[0]))
      const dataRows = hasHeader ? allRows.slice(1) : allRows

      const parsed: QuestionRow[] = dataRows
        .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 8)
        .map((row, i) => {
          // A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8
          const c5 = row[6] as string | null
          return {
            order_num: i + 1,
            question_text: String(row[1] ?? ''),
            choice1: String(row[2] ?? ''),
            choice2: String(row[3] ?? ''),
            choice3: String(row[4] ?? ''),
            choice4: String(row[5] ?? ''),
            choice5: (c5 === null || String(c5).trim() === 'None' || String(c5).trim() === '') ? null : String(c5),
            correct_answer: Number(row[7] ?? 1),
            points: Number(row[8] ?? 1),
          }
        })

      if (parsed.length !== 50 && parsed.length !== 300) {
        setError(`問題数が${parsed.length}問です。50問または300問のExcelファイルをアップロードしてください。`)
        setQuestions([])
        return
      }

      setQuestions(parsed)
      setPreview(true)
    } catch (err) {
      console.error(err)
      setError('ファイルの読み込みに失敗しました。Excelファイルを確認してください。')
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.xlsx')) {
      setError('.xlsx ファイルをドロップしてください')
      return
    }
    await processFile(file)
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('タイトルを入力してください')
      return
    }
    if (questions.length === 0) {
      setError('Excelファイルをアップロードしてください')
      return
    }

    setLoading(true)
    setError('')

    try {
      const mode = questions.length === 300 ? 300 : 50
      const time_limit = mode === 300 ? 1200 : 180
      const pass_score = mode === 300 ? 285 : null

      const { data: test, error: testError } = await supabase
        .from('tests')
        .insert({
          title: title.trim(),
          mode,
          status: 'waiting',
          time_limit,
          pass_score,
        })
        .select()
        .single()

      if (testError || !test) throw testError ?? new Error('テスト作成失敗')

      const CHUNK_SIZE = 50
      for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
        const chunk = questions.slice(i, i + CHUNK_SIZE).map((q) => ({
          ...q,
          test_id: test.id,
        }))
        const { error: qError } = await supabase.from('questions').insert(chunk)
        if (qError) throw qError
      }

      router.push(`/teacher/tests/${test.id}`)
    } catch (err) {
      console.error(err)
      setError('テスト作成に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const mode = questions.length === 300 ? 300 : questions.length === 50 ? 50 : null

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <a href="/teacher" className="text-gray-400 hover:text-gray-600 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 className="text-2xl font-bold text-gray-800">新しいテストを作成</h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
        {/* タイトル */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            テストタイトル <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 2024年度 英単語テスト第1回"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Excelアップロード */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            問題ファイル (.xlsx) <span className="text-red-500">*</span>
          </label>
          <div className="text-xs text-gray-400 mb-3">
            必要な列: question_text, choice1, choice2, choice3, choice4, choice5 (任意), correct_answer, points
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              dragging
                ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                : 'border-gray-300 hover:border-blue-400'
            }`}
          >
            <div className="text-3xl mb-2">{dragging ? '📂' : '📊'}</div>
            {fileName ? (
              <p className="text-gray-700 font-medium">{fileName}</p>
            ) : dragging ? (
              <p className="text-blue-500 font-medium">ここで離してください</p>
            ) : (
              <p className="text-gray-400">クリックまたはExcelファイルをドラッグ&ドロップ</p>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* 自動判定結果 */}
        {mode && (
          <div className="bg-blue-50 rounded-xl p-4 space-y-1 text-sm">
            <p className="font-medium text-blue-800">自動設定内容</p>
            <p className="text-blue-700">問題数: {questions.length}問 → <strong>{mode}問モード</strong></p>
            <p className="text-blue-700">制限時間: <strong>{mode === 300 ? '1200秒（20分）' : '180秒（3分）'}</strong></p>
            {mode === 300 && <p className="text-blue-700">合格点: <strong>285点</strong></p>}
          </div>
        )}

        {/* プレビュー */}
        {preview && questions.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              先頭3問プレビュー
            </p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
              {questions.slice(0, 3).map((q, i) => (
                <div key={i} className="border-b border-gray-200 pb-3 last:border-0 last:pb-0">
                  <p className="font-medium text-gray-800">Q{q.order_num}: {q.question_text}</p>
                  <div className="mt-1 text-gray-600 space-y-0.5">
                    <p>① {q.choice1}</p>
                    <p>② {q.choice2}</p>
                    <p>③ {q.choice3}</p>
                    <p>④ {q.choice4}</p>
                    {q.choice5 && <p>⑤ {q.choice5}</p>}
                    <p className="text-green-700 font-medium">正解: {q.correct_answer}番</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !title.trim() || questions.length === 0}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '作成中...' : 'テストを作成する'}
        </button>
      </div>
    </div>
  )
}
