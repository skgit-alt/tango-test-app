import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeResult } from '@/lib/supabase/types'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const admin = createAdminClient()

  const [{ data: tests }, { data: student }] = await Promise.all([
    admin
      .from('tests')
      .select('id, title, mode, status, open_classes, published_classes, published_student_ids, scheduled_at, scheduled_class_starts')
      .in('status', ['waiting', 'open'])
      .order('created_at', { ascending: false }),
    admin.from('students').select('class_name').eq('id', user.id).maybeSingle(),
  ])

  let testList = tests ?? []

  // ── 予約開始チェック（ホーム画面のポーリングで発動） ───────────────────────
  const now = new Date()
  for (const test of testList) {
    if (test.status !== 'waiting') continue

    // 全クラス一括予約
    if (test.scheduled_at && new Date(test.scheduled_at) <= now) {
      const openedAt = now.toISOString()
      await admin.from('tests').update({ status: 'open', opened_at: openedAt }).eq('id', test.id)
      test.status = 'open'
      continue
    }

    // クラス別予約開始チェック
    if (test.scheduled_class_starts) {
      const classStarts = test.scheduled_class_starts as Record<string, string>
      const newClasses: string[] = []
      for (const [cls, isoTime] of Object.entries(classStarts)) {
        if (new Date(isoTime) <= now) newClasses.push(cls)
      }
      if (newClasses.length > 0) {
        const currentOpen: string[] = test.open_classes ?? []
        const merged = Array.from(new Set([...currentOpen, ...newClasses]))
        const remaining = { ...classStarts }
        for (const cls of newClasses) delete remaining[cls]
        await admin.from('tests').update({ open_classes: merged, scheduled_class_starts: remaining }).eq('id', test.id)
        test.open_classes = merged
        test.scheduled_class_starts = remaining
      }
    }
  }

  if (testList.length === 0) return NextResponse.json([])

  // この生徒のセッションを取得
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, test_id, is_submitted, score')
    .eq('student_id', user.id)
    .in('test_id', testList.map((t) => t.id))

  const sessionMap = Object.fromEntries(
    (sessions ?? []).map((s) => [s.test_id, s])
  )

  const studentClass = student?.class_name ?? ''
  const isNumericClass = /^\d/.test(studentClass)  // 1～6組
  const isAlphaClass = /^[A-Za-z]/.test(studentClass)  // A～D組
  const isOtherClass = !isNumericClass && !isAlphaClass // 実験用クラス等

  const result = testList
    .filter((test) => {
      // ── モード別クラスフィルター ──────────────────────────────────────────
      if (!isOtherClass) {
        if (test.mode === 50 && !isAlphaClass) return false   // 50問 → A～D組のみ
        if (test.mode !== 50 && test.mode !== 300 && !isNumericClass) return false // 20問 → 1～6組のみ
      }

      // ── 表示可否：openまたはopen_classesに自クラスが含まれるテストのみ表示 ──
      if (test.status === 'open') return true
      if ((test.open_classes ?? []).includes(studentClass)) return true

      // waiting かつ自クラスが open_classes に含まれない → 非表示
      // ただし提出済みセッションがある場合は結果表示のため継続
      const mySession = sessionMap[test.id]
      if (mySession?.is_submitted) return true

      return false
    })
    .map((test) => ({
      ...test,
      mySession: sessionMap[test.id] ?? null,
      _canSeeResult: student
        ? canSeeResult(test, student.class_name, user.id)
        : false,
    }))

  return NextResponse.json(result)
}
