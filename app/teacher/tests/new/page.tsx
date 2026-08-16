'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { renderUnderline } from '@/lib/renderUnderline'

// ─── Wordファイル（.docx）パーサー ──────────────────────────────────────────

async function parseDocxToQuestions(buffer: ArrayBuffer): Promise<{ title: string; questions: QuestionRow[] }> {
  const mammoth = (await import('mammoth')).default
  const { value: rawText } = await mammoth.extractRawText({ arrayBuffer: buffer })

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  let title = ''
  let section: 'A' | 'B' | null = null
  let inAnswerKey = false
  let sectionACount = 0
  const answers: Record<number, number> = {}

  type RawQ = { num: number; questionText: string; choices: string[] }
  const rawQs: RawQ[] = []

  for (const line of lines) {
    if (!title) {
      if (!line.match(/^\/\s*\d/)) title = line
      continue
    }
    if (line.match(/^\/\s*\d+\s*点?$/)) continue

    if (line.includes('【A】')) {
      sectionACount++
      if (sectionACount >= 2) { inAnswerKey = true; continue }
      section = 'A'; continue
    }
    if (line.includes('【B】')) {
      if (!inAnswerKey) section = 'B'
      continue
    }

    if (line.includes('合う適切な') || line.includes('選びなさい')) continue

    if (inAnswerKey) {
      const re = /（(\d+)）\s*([①②③④⑤])/g
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        answers[parseInt(m[1])] = '①②③④⑤'.indexOf(m[2]) + 1
      }
      continue
    }

    if (!section) continue

    const qMatch = line.match(/^\((\d+)\)\s+(.+?)(?:\[p\.[^\]]+\])?\s*$/)
    if (qMatch) {
      rawQs.push({
        num: parseInt(qMatch[1]),
        questionText: qMatch[2].replace(/\[p\.[^\]]+\]/g, '').trim(),
        choices: [],
      })
      continue
    }

    const last = rawQs[rawQs.length - 1]
    if (last && last.choices.length === 0 && line.includes('①')) {
      last.choices = line.split(/[①②③④⑤]/).map(s => s.trim()).filter(s => s.length > 0)
    }
  }

  const questions: QuestionRow[] = rawQs.map(rq => ({
    order_num: rq.num,
    question_text: rq.questionText,
    choice1: rq.choices[0] ?? '',
    choice2: rq.choices[1] ?? '',
    choice3: rq.choices[2] ?? '',
    choice4: rq.choices[3] ?? '',
    choice5: rq.choices[4] ?? null,
    correct_answer: answers[rq.num] ?? 1,
    points: 1,
  }))

  return { title, questions }
}

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

// ─── RTFパーサー ────────────────────────────────────────────────────────────

