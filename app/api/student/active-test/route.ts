import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json([], { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tests')
    .select('id, title, mode, status, open_classes')
    .in('status', ['waiting', 'open'])
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[active-test API] error:', error)
    return NextResponse.json([], { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
