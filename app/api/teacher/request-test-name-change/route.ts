import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 先生かどうか確認
  const { data: adminUser } = await supabase
    .from('admins')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { student_id } = await req.json()
  if (!student_id) return NextResponse.json({ error: 'student_id is required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('students')
    .update({ must_change_test_name: true })
    .eq('id', student_id)

  if (error) {
    console.error(error)
    return NextResponse.json({ error: '依頼の送信に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
