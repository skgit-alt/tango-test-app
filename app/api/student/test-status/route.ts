import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeResult } from '@/lib/supabase/types'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const testId = req.nextUrl.searchParams.get('testId')
  if (!testId) return NextResponse.json(null, { status: 400 })

  const admin = createAdminClient()

  const [{ data: rawTest, error }, { data: student }] = await Promise.all([
    admin.from('tests').select('*').eq('id', testId).maybeSingle(),
    admin.from('students').select('id, class_name').eq('id', user.id).maybeSingle(),
  ])

  if (error || !rawTest) return NextResponse.json(null, { status: 500 })

  // 予約開始チェック：waiting状態でscheduled_atを過ぎていたら自動開始
  let test = rawTest
  if (test.status === 'waiting' && test.scheduled_at) {
    const now = new Date()
    const scheduled = new Date(test.scheduled_at)
    if (scheduled <= now) {
      const openedAt = now.toISOString()
      await admin.from('tests').update({ status: 'open', opened_at: openedAt }).eq('id', testId)
      test = { ...test, status: 'open', opened_at: openedAt }
    }
  }

  // この生徒が結果を閲覧できるかどうか
  const studentCanSee = student
    ? canSeeResult(test, student.class_name, student.id)
    : false

  return NextResponse.json({ ...test, _canSeeResult: studentCanSee })
}
