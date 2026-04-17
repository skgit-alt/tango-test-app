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

  // 既存DBレコードとAuthユーザーを一括取得（ループ外で1回だけ）
  const [{ data: existingStudents }, { data: authList }] = await Promise.all([
    admin.from('students').select('id, student_id'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const dbMap = new Map(existingStudents?.map(s => [s.student_id as string, s.id as string]) ?? [])
  const authEmailMap = new Map(authList?.users?.map(u => [u.email ?? '', u.id]) ?? [])

  const results: { student_id: string; success: boolean; error?: string }[] = []

  // 1人ずつ処理する関数
  const processStudent = async (row: StudentRow): Promise<{ student_id: string; success: boolean; error?: string }> => {
    const email = `${row.student_id}@school.local`
    try {
      const existingDbId = dbMap.get(row.student_id)
      const existingAuthId = authEmailMap.get(email)

      let authUserId: string

      if (existingDbId) {
        // DBに存在 → パスワード更新のみ
        await admin.auth.admin.updateUserById(existingDbId, { password: row.password })
        authUserId = existingDbId
      } else if (existingAuthId) {
        // AuthだけにいてDBにいない → パスワード更新してDB作成
        await admin.auth.admin.updateUserById(existingAuthId, { password: row.password })
        authUserId = existingAuthId
      } else {
        // 新規作成
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
          email,
          password: row.password,
          email_confirm: true,
        })
        if (authError || !authData?.user) {
          return { student_id: row.student_id, success: false, error: `auth: ${authError?.message ?? 'no user'}` }
        }
        authUserId = authData.user.id
      }

      // RPCでDB登録（存在する場合はUPSERT）
      const { error: rpcError } = await admin.rpc('create_student', {
        p_id: authUserId,
        p_student_id: row.student_id,
        p_name: row.name,
        p_class_name: row.class_name,
        p_seat_number: row.seat_number,
      })

      if (rpcError) {
        return { student_id: row.student_id, success: false, error: `rpc: ${rpcError.message}` }
      }

      return { student_id: row.student_id, success: true }
    } catch (e) {
      return { student_id: row.student_id, success: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // 10人ずつ並列処理
  const BATCH_SIZE = 10
  for (let i = 0; i < students.length; i += BATCH_SIZE) {
    const batch = students.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(batch.map(processStudent))
    results.push(...batchResults)
  }

  const successCount = results.filter(r => r.success).length
  const errors = results.filter(r => !r.success)
  return NextResponse.json({ successCount, errors })
}
