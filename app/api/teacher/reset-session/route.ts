import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: adminRec } = await admin
    .from('admins')
    .select('role')
    .eq('email', user.email!)
    .maybeSingle()

  if (!adminRec || adminRec.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sessionId } = await req.json() as { sessionId: string }
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  // セッション情報を取得（student_id / test_id が必要）
  const { data: sessionInfo } = await admin
    .from('sessions')
    .select('student_id, test_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (!sessionInfo) return NextResponse.json({ error: 'session not found' }, { status: 404 })

  // ① points テーブルの該当行を削除（再受験後に RPC が正常に記録できるよう）
  await admin
    .from('points')
    .delete()
    .eq('student_id', sessionInfo.student_id)
    .eq('test_id', sessionInfo.test_id)

  // ② 回答を削除
  await admin.from('answers').delete().eq('session_id', sessionId)

  // ③ セッションをリセット（is_retake=true でマーク、started_at もリセット）
  const { error } = await admin
    .from('sessions')
    .update({
      is_submitted: false,
      score: null,
      submitted_at: null,
      started_at: null,   // タイマーを正しくリセットするために必須
      current_page: 1,
      is_retake: true,
    })
    .eq('id', sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
