import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { ids }: { ids: string[] } = await req.json()

  // DBから削除
  const { error: dbError } = await admin.from('students').delete().in('id', ids)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Authユーザーも削除
  for (const id of ids) {
    await admin.auth.admin.deleteUser(id)
  }

  return NextResponse.json({ deleted: ids.length })
}
