import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// デフォルトメッセージを取得
export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'teacher_message')
    .maybeSingle()
  return NextResponse.json({ value: data?.value ?? null })
}

// デフォルトメッセージを更新（admin only）
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

  const { value } = await req.json() as { value: string }
  const { error } = await admin
    .from('settings')
    .upsert({ key: 'teacher_message', value }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
