import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(null, { status: 401 })
  }

  const { data, error } = await supabase
    .from('tests')
    .select('id, title, mode, status, open_classes')
    .in('status', ['waiting', 'open'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[active-test API] error:', error)
    return NextResponse.json(null, { status: 500 })
  }

  return NextResponse.json(data)
}
