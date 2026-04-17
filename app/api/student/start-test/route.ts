import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { testId } = await req.json()

  const now = new Date().toISOString()

  // 生徒レコードを確認
  const { data: student } = await admin
    .from('students')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!student) return NextResponse.json({ error: '生徒情報が見つかりません' }, { status: 404 })

  // 既存の未提出セッションを確認
  const { data: existing } = await admin
    .from('sessions')
    .select('id, started_at')
    .eq('test_id', testId)
    .eq('student_id', user.id)
    .eq('is_submitted', false)
    .maybeSingle()

  if (existing) {
    // 既存セッションの started_at を現在時刻にリセット
    // （待機画面からテスト開始ボタンを押した＝この瞬間が本当の開始時刻）
    const { error } = await admin
      .from('sessions')
      .update({ started_at: now, current_page: 1 })
      .eq('id', existing.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // 新規セッション作成
    const { error } = await admin
      .from('sessions')
      .insert({
        test_id: testId,
        student_id: user.id,
        started_at: now,
        is_submitted: false,
        current_page: 1,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
