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

  const { testIds } = await req.json() as { testIds: string[] }
  if (!Array.isArray(testIds) || testIds.length === 0) {
    return NextResponse.json({ error: 'testIds required' }, { status: 400 })
  }

  const { data: sessions } = await admin
    .from('sessions')
    .select('id')
    .in('test_id', testIds)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  const sessionIds = sessions.map((s) => s.id)
  await admin.from('answers').delete().in('session_id', sessionIds)
  await admin.from('cheat_logs').delete().in('session_id', sessionIds)
  await admin.from('sessions').delete().in('id', sessionIds)

  return NextResponse.json({ deleted: sessions.length })
}
