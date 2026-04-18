import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // 先生ロールか確認
  const { data: adminRec } = await admin
    .from('admins')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!adminRec || adminRec.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { testIds } = await req.json() as { testIds: string[] }
  if (!Array.isArray(testIds) || testIds.length === 0) {
    return NextResponse.json({ error: 'testIds required' }, { status: 400 })
  }

  // セッションID → answers/cheat_logs/sessions 削除
  const { data: sessions } = await admin
    .from('sessions')
    .select('id')
    .in('test_id', testIds)

  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((s) => s.id)
    await admin.from('answers').delete().in('session_id', sessionIds)
    await admin.from('cheat_logs').delete().in('session_id', sessionIds)
    await admin.from('sessions').delete().in('id', sessionIds)
  }

  await admin.from('questions').delete().in('test_id', testIds)
  // pointsテーブルも削除（あれば）
  await admin.from('points').delete().in('test_id', testIds)
  const { error } = await admin.from('tests').delete().in('id', testIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
