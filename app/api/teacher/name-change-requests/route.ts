import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: requests } = await admin
    .from('test_name_change_requests')
    .select('*, students(name, class_name, seat_number)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  return NextResponse.json({ requests: requests ?? [] })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action } = await req.json() // action: 'approve' | 'reject'
  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: request } = await admin
    .from('test_name_change_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'リクエストが見つかりません' }, { status: 404 })

  if (action === 'approve') {
    const { error: updateError } = await admin
      .from('students')
      .update({ test_name: request.requested_name })
      .eq('id', request.student_id)

    if (updateError) return NextResponse.json({ error: 'テストネームの更新に失敗しました' }, { status: 500 })
  }

  await admin
    .from('test_name_change_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
