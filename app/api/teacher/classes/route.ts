import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: adminRec } = await admin
    .from('admins')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!adminRec) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await admin
    .from('students')
    .select('class_name')
    .order('class_name')

  const classes = Array.from(new Set((data ?? []).map((s) => s.class_name).filter(Boolean))).sort()
  return NextResponse.json({ classes })
}
