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
    .eq('id', user.id)
    .maybeSingle()

  if (!adminRec || adminRec.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sessionId } = await req.json() as { sessionId: string }
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  await admin.from('answers').delete().eq('session_id', sessionId)
  const { error } = await admin
    .from('sessions')
    .update({ is_submitted: false, score: null, submitted_at: null, current_page: 1 })
    .eq('id', sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
