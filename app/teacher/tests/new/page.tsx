'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { renderUnderline } from '@/lib/renderUnderline'

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

  // グループごとのアンダーライン状態スタック
  const ulStack: boolean[] = [false]
  const isUl = () => ulStack[ulStack.length - 1]

  // グループを無視すべきRTFメタデータキーワード
  // {\fonttbl}, {\colortbl}, {\stylesheet}, {\info} 等は \* なしでも無視すべき
  const IGNORE_KEYWORDS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info',
    'listtable', 'listoverridetable',
    // \mmathPr は小文字のみ読むパーサーが "mmath" で止まるため小文字版で登録
    'mmath', 'mmathpr',
    'themedata', 'colorschememapping', 'datastore',
    'pnseclvl', 'rsidtbl', 'generator', 'xmlnstbl',
    'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc',
    'wgrffmtfilter',
  ])
  // \* で始まるグループ、またはIGNORE_KEYWORDSを含むグループを無視するスタック
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
      ignoreStack.push(isIgnored()) // 親のignore状態を継承
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
        // \'XX → Shift-JIS バイトを蓄積（flushしない！2バイト文字を結合するため）
        hexBuf.push(parseInt(rtf.slice(i + 1, i + 3), 16))
        i += 3
      } else {
        flushHex()
        if (nc === '\\' || nc === '{' || nc === '}') {
          if (!isIgnored()) result.push(nc); i++
        } else if (nc === '~') {
          if (!isIgnored()) result.push(' '); i++
        } else if (nc === '*') {
          // \* → このグループをメタデータとして無視マーク
          ignoreStack[ignoreStack.length - 1] = true
          i++
        } else {
          let word = ''
          while (i < rtf.length && /[a-z]/.test(rtf[i])) { word += rtf[i]; i++ }
          let param = ''
          while (i < rtf.length && /[-\d]/.test(rtf[i])) { param += rtf[i]; i++ }
          if (i < rtf.length && rtf[i] === ' ') i++
          // メタデータグループの開始キーワードならこのグループを無視マーク
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
  // "① 読者   ② 証拠(者)   ③ 目撃者   ④ 出来事"
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
  // 【A】の登場回数で答えセクション開始を判定（タイトル2回目検出より確実）
  let sectionACount = 0

  type RawQ = {
    num: number
    section: 'A' | 'B' | 'C'
    questionText: string
    englishLine: string
    choices: string[]
  }
  const rawQs: RawQ[] = []

  // 1行に "(1) ③ [p.186,645]　(2) ② [p.186,652]" のように複数ある場合も全部抽出
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
    // タイトル = 最初の行をそのまま使う（フォントテーブル除去後の最初の段落）
    if (!title) {
      title = line.replace(/\s+/g, ' ').trim()
      continue
    }

    // 答えセクション解析
    if (inAnswerKey) {
      extractAnswers(line)
      continue
    }

    // セクション判定
    // 【A】が2回目に現れたら答えセクション開始（最も確実な判定）
    if (line.includes('【A】')) {
      sectionACount++
      if (sectionACount >= 2) { inAnswerKey = true; continue }
      section = 'A'; continue
    }
    if (line.includes('【B】')) { section = 'B'; continue }
    if (line.includes('【C】')) { section = 'C'; continue }
    if (!section) continue

    // 生徒情報行スキップ
    if (line.includes('年') && line.includes('番') && line.includes('名前')) continue

    const last = rawQs[rawQs.length - 1]

    if (section === 'A') {
      // Section A: 問題と選択肢が1行にある場合と別行の場合の両方に対応
      // 例1（1行）: "(1) witness　① 読者　② 証拠(者)　③ 目撃者　④ 出来事"
      // 例2（別行）: "(1) witness" + 次行 "① 読者　② 証拠(者)..."
      const qM = line.match(/^\((\d+)\)\s+([A-Za-z].*)$/)
      if (qM) {
        const rest = qM[2]
        const idx1 = rest.indexOf('①')
        if (idx1 >= 0) {
          // 問題と選択肢が同じ行
          const questionText = rest.slice(0, idx1).trim()
          const choices = parseChoices(rest.slice(idx1))
          rawQs.push({ num: parseInt(qM[1]), section: 'A', questionText, englishLine: '', choices })
        } else {
          // 問題のみの行（選択肢は次行）
          rawQs.push({ num: parseInt(qM[1]), section: 'A', questionText: rest.trim(), englishLine: '', choices: [] })
        }
        continue
      }
      // 別行の選択肢
      if (line.includes('①') && last?.section === 'A' && last.choices.length === 0) {
        last.choices = parseChoices(line)
      }
    }

    if (section === 'B') {
      // 日本語問題行: "(21) 音楽療法は..." or "(21) 1990年代には..."
      // 日本語文字(ひらがな/カタカナ/漢字)を含む行を問題行とみなす
      // 答え合わせ行 "(21) ② [p.186]" はASCIIのみなので除外される
      const qM = line.match(/^\((\d+)\)\s+(.+)$/)
      if (qM
        && /[\u3040-\u9fff]/.test(qM[2])   // ひらがな/カタカナ/漢字を含む
        && !line.includes('①')             // 選択肢行でない
        && !/\(\s{2,}\)/.test(line)         // 英文穴埋め行でない
      ) {
        rawQs.push({ num: parseInt(qM[1]), section: 'B', questionText: qM[2].trim(), englishLine: '', choices: [] })
        continue
      }
      // 英文穴埋め行（スペース2つ以上の括弧）
      if (/\(\s{2,}\)/.test(line) && last?.section === 'B' && !last.englishLine) {
        last.englishLine = line.trim().replace(/\(\s{2,}\)/g, '(     )')
        continue
      }
      // 選択肢行
      if (line.includes('①') && last?.section === 'B') {
        last.choices = parseChoices(line)
      }
    }

    if (section === 'C') {
      // アクセント問題行: "(41) so・phis・ti・cat・ed"
      const qM = line.match(/^\((\d+)\)\s+([A-Za-z].+)$/)
      if (qM) {
        rawQs.push({ num: parseInt(qM[1]), section: 'C', questionText: qM[2].trim(), englishLine: '', choices: [] })
      }
    }
  }

  // QuestionRow[]に変換
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

    // Section C: アクセント
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
  const xlsxRef = useRef<HTMLInputElement>(null)
  const rtfRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<'xlsx' | 'rtf'>('xlsx')
  const [title, setTitle] = useState('')
  const [roundNumber, setRoundNumber] = useState<string>('')
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const [dragging, setDragging] = useState(false)

  // ─── Excel処理 ───────────────────────────────────────────────────────────

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

      // タイトルを自動セット
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
    } else {
      if (!file.name.toLowerCase().endsWith('.rtf')) { setError('.rtf ファイルをドロップしてください'); return }
      await processRtf(file)
    }
  }

  // ─── テスト作成 ───────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!title.trim()) { setError('タイトルを入力してください'); return }
    if (questions.length === 0) { setError('ファイルをアップロードしてください'); return }

    setLoading(true)
    setError('')

    try {
      const mode = questions.length === 300 ? 300 : 50
      const time_limit = mode === 300 ? 1200 : 180
      const pass_score = mode === 300 ? 285 : null
      const roundNum = mode === 50 && roundNumber.trim() !== '' ? parseInt(roundNumber) : null

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

        {/* ファイル種別タブ */}
        <div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setTab('xlsx'); setQuestions([]); setFileName(''); setError(''); setPreview(false) }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'xlsx' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              📊 Excel（300問 / 50問）
            </button>
            <button
              onClick={() => { setTab('rtf'); setQuestions([]); setFileName(''); setError(''); setPreview(false) }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'rtf' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              📄 RTF（50問テスト）
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

          <div
            onClick={() => tab === 'xlsx' ? xlsxRef.current?.click() : rtfRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              dragging
                ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                : 'border-gray-300 hover:border-blue-400'
            }`}
          >
            <div className="text-3xl mb-2">{dragging ? '📂' : tab === 'rtf' ? '📄' : '📊'}</div>
            {fileName ? (
              <p className="text-gray-700 font-medium">{fileName}</p>
            ) : dragging ? (
              <p className="text-blue-500 font-medium">ここで離してください</p>
            ) : (
              <p className="text-gray-400">
                クリックまたは{tab === 'xlsx' ? 'Excelファイル' : 'RTFファイル'}をドラッグ&ドロップ
              </p>
            )}
          </div>
          <input ref={xlsxRef} type="file" accept=".xlsx" onChange={handleXlsxChange} className="hidden" />
          <input ref={rtfRef} type="file" accept=".rtf" onChange={handleRtfChange} className="hidden" />
        </div>

        {/* 50問モード: 第何回 */}
        {mode === 50 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              第何回目のテストか <span className="text-gray-400 text-xs font-normal">（通算ポイントランキング用）</span>
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
