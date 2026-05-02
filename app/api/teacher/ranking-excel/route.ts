import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calcPoints } from '@/lib/supabase/types'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E6F5' } }
const SECTION_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E5FA3' } }
const RANK_HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A6FA5' } }
const GOLD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } }
const SILVER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
const BRONZE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }
const EVEN_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7FAFF' } }
const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCCCCCC' } }
const border = (): Partial<ExcelJS.Borders> => ({ top: THIN, left: THIN, bottom: THIN, right: THIN })

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ランキング設定（50問のみ）
  const { data: settings } = await admin
    .from('ranking_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (!settings) {
    return NextResponse.json({ error: '集計期間が設定されていません' }, { status: 404 })
  }

  // 対象テスト（50問モード）
  const { data: targetTests } = await admin
    .from('tests')
    .select('id, round_number, mode')
    .eq('mode', 50)
    .gte('round_number', settings.from_round)
    .lte('round_number', settings.to_round)
    .not('round_number', 'is', null)

  const testIds = (targetTests ?? []).map((t: { id: string }) => t.id)
  const testRoundMap: Record<string, number> = {}
  for (const t of (targetTests ?? []) as { id: string; round_number: number }[]) {
    testRoundMap[t.id] = t.round_number
  }
  const rounds: number[] = Array.from(
    new Set((targetTests ?? []).map((t: { round_number: number }) => t.round_number))
  ).sort((a, b) => a - b)

  // ─── 個人ランキング ──────────────────────────────────────────────────────────
  interface StudentInfo {
    name: string; class_name: string; seat_number: number; test_name: string
    roundValues: Record<string, number>; total: number
  }
  const grouped: Record<string, StudentInfo> = {}

  if (testIds.length > 0) {
    const { data: sessions } = await admin
      .from('sessions')
      .select('student_id, test_id, score, students(name, class_name, seat_number, test_name)')
      .in('test_id', testIds)
      .eq('is_submitted', true)
      .not('score', 'is', null)

    const bestScores: Record<string, { score: number; student_id: string; test_id: string; students: unknown }> = {}
    for (const s of (sessions ?? []) as { student_id: string; test_id: string; score: number; students: unknown }[]) {
      const key = `${s.student_id}_${s.test_id}`
      if (!bestScores[key] || s.score > bestScores[key].score) bestScores[key] = s
    }
    for (const s of Object.values(bestScores)) {
      const st = Array.isArray(s.students)
        ? (s.students as { name: string; class_name: string; seat_number: number; test_name: string }[])[0]
        : s.students as { name: string; class_name: string; seat_number: number; test_name: string } | null
      if (!st) continue
      if (!/^[A-Za-z]/.test(st.class_name ?? '')) continue
      const round = testRoundMap[s.test_id]
      if (!round) continue
      const value = calcPoints(s.score)
      if (!grouped[s.student_id]) {
        grouped[s.student_id] = { name: st.name ?? '', class_name: st.class_name ?? '', seat_number: st.seat_number ?? 0, test_name: st.test_name ?? '', roundValues: {}, total: 0 }
      }
      const existing = grouped[s.student_id].roundValues[String(round)] ?? 0
      if (value > existing) {
        grouped[s.student_id].total += value - existing
        grouped[s.student_id].roundValues[String(round)] = value
      }
    }
  }

  const sorted = Object.entries(grouped)
    .map(([student_id, v]) => ({ student_id, ...v }))
    .sort((a, b) => b.total - a.total)
  const ranking: { rank: number; student_id: string; class_name: string; test_name: string; roundValues: Record<string, number>; total: number }[] = []
  let rankNum = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].total < sorted[i - 1].total) rankNum = i + 1
    if (rankNum > 30) break
    ranking.push({ ...sorted[i], rank: rankNum })
  }

  // ─── クラス別平均点 ──────────────────────────────────────────────────────────
  interface ClassAvg { round: number; classes: Record<string, number> }
  const classAverages: ClassAvg[] = []

  if (testIds.length > 0) {
    const { data: allSessions } = await admin
      .from('sessions')
      .select('student_id, test_id, score, students(class_name)')
      .in('test_id', testIds)
      .eq('is_submitted', true)
      .not('score', 'is', null)

    const bestScoreMap: Record<string, { score: number; test_id: string; class_name: string }> = {}
    for (const s of (allSessions ?? []) as { student_id: string; test_id: string; score: number; students: unknown }[]) {
      const st = Array.isArray(s.students) ? (s.students as { class_name: string }[])[0] : s.students as { class_name: string } | null
      const className = st?.class_name ?? ''
      if (!/^[A-Za-z]/.test(className)) continue
      const key = `${s.student_id}_${s.test_id}`
      if (!bestScoreMap[key] || s.score > bestScoreMap[key].score) {
        bestScoreMap[key] = { score: s.score, test_id: s.test_id, class_name: className }
      }
    }
    const roundClassScores: Record<number, Record<string, number[]>> = {}
    for (const { score, test_id, class_name } of Object.values(bestScoreMap)) {
      const round = testRoundMap[test_id]
      if (!round) continue
      if (!roundClassScores[round]) roundClassScores[round] = {}
      if (!roundClassScores[round][class_name]) roundClassScores[round][class_name] = []
      roundClassScores[round][class_name].push(score)
    }
    for (const round of rounds) {
      const classes: Record<string, number> = {}
      for (const [cls, scores] of Object.entries(roundClassScores[round] ?? {})) {
        classes[cls] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      }
      classAverages.push({ round, classes })
    }
  }

  // ─── Excel生成 ────────────────────────────────────────────────────────────────
  const latestRound = rounds.length > 0 ? Math.max(...rounds) : settings.to_round
  const title = `月曜放課後英単語50問テスト第${settings.from_round}回～${settings.to_round}回 結果（第${latestRound}回まで）`
  const allClasses = [...new Set(classAverages.flatMap(ca => Object.keys(ca.classes)))].sort()

  // 列構成: 順位(1) | クラス(2) | テストネーム(3) | 第N回...(4~) | 合計(last)
  const totalCols = 3 + rounds.length + 1

  const wb = new ExcelJS.Workbook()
  wb.creator = 'tango-test-app'
  const ws = wb.addWorksheet('掲示用ランキング')

  // 印刷設定（A4縦・1ページに収める）
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 },
  }

  // 列幅
  ws.columns = [
    { width: 5 },   // 順位
    { width: 7 },   // クラス
    { width: 14 },  // テストネーム
    ...rounds.map(() => ({ width: 8 })),
    { width: 7 },   // 合計
  ]

  const lastCol = totalCols // ExcelJS は 1始まり

  // ─ Row 1: タイトル ─
  const titleRow = ws.addRow([title])
  ws.mergeCells(1, 1, 1, lastCol)
  titleRow.height = 28
  applyCell(titleRow.getCell(1), {
    font: { bold: true, size: 13, color: { argb: 'FF1A1A1A' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4FF' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  })

  // ─ Row 2: 空行 ─
  ws.addRow([]).height = 6

  // ─ Row 3: クラス別平均点 セクションヘッダー ─
  const avgSecRow = ws.addRow(['クラス別平均点'])
  ws.mergeCells(3, 1, 3, lastCol)
  avgSecRow.height = 20
  applyCell(avgSecRow.getCell(1), {
    font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
    fill: SECTION_FILL,
    alignment: { horizontal: 'center', vertical: 'middle' },
  })

  // ─ Row 4: クラス別平均点 列ヘッダー ─
  const avgHeaders = ['', '', 'クラス', ...rounds.map(r => `第${r}回点`), '']
  const avgHeadRow = ws.addRow(avgHeaders)
  avgHeadRow.height = 18
  ws.mergeCells(4, 1, 4, 3) // A-C merge for "クラス"
  applyCell(avgHeadRow.getCell(1), {
    font: { bold: true, size: 10 }, fill: HEADER_FILL,
    alignment: { horizontal: 'center', vertical: 'middle' }, border: border(),
  })
  for (let i = 0; i < rounds.length; i++) {
    applyCell(avgHeadRow.getCell(4 + i), {
      font: { bold: true, size: 10 }, fill: HEADER_FILL,
      alignment: { horizontal: 'center', vertical: 'middle' }, border: border(),
    })
  }
  // 合計列は空（平均表）
  applyCell(avgHeadRow.getCell(lastCol), { fill: HEADER_FILL, border: border() })

  // ─ クラス別データ行 ─
  for (const cls of allClasses) {
    const avgRowData = ['', '', cls, ...rounds.map(r => {
      const ca = classAverages.find(c => c.round === r)
      return ca?.classes[cls] ?? ''
    }), '']
    const avgDataRow = ws.addRow(avgRowData)
    avgDataRow.height = 16
    const rn = avgDataRow.number
    ws.mergeCells(rn, 1, rn, 3)
    applyCell(avgDataRow.getCell(1), {
      font: { bold: true, size: 10 },
      alignment: { horizontal: 'center', vertical: 'middle' }, border: border(),
    })
    for (let i = 0; i < rounds.length; i++) {
      applyCell(avgDataRow.getCell(4 + i), {
        font: { size: 10 },
        alignment: { horizontal: 'center', vertical: 'middle' }, border: border(),
      })
    }
    applyCell(avgDataRow.getCell(lastCol), { border: border() })
  }

  // ─ 空行 ─
  ws.addRow([]).height = 8

  // ─ 個人ランキング セクションヘッダー ─
  const rankSecRowNum = ws.rowCount + 1
  const rankSecRow = ws.addRow(['個人ランキング（上位30名）'])
  ws.mergeCells(rankSecRowNum, 1, rankSecRowNum, lastCol)
  rankSecRow.height = 20
  applyCell(rankSecRow.getCell(1), {
    font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
    fill: RANK_HEADER_FILL,
    alignment: { horizontal: 'center', vertical: 'middle' },
  })

  // ─ ランキング列ヘッダー ─
  const rankHeadRow = ws.addRow([
    '順位', 'クラス', 'テストネーム',
    ...rounds.map(r => `第${r}回`),
    '合計',
  ])
  rankHeadRow.height = 18
  rankHeadRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum > lastCol) return
    applyCell(cell, {
      font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
      fill: RANK_HEADER_FILL,
      alignment: { horizontal: 'center', vertical: 'middle' }, border: border(),
    })
  })

  // ─ ランキングデータ行 ─
  for (const r of ranking) {
    const rowVals = [
      r.rank, r.class_name, r.test_name,
      ...rounds.map(rnd => r.roundValues[String(rnd)] != null ? r.roundValues[String(rnd)] : '-'),
      r.total,
    ]
    const dataRow = ws.addRow(rowVals)
    dataRow.height = 15

    const rowFill =
      r.rank === 1 ? GOLD_FILL :
      r.rank === 2 ? SILVER_FILL :
      r.rank === 3 ? BRONZE_FILL :
      dataRow.number % 2 === 0 ? EVEN_FILL : undefined

    dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum > lastCol) return
      const opts: Parameters<typeof applyCell>[1] = {
        font: { size: 10 },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: border(),
      }
      if (rowFill) opts.fill = rowFill
      if (colNum === 3) opts.alignment = { horizontal: 'left', vertical: 'middle' } // テストネームは左寄せ
      if (colNum === 1 && r.rank <= 3) opts.font = { bold: true, size: 10 }
      applyCell(cell, opts)
    })
  }

  // ─ 出力 ─
  const buffer = await wb.xlsx.writeBuffer()
  const filename = encodeURIComponent(title + '.xlsx')

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
}

// ─── セルスタイル適用ヘルパー ─────────────────────────────────────────────────
function applyCell(
  cell: ExcelJS.Cell,
  opts: {
    font?: Partial<ExcelJS.Font>
    fill?: ExcelJS.Fill
    alignment?: Partial<ExcelJS.Alignment>
    border?: Partial<ExcelJS.Borders>
  }
) {
  if (opts.font) cell.font = opts.font
  if (opts.fill) cell.fill = opts.fill
  if (opts.alignment) cell.alignment = opts.alignment
  if (opts.border) cell.border = opts.border
}
