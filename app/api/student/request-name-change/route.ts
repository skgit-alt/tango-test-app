import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: request } = await admin
    .from('test_name_change_requests')
    .select('id, status, requested_name, reject_reason, created_at')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ request: request ?? null })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requested_name } = await req.json()
  if (!requested_name?.trim()) {
    return NextResponse.json({ error: '新しいテストネームを入力してください' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: student } = await admin
    .from('students')
    .select('id, test_name')
    .eq('id', user.id)
    .single()

  if (!student) return NextResponse.json({ error: '生徒情報が見つかりません' }, { status: 404 })

  // 既に申請中のリクエストがあるか確認
  const { data: existing } = await admin
    .from('test_name_change_requests')
    .select('id')
    .eq('student_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'すでに申請中のリクエストがあります。先生の承認をお待ちください。' }, { status: 400 })
  }

  const { error } = await admin
    .from('test_name_change_requests')
    .insert({
      student_id: user.id,
      current_name: student.test_name ?? '',
      requested_name: requested_name.trim(),
    })

  if (error) return NextResponse.json({ error: 'リクエストの作成に失敗しました' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
