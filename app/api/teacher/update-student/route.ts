import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 管理者のみ操作可能
  const adminClient = createAdminClient()
  const { data: adminRec } = await adminClient
    .from('admins')
    .select('role')
    .eq('email', user.email!)
    .maybeSingle()
  if (!adminRec || adminRec.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, name, class_name, seat_number, student_id, test_name } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await adminClient
    .from('students')
    .update({
      name: name?.trim(),
      class_name: class_name?.trim(),
      seat_number: seat_number,
      student_id: student_id?.trim(),
      test_name: test_name?.trim() || null,
    })
    .eq('id', id)

  if (error) {
    console.error(error)
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
