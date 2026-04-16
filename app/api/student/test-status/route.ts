import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const testId = req.nextUrl.searchParams.get('testId')
  if (!testId) return NextResponse.json(null, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tests')
    .select('*')
    .eq('id', testId)
    .maybeSingle()

  if (error) {
    console.error('[test-status API] error:', error)
    return NextResponse.json(null, { status: 500 })
  }

  return NextResponse.json(data)
}