function rtfToPlainText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let rtf = ''
  for (const b of bytes) rtf += String.fromCharCode(b)

  const result: string[] = []
  const hexBuf: number[] = []
  let i = 0

  const ulStack: boolean[] = [false]
  const isUl = () => ulStack[ulStack.length - 1]

  const IGNORE_KEYWORDS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info',
    'listtable', 'listoverridetable',
    'mmath', 'mmathpr',
    'themedata', 'colorschememapping', 'datastore',
    'pnseclvl', 'rsidtbl', 'generator', 'xmlnstbl',
    'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc',
    'wgrffmtfilter',
  ])
  const ignoreStack: boolean[] = [false]
  const isIgnored = () => ignoreStack[ignoreStack.length - 1]

  const flushHex = () => {
    if (!hexBuf.length) return
    if (!isIgnored()) {
      try {
        const decoded = new TextDecoder('shift-jis').decode(new Uint8Array(hexBuf))
        result.push(isUl() ? `【${decoded}】` : decoded)
      } catch {
        result.push('?')
      }
    }
    hexBuf.length = 0
  }

  while (i < rtf.length) {
    const c = rtf[i]
    if (c === '{') {
      flushHex()
      ulStack.push(isUl())
      ignoreStack.push(isIgnored())
      i++; continue
    }
    if (c === '}') {
      flushHex()
      ulStack.pop()
      ignoreStack.pop()
      i++; continue
    }
    if (c === '\\') {
      i++
      if (i >= rtf.length) break
      const nc = rtf[i]
      if (nc === "'") {
        hexBuf.push(parseInt(rtf.slice(i + 1, i + 3), 16))
        i += 3
      } else {
        flushHex()
        if (nc === '\\' || nc === '{' || nc === '}') {
          if (!isIgnored()) result.push(nc); i++
        } else if (nc === '~') {
          if (!isIgnored()) result.push(' '); i++
        } else if (nc === '*') {
          ignoreStack[ignoreStack.length - 1] = true
          i++
        } else {
          let word = ''
          while (i < rtf.length && /[a-z]/.test(rtf[i])) { word += rtf[i]; i++ }
          let param = ''
          while (i < rtf.length && /[-\d]/.test(rtf[i])) { param += rtf[i]; i++ }
          if (i < rtf.length && rtf[i] === ' ') i++
          if (IGNORE_KEYWORDS.has(word)) {
            ignoreStack[ignoreStack.length - 1] = true
          } else if (!isIgnored()) {
            if (word === 'par' || word === 'line') result.push('\n')
            else if (word === 'ul' && param !== '0') ulStack[ulStack.length - 1] = true
            else if (word === 'ul' && param === '0') ulStack[ulStack.length - 1] = false
            else if (word === 'ulnone') ulStack[ulStack.length - 1] = false
          }
        }
      }
      continue
    }
    if (c === '\r' || c === '\n') { i++; continue }
    flushHex()
    if (!isIgnored()) result.push(c)
    i++
  }
  flushHex()
  return result.join('')
}


