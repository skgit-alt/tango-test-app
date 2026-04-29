import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calcPoints } from '@/lib/supabase/types'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mode = req.nextUrl.searchParams.get('mode') // '50', '20', or '300'
  if (mode !== '50' && mode !== '20' && mode !== '300') {
    return NextResponse.json({ error: 'mode must be 50, 20, or 300' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 生徒一覧（クラス・出席番号順）
  const { data: allStudents } = await admin
    .from('students')
    .select('id, name, class_name, seat_number')
    .order('class_name')
    .order('seat_number')

  // クラスフィルタ
  // 50問: 英字始まりのクラス（A～D組）のみ
  // 20問: 数字始まりのクラス（1～6組）のみ
  // 300問: 全生徒
  const students = (allStudents ?? []).filter((s) => {
    const c = s.class_name ?? ''
    if (mode === '50') return /^[A-Za-z]/.test(c)
    if (mode === '20') return /^\d/.test(c)
    return true // 300問は全員
  })

  // テスト一覧（publishedのみ・開始日順）
  let testsQuery = admin
    .from('tests')
    .select('id, title, opened_at, created_at, round_number')
    .eq('status', 'published')
    .order('opened_at', { ascending: true, nullsFirst: false })

  if (mode === '50') {
    testsQuery = testsQuery.eq('mode', 50)
  } else if (mode === '20') {
    // 20問テストは mode が 50 でも 300 でもないもの
    testsQuery = testsQuery.neq('mode', 50).neq('mode', 300)
  } else {
    testsQuery = testsQuery.eq('mode', 300)
  }

  const { data: tests } = await testsQuery

  if (!students || students.length === 0 || !tests || tests.length === 0) {
    return NextResponse.json({ error: 'データがありません' }, { status: 404 })
  }

  // セッションを取得（正式受験のみ・練習・欠席除外）
  const { data: sessions } = await admin
    .from('sessions')
    .select('student_id, test_id, score')
    .in('test_id', tests.map((t) => t.id))
    .eq('is_submitted', true)
    .not('is_practice', 'eq', true)
    .not('is_absent', 'eq', true)

  // student_id + test_id → ベストスコア のマップ
  const scoreMap = new Map<string, number>()
  for (const s of sessions ?? []) {
    const key = `${s.student_id}__${s.test_id}`
    if (s.score !== null) {
      const current = scoreMap.get(key)
      if (current === undefined || s.score > current) {
        scoreMap.set(key, s.score)
      }
    }
  }

  // Excelデータを構築
  if (mode === '300') {
    const header = ['クラス', '番号', '名前', ...tests.map((t) => {
      const date = t.opened_at ?? t.created_at
      return `${t.title}\n(${new Date(date).toLocaleDateString('ja-JP')})`
    })]

    const rows = students.map((student) => {
      const row: (string | number | null)[] = [
        student.class_name,
        student.seat_number,
        student.name,
      ]
      for (const test of tests) {
        const score = scoreMap.get(`${student.id}__${test.id}`)
        row.push(score !== undefined ? score : null)
      }
      return row
    })

    return NextResponse.json({ header, rows, sheetName: '300問テスト推移' })

  } else if (mode === '50') {
    // 50問：点数 + ポイントの2列構成
    const header = ['クラス', '番号', '名前']
    for (const t of tests) {
      const date = t.opened_at ?? t.created_at
      const roundLabel = t.round_number ? `第${t.round_number}回` : ''
      const label = `${roundLabel} ${t.title}\n(${new Date(date).toLocaleDateString('ja-JP')})`
      header.push(`${label} 点数`, `${label} ポイント`)
    }

    const rows = students.map((student) => {
      const row: (string | number | null)[] = [
        student.class_name,
        student.seat_number,
        student.name,
      ]
      for (const test of tests) {
        const score = scoreMap.get(`${student.id}__${test.id}`)
        if (score !== undefined) {
          row.push(score, calcPoints(score))
        } else {
          row.push(null, null)
        }
      }
      return row
    })

    return NextResponse.json({ header, rows, sheetName: '50問テスト推移' })

  } else {
    // 20問：点数のみ1列構成
    const header = ['クラス', '番号', '名前']
    for (const t of tests) {
      const date = t.opened_at ?? t.created_at
      const roundLabel = t.round_number ? `第${t.round_number}回` : ''
      const label = `${roundLabel} ${t.title}\n(${new Date(date).toLocaleDateString('ja-JP')})`
      header.push(label)
    }

    const rows = students.map((student) => {
      const row: (string | number | null)[] = [
        student.class_name,
        student.seat_number,
        student.name,
      ]
      for (const test of tests) {
        const score = scoreMap.get(`${student.id}__${test.id}`)
        row.push(score !== undefined ? score : null)
      }
      return row
    })

    return NextResponse.json({ header, rows, sheetName: '20問テスト推移' })
  }
}
