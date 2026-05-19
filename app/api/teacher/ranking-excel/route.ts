import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calcPointsFromRules, DEFAULT_POINT_RULES, ruleLabel, type PointRule } from '@/lib/supabase/types'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import path from 'path'

// プロジェクト内のフォントを登録
let fontLoaded = false
function ensureFont() {
  if (fontLoaded) return
  fontLoaded = true
  GlobalFonts.registerFromPath(
    path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-VariableFont_wght.ttf'),
    'JpFont'
  )
}

// ─── スタイル定数 ──────────────────────────────────────────────────────────────
const NAVY:    ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E5FA3' } }
const BLUE_H:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E6F5' } }
const GREEN:   ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A6E40' } }
const GOLD:    ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3B0' } }
const SILVER:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
const BRONZE:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFECD2' } }
const EVEN:    ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FF' } }
const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } }
const MED:  Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF666666' } }
const b = (): Partial<ExcelJS.Borders> => ({ top: THIN, left: THIN, bottom: THIN, right: THIN })
const bm = (): Partial<ExcelJS.Borders> => ({ top: MED, left: MED, bottom: MED, right: MED })

function sc(
  cell: ExcelJS.Cell,
  opts: { v?: ExcelJS.CellValue; font?: Partial<ExcelJS.Font>; fill?: ExcelJS.Fill; align?: Partial<ExcelJS.Alignment>; border?: Partial<ExcelJS.Borders> }
) {
  if (opts.v !== undefined) cell.value = opts.v
  if (opts.font)   cell.font = opts.font
  if (opts.fill)   cell.fill = opts.fill
  if (opts.align)  cell.alignment = opts.align
  if (opts.border) cell.border = opts.border
}

