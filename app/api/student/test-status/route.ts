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

  const [{ data: test, error }, { data: student }] = await Promise.all([
    admin.from('tests').select('*').eq('id', testId).maybeSingle(),
    admin.from('students').select('id, class_name').eq('id', user.id).maybeSingle(),
  ])

  if (error || !test) return NextResponse.json(null, { status: 500 })

  // この生徒が結果を閲覧できるかどうか
  const studentCanSee = student
    ? canSeeResult(test, student.class_name, student.id)
    : false

  return NextResponse.json({ ...test, _canSeeResult: studentCanSee })
}
