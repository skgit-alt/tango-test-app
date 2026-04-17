import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { testId, existingSessionId } = await req.json()

  const now = new Date().toISOString()

  // 生徒レコードを取得
  const { data: student } = await admin
    .from('students')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!student) return NextResponse.json({ error: '生徒情報が見つかりません' }, { status: 404 })

  if (existingSessionId) {
    // 既存セッションのstarted_atを更新
    const { error } = await admin
      .from('sessions')
      .update({ started_at: now })
      .eq('id', existingSessionId)
      .is('started_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // 新規セッション作成（重複防止: 既に存在すれば何もしない）
    const { data: existing } = await admin
      .from('sessions')
      .select('id')
      .eq('test_id', testId)
      .eq('student_id', user.id)
      .maybeSingle()

    if (!existing) {
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
  }

  return NextResponse.json({ success: true })
}