const center: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
const left:   Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle' }
const white = (bold = false, size = 12): Partial<ExcelJS.Font> => ({ bold, size, color: { argb: 'FFFFFFFF' } })
const dark  = (bold = false, size = 12): Partial<ExcelJS.Font> => ({ bold, size, color: { argb: 'FF1A1A1A' } })

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET() {
  ensureFont()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: settings } = await admin
    .from('ranking_settings').select('*').eq('id', 1).maybeSingle()
  if (!settings) return NextResponse.json({ error: '集計期間が未設定です' }, { status: 404 })

  const { data: targetTests } = await admin
    .from('tests').select('id, round_number')
    .eq('mode', 50)
    .gte('round_number', settings.from_round)
    .lte('round_number', settings.to_round)
    .not('round_number', 'is', null)

  const testIds = (targetTests ?? []).map((t: { id: string }) => t.id)
  const testRoundMap: Record<string, number> = {}
  for (const t of (targetTests ?? []) as { id: string; round_number: number }[]) testRoundMap[t.id] = t.round_number
  const rounds: number[] = Array.from(new Set((targetTests ?? []).map((t: { round_number: number }) => t.round_number))).sort((a, b) => a - b)

  // ─── 個人ランキング ──────────────────────────────────────────────────────────
  const grouped: Record<string, { name: string; class_name: string; seat_number: number; test_name: string; roundValues: Record<string, number>; total: number }> = {}
  if (testIds.length > 0) {
    const { data: sessions } = await admin
      .from('sessions').select('student_id, test_id, score, students(name, class_name, seat_number, test_name)')
      .in('test_id', testIds).eq('is_submitted', true).not('score', 'is', null)
    const best: Record<string, { score: number; student_id: string; test_id: string; students: unknown }> = {}
    for (const s of (sessions ?? []) as { student_id: string; test_id: string; score: number; students: unknown }[]) {
      const key = `${s.student_id}_${s.test_id}`
      if (!best[key] || s.score > best[key].score) best[key] = s
    }
    for (const s of Object.values(best)) {
      const st = (Array.isArray(s.students) ? s.students[0] : s.students) as { name: string; class_name: string; seat_number: number; test_name: string } | null
      if (!st || !/^[A-Za-z]/.test(st.class_name ?? '')) continue
      const round = testRoundMap[s.test_id]; if (!round) continue
      const rules = (settings.point_rules ?? DEFAULT_POINT_RULES) as PointRule[]
      const value = calcPointsFromRules(s.score, rules)
      if (!grouped[s.student_id]) grouped[s.student_id] = { name: st.name ?? '', class_name: st.class_name ?? '', seat_number: st.seat_number ?? 0, test_name: st.test_name ?? '', roundValues: {}, total: 0 }
      const ex = grouped[s.student_id].roundValues[String(round)] ?? 0
      if (value > ex) { grouped[s.student_id].total += value - ex; grouped[s.student_id].roundValues[String(round)] = value }
    }
  }
  const sorted = Object.entries(grouped).map(([sid, v]) => ({ student_id: sid, ...v })).sort((a, b) => b.total - a.total)
  const ranking: { rank: number; student_id: string; class_name: string; test_name: string; roundValues: Record<string, number>; total: number }[] = []
  const maxRankExcel = settings.max_rank ?? 30
  let rankNum = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].total < sorted[i - 1].total) rankNum = i + 1
    if (rankNum > maxRankExcel) break
    ranking.push({ ...sorted[i], rank: rankNum })
  }

  // ─── クラス別平均点 ──────────────────────────────────────────────────────────
  interface ClassAvg { round: number; classes: Record<string, number> }
  const classAverages: ClassAvg[] = []
  if (testIds.length > 0) {
    const { data: allSessions } = await admin
      .from('sessions').select('student_id, test_id, score, students(class_name)')
      .in('test_id', testIds).eq('is_submitted', true).not('score', 'is', null)
    const bsm: Record<string, { score: number; test_id: string; class_name: string }> = {}
    for (const s of (allSessions ?? []) as { student_id: string; test_id: string; score: number; students: unknown }[]) {
      const st = (Array.isArray(s.students) ? s.students[0] : s.students) as { class_name: string } | null
      const cls = st?.class_name ?? ''; if (!/^[A-Za-z]/.test(cls)) continue
      const key = `${s.student_id}_${s.test_id}`
      if (!bsm[key] || s.score > bsm[key].score) bsm[key] = { score: s.score, test_id: s.test_id, class_name: cls }
    }
    const rcs: Record<number, Record<string, number[]>> = {}
    for (const { score, test_id, class_name } of Object.values(bsm)) {
      const round = testRoundMap[test_id]; if (!round) continue
      if (!rcs[round]) rcs[round] = {}
      if (!rcs[round][class_name]) rcs[round][class_name] = []
      rcs[round][class_name].push(score)
    }
    for (const round of rounds) {
      const classes: Record<string, number> = {}
      for (const [cls, scores] of Object.entries(rcs[round] ?? {}))
        classes[cls] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
      if (Object.keys(classes).length > 0) classAverages.push({ round, classes })
    }
  }

  const latestRound = classAverages.length > 0
    ? Math.max(...classAverages.map(ca => ca.round))
    : settings.from_round

  const allClasses = [...new Set(classAverages.flatMap(ca => Object.keys(ca.classes)))].sort()

  // ─── Excel生成 ────────────────────────────────────────────────────────────────
  const title  = `月曜放課後英単語50問テスト第${settings.from_round}回～${settings.to_round}回 結果（第${latestRound}回まで）`
  const totalCols = 3 + rounds.length + 1

  const wb = new ExcelJS.Workbook()
  wb.creator = 'tango-test-app'
  const ws = wb.addWorksheet('掲示用ランキング')

  ws.pageSetup = {
    paperSize: 9, orientation: 'portrait',
    fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  }

  const roundColW = Math.max(10, Math.floor(52 / Math.max(rounds.length, 1)))
  ws.columns = [
    { width: 8 },
    { width: 10 },
    { width: 24 },
    ...rounds.map(() => ({ width: roundColW })),
    { width: 10 },
  ]

  const LC = totalCols

  // ══ タイトル ══
  const r1 = ws.addRow([title]); r1.height = 44
  ws.mergeCells(1, 1, 1, LC)
  sc(r1.getCell(1), {
    font: { bold: true, size: 15, color: { argb: 'FF1A3A6E' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4FF' } },
    align: center,
  })

  // ══ 副題 ══
  const r2 = ws.addRow(['英単語ターゲット1900']); r2.height = 26
  ws.mergeCells(2, 1, 2, LC)
  sc(r2.getCell(1), {
    font: { bold: false, size: 12, color: { argb: 'FF444444' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4FF' } },
    align: center,
  })

  // ══ クラス別平均点 ══
  const r3 = ws.addRow(['クラス別平均点']); r3.height = 32
  ws.mergeCells(3, 1, 3, LC)
  sc(r3.getCell(1), { font: white(true, 13), fill: NAVY, align: center })

  const r4 = ws.addRow([]); r4.height = 28
  ws.mergeCells(4, 1, 4, 3)
  sc(r4.getCell(1), { v: 'クラス', font: dark(true, 12), fill: BLUE_H, align: center, border: bm() })
  rounds.forEach((rnd, i) => sc(r4.getCell(4 + i), { v: `第${rnd}回点`, font: dark(true, 12), fill: BLUE_H, align: center, border: bm() }))
  sc(r4.getCell(LC), { fill: BLUE_H, border: bm() })

  for (const cls of allClasses) {
    const dr = ws.addRow([]); dr.height = 28
    const rn = dr.number
    ws.mergeCells(rn, 1, rn, 3)
    sc(dr.getCell(1), { v: cls, font: dark(true, 14), align: center, border: b() })
    rounds.forEach((rnd, i) => {
      const ca = classAverages.find(c => c.round === rnd)
      const val = ca?.classes[cls]
      sc(dr.getCell(4 + i), { v: val != null ? val : '－', font: dark(false, 13), align: center, border: b() })
    })
    sc(dr.getCell(LC), { border: b() })
  }

  ws.addRow([]).height = 12

  // ══ ポイント早見表 ══
  const ptSecRow = ws.addRow([]); ptSecRow.height = 32
  ws.mergeCells(ptSecRow.number, 1, ptSecRow.number, LC)
  sc(ptSecRow.getCell(1), { v: 'ポイント早見表', font: white(true, 13), fill: GREEN, align: center })

  const ptRules = ((settings.point_rules ?? DEFAULT_POINT_RULES) as PointRule[])
    .slice()
    .sort((a, b) => b.min - a.min)
  const PT_ITEMS = ptRules.map((r) => ({
    score: ruleLabel(r),
    pt: `${r.points}p`,
  }))
  const N = PT_ITEMS.length
  const PT_W = 1800
  const scoreH = 80
  const ptH = 130
  const PT_H = scoreH + ptH
  const cw = PT_W / N

  const ptCanvas = createCanvas(PT_W, PT_H)
  const ctx = ptCanvas.getContext('2d')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PT_W, PT_H)

  for (let i = 0; i < N; i++) {
    const x = i * cw
    // 点数行（薄緑）
    ctx.fillStyle = '#C8E6C9'
    ctx.fillRect(x, 0, cw, scoreH)
    // ポイント行（白）
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, scoreH, cw, ptH)
    // 点数ラベル
    ctx.fillStyle = '#1B5E20'
    ctx.font = `bold ${Math.round(cw * 0.15)}px JpFont`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(PT_ITEMS[i].score, x + cw / 2, scoreH / 2)
    // ポイント値
    ctx.fillStyle = '#1B5E20'
    ctx.font = `bold ${Math.round(ptH * 0.55)}px JpFont`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(PT_ITEMS[i].pt, x + cw / 2, scoreH + ptH / 2)
  }
  // 縦仕切り線
  ctx.strokeStyle = '#4CAF50'
  ctx.lineWidth = 2
  for (let i = 1; i < N; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, PT_H); ctx.stroke()
  }
  // 横境界線
  ctx.strokeStyle = '#388E3C'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(0, scoreH); ctx.lineTo(PT_W, scoreH); ctx.stroke()
  // 外枠
  ctx.strokeStyle = '#2E7D32'
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, PT_W - 4, PT_H - 4)

  const ptPngBuf = ptCanvas.toBuffer('image/png')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ptImgId = wb.addImage({ buffer: Buffer.from(ptPngBuf) as any, extension: 'png' })
  const ptRow1 = ws.addRow([]); ptRow1.height = 48
  const ptRow2 = ws.addRow([]); ptRow2.height = 56
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.addImage(ptImgId, {
    tl: { col: 0, row: ptRow1.number - 1 } as any,
    br: { col: LC, row: ptRow2.number }    as any,
    editAs: 'oneCell',
  })

  ws.addRow([]).height = 12

  // ══ 個人ランキング ══
  const rSec = ws.addRow([`個人ランキング（上位${maxRankExcel}名）`]); rSec.height = 32
  ws.mergeCells(rSec.number, 1, rSec.number, LC)
  sc(rSec.getCell(1), { font: white(true, 13), fill: NAVY, align: center })

  const rHead = ws.addRow([]); rHead.height = 28
  const rankLabels = ['順位', 'クラス', 'テストネーム', ...rounds.map(r => `第${r}回`), '合計']
  rankLabels.forEach((lbl, i) => sc(rHead.getCell(i + 1), { v: lbl, font: white(true, 12), fill: NAVY, align: center, border: bm() }))

  for (const r of ranking) {
    const dr = ws.addRow([]); dr.height = 20
    const fill = r.rank === 1 ? GOLD : r.rank === 2 ? SILVER : r.rank === 3 ? BRONZE : dr.number % 2 === 0 ? EVEN : undefined
    const bold = r.rank <= 3

    sc(dr.getCell(1), { v: r.rank,       font: dark(bold, 12), align: center, border: b(), ...(fill ? { fill } : {}) })
    sc(dr.getCell(2), { v: r.class_name, font: dark(bold, 12), align: center, border: b(), ...(fill ? { fill } : {}) })
    sc(dr.getCell(3), { v: r.test_name,  font: dark(bold, 12), align: left,   border: b(), ...(fill ? { fill } : {}) })
    rounds.forEach((rnd, i) => {
      const val = r.roundValues[String(rnd)]
      sc(dr.getCell(4 + i), { v: val != null ? val : '－', font: dark(false, 12), align: center, border: b(), ...(fill ? { fill } : {}) })
    })
    sc(dr.getCell(LC), { v: r.total, font: dark(bold, 12), align: center, border: b(), ...(fill ? { fill } : {}) })
  }

  // ─── 出力 ────────────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const filename = encodeURIComponent(title + '.xlsx')
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
}
