import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // 現在のセッションからユーザーを取得
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { password, testName }: { password: string; testName: string } = await req.json()

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'パスワードは6文字以上で入力してください' }, { status: 400 })
  }

  // テストネームの重複チェック
  const { data: existing } = await admin
    .from('students')
    .select('id')
    .eq('test_name', testName)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'そのテストネームは既に使用されています。別のテストネームを選んでください。' },
      { status: 400 }
    )
  }

  // 管理者APIでパスワード変更（現在のセッション／Cookieは変わらない）
  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, { password })
  if (pwError) return NextResponse.json({ error: pwError.message }, { status: 500 })

  // テストネーム保存 & must_change_password を false に
  const { error: rpcError } = await admin.rpc('complete_student_setup_by_id', {
    p_id: user.id,
    p_test_name: testName,
  })
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
