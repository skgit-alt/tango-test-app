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
      .select('id, title, mode, status, open_classes, published_classes, published_student_ids')
      .in('status', ['waiting', 'open'])
      .order('created_at', { ascending: false }),
    admin.from('students').select('class_name').eq('id', user.id).maybeSingle(),
  ])

  const testList = tests ?? []
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

  const result = testList.map((test) => ({
    ...test,
    mySession: sessionMap[test.id] ?? null,
    _canSeeResult: student
      ? canSeeResult(test, student.class_name, user.id)
      : false,
  }))

  return NextResponse.json(result)
}
