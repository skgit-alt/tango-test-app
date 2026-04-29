import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const testId = req.nextUrl.searchParams.get('testId')
  if (!testId) return NextResponse.json({ error: 'testId required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: sessions, error } = await admin
    .from('sessions')
    .select('*, students(name, class_name, seat_number, test_name)')
    .eq('test_id', testId)
    .neq('is_practice', true)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: cheatLogs } = await admin
    .from('cheat_logs')
    .select('*, sessions(students(name, class_name, seat_number))')
    .in('session_id', (sessions ?? []).map((s) => s.id))

  // ── 未受験者を含む全生徒一覧を取得 ───────────────────────────────────
  // 方針: セッションに存在するクラス名 + open_classes を合わせたクラス群の
  //       全生徒を返す。これにより未受験者も確実に表示できる。
  const { data: testInfo } = await admin
    .from('tests')
    .select('status, open_classes, mode')
    .eq('id', testId)
    .maybeSingle()

  let allStudents: { id: string; name: string; class_name: string; seat_number: number; test_name: string }[] = []

  if (testInfo) {
    // 1. セッションに存在するクラス名を抽出
    const classSet = new Set<string>()
    for (const s of sessions ?? []) {
      const st = (s as unknown as { students: { class_name: string } | null }).students
      if (st?.class_name) classSet.add(st.class_name)
    }

    // 2. open_classes も追加
    for (const cls of testInfo.open_classes ?? []) {
      classSet.add(cls)
    }

    // 3. クラスが判明していればそのクラスの全生徒を取得
    if (classSet.size > 0) {
      const { data } = await admin
        .from('students')
        .select('id, name, class_name, seat_number, test_name')
        .in('class_name', Array.from(classSet))
      allStudents = data ?? []
    } else if (['open', 'finished', 'published'].includes(testInfo.status)) {
      // クラス不明（全体一括openで未受験者ゼロの場合）はモード基準でフォールバック
      const { data: allDb } = await admin
        .from('students')
        .select('id, name, class_name, seat_number, test_name')
      let filtered = allDb ?? []
      if (testInfo.mode === 50) {
        filtered = filtered.filter((s) => /^[A-Za-z]/.test(s.class_name))
      } else if (testInfo.mode !== 300) {
        filtered = filtered.filter((s) => /^\d/.test(s.class_name))
      }
      allStudents = filtered
    }

    // クラス・出席番号順にソート
    allStudents.sort((a, b) => {
      const ak = `${a.class_name}${String(a.seat_number).padStart(3, '0')}`
      const bk = `${b.class_name}${String(b.seat_number).padStart(3, '0')}`
      return ak.localeCompare(bk)
    })
  }

  return NextResponse.json({ sessions: sessions ?? [], cheatLogs: cheatLogs ?? [], allStudents })
}