function parseChoices(line: string): string[] {
  return line
    .split(/[①②③④]/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function parseRtfToQuestions(buffer: ArrayBuffer): { title: string; questions: QuestionRow[] } {
  const text = rtfToPlainText(buffer)
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  let title = ''
  let inAnswerKey = false
  let section: 'A' | 'B' | 'C' | null = null
  const answers: Record<number, number> = {}
  let sectionACount = 0

  type RawQ = {
    num: number
    section: 'A' | 'B' | 'C'
    questionText: string
    englishLine: string
    choices: string[]
  }
  const rawQs: RawQ[] = []

  const extractAnswers = (line: string) => {
    const re = /\((\d+)\)\s*([①②③④⑤\d])/g
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const num = parseInt(m[1])
      const ch = m[2]
      const idx = '①②③④⑤'.indexOf(ch)
      answers[num] = idx >= 0 ? idx + 1 : parseInt(ch)
    }
  }

  for (const line of lines) {
    if (!title) {
      title = line.replace(/\s+/g, ' ').trim()
      continue
    }

    if (inAnswerKey) {
      extractAnswers(line)
      continue
    }

    if (line.includes('【A】')) {
      sectionACount++
      if (sectionACount >= 2) { inAnswerKey = true; continue }
      section = 'A'; continue
    }
    if (line.includes('【B】')) { section = 'B'; continue }
    if (line.includes('【C】')) { section = 'C'; continue }
    if (!section) continue

    if (line.includes('年') && line.includes('番') && line.includes('名前')) continue

    const last = rawQs[rawQs.length - 1]

    if (section === 'A') {
      const qM = line.match(/^\((\d+)\)\s+([A-Za-z].*)$/)
      if (qM) {
        const rest = qM[2]
        const idx1 = rest.indexOf('①')
        if (idx1 >= 0) {
          const questionText = rest.slice(0, idx1).trim()
          const choices = parseChoices(rest.slice(idx1))
          rawQs.push({ num: parseInt(qM[1]), section: 'A', questionText, englishLine: '', choices })
        } else {
          rawQs.push({ num: parseInt(qM[1]), section: 'A', questionText: rest.trim(), englishLine: '', choices: [] })
        }
        continue
      }
      if (line.includes('①') && last?.section === 'A' && last.choices.length === 0) {
        last.choices = parseChoices(line)
      }
    }

    if (section === 'B') {
      const qM = line.match(/^\((\d+)\)\s+(.+)$/)
      if (qM
        && /[぀-鿿]/.test(qM[2])
        && !line.includes('①')
        && !/\(\s{2,}\)/.test(line)
      ) {
        rawQs.push({ num: parseInt(qM[1]), section: 'B', questionText: qM[2].trim(), englishLine: '', choices: [] })
        continue
      }
      if (/\(\s{2,}\)/.test(line) && last?.section === 'B' && !last.englishLine) {
        last.englishLine = line.trim().replace(/\(\s{2,}\)/g, '(     )')
        continue
      }
      if (line.includes('①') && last?.section === 'B') {
        last.choices = parseChoices(line)
      }
    }

    if (section === 'C') {
      const qM = line.match(/^\((\d+)\)\s+([A-Za-z].+)$/)
      if (qM) {
        rawQs.push({ num: parseInt(qM[1]), section: 'C', questionText: qM[2].trim(), englishLine: '', choices: [] })
      }
    }
  }

  const questions: QuestionRow[] = rawQs.map(rq => {
    const ans = answers[rq.num] ?? 1

    if (rq.section === 'A') {
      return {
        order_num: rq.num,
        question_text: rq.questionText,
        choice1: rq.choices[0] ?? '',
        choice2: rq.choices[1] ?? '',
        choice3: rq.choices[2] ?? '',
        choice4: rq.choices[3] ?? '',
        choice5: null,
        correct_answer: ans,
        points: 2,
      }
    }

    if (rq.section === 'B') {
      const qText = rq.englishLine
        ? `${rq.questionText}\n${rq.englishLine}`
        : rq.questionText
      return {
        order_num: rq.num,
        question_text: qText,
        choice1: rq.choices[0] ?? '',
        choice2: rq.choices[1] ?? '',
        choice3: rq.choices[2] ?? '',
        choice4: rq.choices[3] ?? '',
        choice5: null,
        correct_answer: ans,
        points: 2,
      }
    }

    const syllables = rq.questionText.split('・')
    const n = syllables.length
    return {
      order_num: rq.num,
      question_text: rq.questionText,
      choice1: '第1音節',
      choice2: '第2音節',
      choice3: n >= 3 ? '第3音節' : '',
      choice4: n >= 4 ? '第4音節' : '',
      choice5: n >= 5 ? '第5音節' : null,
      correct_answer: ans,
      points: 2,
    }
  })

  return { title, questions }
}

// ─── メインコンポーネント ────────────────────────────────────────────────────

export default function NewTestPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetch('/api/teacher/me')
      .then(r => r.json())
      .then(d => { if (d.role !== 'admin') router.push('/teacher') })
      .catch(() => router.push('/teacher'))
  }, [router])
  const xlsxRef = useRef<HTMLInputElement>(null)
  const rtfRef = useRef<HTMLInputElement>(null)
  const docxRef = useRef<HTMLInputElement>(null)
  const xlsx600Ref = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<'xlsx' | 'rtf' | 'docx' | 'xlsx600'>('xlsx')
  const [customTimeLimitMin, setCustomTimeLimitMin] = useState('2')
  const [customTimeLimitSec, setCustomTimeLimitSec] = useState('0')
  const [title, setTitle] = useState('')
  const [roundNumber, setRoundNumber] = useState<string>('')
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [dragging, setDragging] = useState(false)

  // ─── Excel（300問 / 50問）処理 ─────────────────────────────────────────────

  const processXlsx = async (file: File) => {
    setFileName(file.name)
    setError('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

      const firstRow = allRows[0] as unknown[]
      const hasHeader = firstRow && isNaN(Number(firstRow[0]))
      const dataRows = hasHeader ? allRows.slice(1) : allRows

      const parsed: QuestionRow[] = dataRows
        .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 8)
        .map((row, i) => {
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
        setError(`問題数が${parsed.length}問です。50問・300問のExcelファイルをアップロードしてください。`)
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

  // ─── Excel（600問）処理 ────────────────────────────────────────────────────
  // 列: No. | 問題 | 選択肢１〜４ | 選択肢５(任意) | 正答 | 配点 | 単語番号(無視)

  const processXlsx600 = async (file: File) => {
    setFileName(file.name)
    setError('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

      const firstRow = allRows[0] as unknown[]
      const hasHeader = firstRow && isNaN(Number(firstRow[0]))
      const dataRows = hasHeader ? allRows.slice(1) : allRows

      const parsed: QuestionRow[] = dataRows
        .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 8)
        .map((row, i) => {
          const c5 = row[6] as string | null
          const trim = (v: unknown) => String(v ?? '').trim()
          return {
            order_num: i + 1,
            question_text: trim(row[1]),
            choice1: trim(row[2]),
            choice2: trim(row[3]),
            choice3: trim(row[4]),
            choice4: trim(row[5]),
            choice5: (c5 === null || trim(c5) === 'None' || trim(c5) === '') ? null : trim(c5),
            correct_answer: Number(row[7] ?? 1),
            points: Number(row[8] ?? 1),
          }
        })

      if (parsed.length !== 600) {
        setError(`問題数が${parsed.length}問です。600問のExcelファイルをアップロードしてください。`)
        setQuestions([])
        return
      }

      // タイトルが未入力ならファイル名から自動セット（拡張子を除去）
      if (!title.trim()) {
        setTitle(file.name.replace(/\.xlsx$/i, ''))
      }

      setQuestions(parsed)
      setPreview(true)
    } catch (err) {
      console.error(err)
      setError('ファイルの読み込みに失敗しました。Excelファイルを確認してください。')
    }
  }

  // ─── Word（.docx）処理 ───────────────────────────────────────────────────

  const processDocx = async (file: File) => {
    setFileName(file.name)
    setError('')
    try {
      const buffer = await file.arrayBuffer()
      const { title: parsedTitle, questions: parsed } = await parseDocxToQuestions(buffer)
      if (parsed.length === 0) {
        setError('問題が読み取れませんでした。Wordファイルの形式を確認してください。')
        return
      }
      if (parsedTitle) setTitle(parsedTitle)
      setQuestions(parsed)
      setPreview(true)
    } catch (err) {
      console.error(err)
      setError('Wordファイルの読み込みに失敗しました。')
    }
  }

  // ─── RTF処理 ─────────────────────────────────────────────────────────────

  const processRtf = async (file: File) => {
    setFileName(file.name)
    setError('')
    try {
      const buffer = await file.arrayBuffer()
      const { title: parsedTitle, questions: parsed } = parseRtfToQuestions(buffer)

      if (parsed.length !== 50) {
        setError(`問題数が${parsed.length}問です。50問のRTFファイルをアップロードしてください。`)
        setQuestions([])
        return
      }

      if (parsedTitle) setTitle(parsedTitle)
      setQuestions(parsed)
      setPreview(true)
    } catch (err) {
      console.error(err)
      setError('RTFファイルの読み込みに失敗しました。')
    }
  }

  // ─── ファイル入力ハンドラ ─────────────────────────────────────────────────

  const handleXlsxChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await processXlsx(file)
  }

  const handleRtfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await processRtf(file)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragging(false) }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (tab === 'xlsx') {
      if (!file.name.endsWith('.xlsx')) { setError('.xlsx ファイルをドロップしてください'); return }
      await processXlsx(file)
    } else if (tab === 'xlsx600') {
      if (!file.name.endsWith('.xlsx')) { setError('.xlsx ファイルをドロップしてください'); return }
      await processXlsx600(file)
    } else if (tab === 'rtf') {
      if (!file.name.toLowerCase().endsWith('.rtf')) { setError('.rtf ファイルをドロップしてください'); return }
      await processRtf(file)
    } else {
      if (!file.name.toLowerCase().endsWith('.docx')) { setError('.docx ファイルをドロップしてください'); return }
      await processDocx(file)
    }
  }

  // ─── タブ切り替え ─────────────────────────────────────────────────────────

  const switchTab = (next: typeof tab) => {
    setTab(next)
    setQuestions([])
    setFileName('')
    setError('')
    setPreview(false)
  }

  // ─── テスト作成 ───────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!title.trim()) { setError('タイトルを入力してください'); return }
    if (questions.length === 0) { setError('ファイルをアップロードしてください'); return }

    setLoading(true)
    setError('')

    try {
      const mode = questions.length === 600 ? 600
        : questions.length === 300 ? 300
        : questions.length === 50 ? 50
        : questions.length
      const time_limit = mode === 600 ? 2100
        : mode === 300 ? 1020
        : mode === 50 ? 185
        : (parseInt(customTimeLimitMin) || 0) * 60 + (parseInt(customTimeLimitSec) || 0) || 120
      const pass_score = mode === 600 ? 570 : mode === 300 ? 285 : null
      const roundNum = mode !== 300 && mode !== 600 && roundNumber.trim() !== '' ? parseInt(roundNumber) : null

      const { data: test, error: testError } = await supabase
        .from('tests')
        .insert({ title: title.trim(), mode, status: 'waiting', time_limit, pass_score, round_number: roundNum })
        .select()
        .single()

      if (testError || !test) throw testError ?? new Error('テスト作成失敗')

      const CHUNK_SIZE = 50
      for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
        const chunk = questions.slice(i, i + CHUNK_SIZE).map(q => ({ ...q, test_id: test.id }))
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

  const mode = questions.length === 600 ? 600
    : questions.length === 300 ? 300
    : questions.length === 50 ? 50
    : null

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

        {/* ファイル種別タブ */}
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => switchTab('xlsx')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'xlsx' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              📊 Excel（300問 / 50問）
            </button>
            <button
              onClick={() => switchTab('rtf')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'rtf' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              📄 RTF（Ⅱ類50問テスト）
            </button>
            <button
              onClick={() => switchTab('docx')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'docx' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              📝 Word（.docx）
            </button>
            <button
              onClick={() => switchTab('xlsx600')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'xlsx600' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              📘 600問テスト
            </button>
          </div>

          {tab === 'xlsx' && (
            <p className="text-xs text-gray-400 mb-3">
              必要な列: question_text, choice1〜4, choice5(任意), correct_answer, points
            </p>
          )}
          {tab === 'rtf' && (
            <p className="text-xs text-gray-400 mb-3">
              【A】英語→日本語 / 【B】英文穴埋め / 【C】アクセント の形式のRTFファイル。タイトルと答えを自動取得します。
            </p>
          )}
          {tab === 'docx' && (
            <p className="text-xs text-gray-400 mb-3">
              【A】日本語→英語 / 【B】英語→日本語 の形式のWordファイル。タイトルと答えを自動取得します。
            </p>
          )}
          {tab === 'xlsx600' && (
            <p className="text-xs text-gray-400 mb-3">
              600問テスト用Excelファイル（A〜D組対象・35分・合格570点）
            </p>
          )}

          <div
            onClick={() => {
              if (tab === 'xlsx') xlsxRef.current?.click()
              else if (tab === 'rtf') rtfRef.current?.click()
              else if (tab === 'docx') docxRef.current?.click()
              else xlsx600Ref.current?.click()
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              dragging
                ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                : 'border-gray-300 hover:border-blue-400'
            }`}
          >
            <div className="text-3xl mb-2">
              {dragging ? '📂' : tab === 'rtf' ? '📄' : tab === 'docx' ? '📝' : tab === 'xlsx600' ? '📘' : '📊'}
            </div>
            {fileName ? (
              <p className="text-gray-700 font-medium">{fileName}</p>
            ) : dragging ? (
              <p className="text-blue-500 font-medium">ここで離してください</p>
            ) : (
              <p className="text-gray-400">
                クリックまたは
                {tab === 'docx' ? 'Wordファイル（.docx）'
                  : tab === 'rtf' ? 'RTFファイル'
                  : 'Excelファイル'}
                をドラッグ&ドロップ
              </p>
            )}
          </div>
          <input ref={xlsxRef} type="file" accept=".xlsx" onChange={handleXlsxChange} className="hidden" />
          <input ref={rtfRef} type="file" accept=".rtf" onChange={handleRtfChange} className="hidden" />
          <input ref={docxRef} type="file" accept=".docx" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await processDocx(f) }} className="hidden" />
          <input ref={xlsx600Ref} type="file" accept=".xlsx" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await processXlsx600(f) }} className="hidden" />
        </div>

        {/* 300問・600問以外: 第何回 */}
        {(mode === 50 || (mode === null && questions.length > 0)) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              第何回目のテストか <span className="text-gray-400 text-xs font-normal">（ランキング用）</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 text-sm">第</span>
              <input
                type="number"
                min={1}
                value={roundNumber}
                onChange={(e) => setRoundNumber(e.target.value)}
                placeholder="例: 3"
                className="w-24 border border-gray-300 rounded-xl px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-600 text-sm">回</span>
            </div>
          </div>
        )}

        {/* docxの場合：制限時間を手動入力 */}
        {tab === 'docx' && questions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">制限時間</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={180} value={customTimeLimitMin}
                onChange={(e) => setCustomTimeLimitMin(e.target.value)}
                className="w-16 border border-gray-300 rounded-xl px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-600 text-sm">分</span>
              <input
                type="number" min={0} max={59} value={customTimeLimitSec}
                onChange={(e) => setCustomTimeLimitSec(e.target.value)}
                className="w-16 border border-gray-300 rounded-xl px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-600 text-sm">秒</span>
            </div>
          </div>
        )}

        {/* 自動判定結果 */}
        {mode && (
          <div className="bg-blue-50 rounded-xl p-4 space-y-1 text-sm">
            <p className="font-medium text-blue-800">自動設定内容</p>
            <p className="text-blue-700">問題数: <strong>{questions.length}問</strong></p>
            {mode === 600 && <><p className="text-blue-700">制限時間: <strong>2100秒（35分）</strong></p><p className="text-blue-700">合格点: <strong>570点</strong></p></>}
            {mode === 300 && <><p className="text-blue-700">制限時間: <strong>1020秒（17分）</strong></p><p className="text-blue-700">合格点: <strong>285点</strong></p></>}
            {mode === 50 && <p className="text-blue-700">制限時間: <strong>185秒（3分5秒）</strong></p>}
            {mode !== 50 && mode !== 300 && mode !== 600 && (
              <p className="text-blue-700">制限時間: <strong>{(parseInt(customTimeLimitMin)||0)}分{(parseInt(customTimeLimitSec)||0)}秒</strong>（上で変更可）</p>
            )}
          </div>
        )}

        {/* プレビュー */}
        {preview && questions.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">先頭3問プレビュー</p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
              {questions.slice(0, 3).map((q, i) => (
                <div key={i} className="border-b border-gray-200 pb-3 last:border-0 last:pb-0">
                  <p className="font-medium text-gray-800">
                    Q{q.order_num}: {q.question_text.split('\n').map((line, li) => (
                      <span key={li} className={li > 0 ? 'block' : ''}>{renderUnderline(line)}</span>
                    ))}
                  </p>
                  <div className="mt-1 text-gray-600 space-y-0.5">
                    <p>① {q.choice1}</p>
                    <p>② {q.choice2}</p>
                    <p>③ {q.choice3}</p>
                    {q.choice4 && <p>④ {q.choice4}</p>}
                    {q.choice5 && <p>⑤ {q.choice5}</p>}
                    <p className="text-green-700 font-medium">正解: {q.correct_answer}番</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">{error}</div>
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
