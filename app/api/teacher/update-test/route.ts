import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_FIELDS = new Set([
  'title',
  'status',
  'opened_at',
  'published_at',
  'open_classes',
  'scheduled_at',
  'round_number',
  'pass_score',
  'time_limit',
  'published_classes',
  'published_student_ids',
  'teacher_message',
  'scheduled_class_starts',
])

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

  const { testId, patch } = await req.json() as { testId: string; patch: Record<string, unknown> }
  if (!testId || !patch || typeof patch !== 'object') {
    return NextResponse.json({ error: 'testId and patch required' }, { status: 400 })
  }

  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (ALLOWED_FIELDS.has(k)) clean[k] = v
  }
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: 'No allowed fields in patch' }, { status: 400 })
  }

  const { error } = await admin.from('tests').update(clean).eq('id', testId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
