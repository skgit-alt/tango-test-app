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
  'cheats_confirmed_at',
])

// 先生ロールが操作できるフィールド（テスト開始に関するもののみ）
const TEACHER_ALLOWED_FIELDS = new Set([
  'opened_at',
  'open_classes',
  'scheduled_at',
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

  if (!adminRec) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { testId, patch } = await req.json() as { testId: string; patch: Record<string, unknown> }
  if (!testId || !patch || typeof patch !== 'object') {
    return NextResponse.json({ error: 'testId and patch required' }, { status: 400 })
  }

  // 先生ロールの場合：テスト開始に関するフィールドのみ許可
  if (adminRec.role !== 'admin') {
    const teacherClean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'status') {
        // 先生は status を 'open' にのみ変更可能
        if (v !== 'open') {
          return NextResponse.json({ error: 'Forbidden: teacher can only open tests' }, { status: 403 })
        }
        teacherClean[k] = v
      } else if (TEACHER_ALLOWED_FIELDS.has(k)) {
        teacherClean[k] = v
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    if (Object.keys(teacherClean).length === 0) {
      return NextResponse.json({ error: 'No allowed fields in patch' }, { status: 400 })
    }
    const { error } = await admin.from('tests').update(teacherClean).eq('id', testId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // 管理者の場合：全フィールド許可
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
