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
  // 先生のみ許可
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { students }: { students: StudentRow[] } = await req.json()

  const results: { student_id: string; success: boolean; error?: string }[] = []

  for (const row of students) {
    try {
      const email = `${row.student_id}@school.local`

      // すでに存在するか確認（student_idで検索）
      const { data: existing } = await admin
        .from('students')
        .select('id')
        .eq('student_id', row.student_id)
        .maybeSingle()

      if (existing) {
        // 既存の場合はパスワードと情報を更新
        const { data: authList } = await admin.auth.admin.listUsers()
        const existingAuthUser = authList.users.find(u => u.email === email)
        if (existingAuthUser) {
          await admin.auth.admin.updateUserById(existingAuthUser.id, { password: row.password })
        }
        await admin.from('students').update({
          name: row.name,
          class_name: row.class_name,
          seat_number: row.seat_number,
          must_change_password: true,
        }).eq('student_id', row.student_id)

        results.push({ student_id: row.student_id, success: true })
        continue
      }

      // 新規作成
      const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email,
        password: row.password,
        email_confirm: true,
      })

      if (authError || !authUser.user) {
        results.push({ student_id: row.student_id, success: false, error: authError?.message })
        continue
      }

      const { error: insertError } = await admin.from('students').insert({
        id: authUser.user.id,
        student_id: row.student_id,
        name: row.name,
        class_name: row.class_name,
        seat_number: row.seat_number,
        test_name: null,
        must_change_password: true,
      })

      if (insertError) {
        // auth userを削除してロールバック
        await admin.auth.admin.deleteUser(authUser.user.id)
        results.push({ student_id: row.student_id, success: false, error: insertError.message })
        continue
      }

      results.push({ student_id: row.student_id, success: true })
    } catch (e) {
      results.push({ student_id: row.student_id, success: false, error: String(e) })
    }
  }

  const successCount = results.filter(r => r.success).length
  const errors = results.filter(r => !r.success)

  return NextResponse.json({ successCount, errors })
}
