import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_db_size_bytes')

  if (error) {
    return NextResponse.json({ setupRequired: true })
  }

  const sizeBytes = data as number
  const sizeMB = Math.round(sizeBytes / 1024 / 1024)
  const limitMB = 500
  const percent = Math.round((sizeMB / limitMB) * 100)

  return NextResponse.json({ sizeMB, limitMB, percent })
}
