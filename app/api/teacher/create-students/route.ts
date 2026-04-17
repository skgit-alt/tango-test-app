import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

type StudentRow = {
  student_id: string
  name: string
  class_name: string
  seat_number: number
  password: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { students }: { students: StudentRow[] } = await req.json()

  const results: { student_id: string; success: boolean; error?: string }[] = []

  for (const row of students) {
    const email = `${row.student_id}@school.local`
    try {
      // DBに既存レコードがあるか確認
      const { data: existing } = await admin
        .from('students')
        .select('id')
        .eq('student_id', row.student_id)
        .maybeSingle()

      if (existing) {
        // 既存ユーザーのパスワードを更新してRPCで情報更新
        await admin.auth.admin.updateUserById(existing.id, { password: row.password })
        await admin.rpc('create_student', {
          p_id: existing.id,
          p_student_id: row.student_id,
          p_name: row.name,
          p_class_name: row.class_name,
          p_seat_number: row.seat_number,
        })
        results.push({ student_id: row.student_id, success: true })
        continue
      }

      // Authユーザーが既に存在するか確認（DBレコード削除後の再登録対応）
      let authUserId: string | null = null
      const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const existingAuthUser = authList?.users?.find(u => u.email === email)

      if (existingAuthUser) {
        // 既存のAuthユーザーのパスワードを更新して再利用
        await admin.auth.admin.updateUserById(existingAuthUser.id, { password: row.password })
        authUserId = existingAuthUser.id
      } else {
        // 新規Authユーザー作成
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
          email,
          password: row.password,
          email_confirm: true,
        })
        if (authError) {
          results.push({ student_id: row.student_id, success: false, error: `auth: ${authError.message}` })
          continue
        }
        if (!authData?.user) {
          results.push({ student_id: row.student_id, success: false, error: 'auth: user not returned' })
          continue
        }
        authUserId = authData.user.id
      }

      // RPCでstudentsテーブルに挿入
      const { error: rpcError } = await admin.rpc('create_student', {
        p_id: authUserId,
        p_student_id: row.student_id,
        p_name: row.name,
        p_class_name: row.class_name,
        p_seat_number: row.seat_number,
      })

      if (rpcError) {
        results.push({ student_id: row.student_id, success: false, error: `rpc: ${rpcError.message}` })
        continue
      }

      results.push({ student_id: row.student_id, success: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ student_id: row.student_id, success: false, error: `exception: ${msg}` })
    }
  }

  const successCount = results.filter(r => r.success).length
  const errors = results.filter(r => !r.success)
  return NextResponse.json({ successCount, errors })
}
