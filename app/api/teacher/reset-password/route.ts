import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // 管理者のみ操作可能
  const { data: adminRec } = await admin
    .from('admins')
    .select('role')
    .eq('email', user.email!)
    .maybeSingle()
  if (!adminRec || adminRec.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, password }: { id: string; password: string } = await req.json()

  if (!id || !password || password.length < 6) {
    return NextResponse.json({ error: 'パスワードは6文字以上で入力してください' }, { status: 400 })
  }

  // Auth パスワード更新
  const { error: authError } = await admin.auth.admin.updateUserById(id, { password })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  // must_change_password を true に（RPC経由でスキーマキャッシュ回避）
  const { error: rpcError } = await admin.rpc('reset_student_setup', { p_id: id })
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
