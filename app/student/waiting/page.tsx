import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import WaitingClient from './WaitingClient'

export default async function WaitingPage({
  searchParams,
}: {
  searchParams: Promise<{ testId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('email', user.email)
    .single()

  if (!student) redirect('/auth/login')
  if (!student.test_name) redirect('/student/register')

  const { testId } = await searchParams
  const admin = createAdminClient()

  // testIdが指定されていればそのテストを、なければ最新のものを取得
  let test = null
  if (testId) {
    const { data } = await admin
      .from('tests')
      .select('*')
      .eq('id', testId)
      .in('status', ['waiting', 'open'])
      .maybeSingle()
    test = data
  }

  if (!test) {
    // フォールバック: 最新のwating/openテスト
    const { data } = await admin
      .from('tests')
      .select('*')
      .in('status', ['waiting', 'open'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    test = data
  }

  if (!test) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm w-full space-y-3">
          <div className="text-4xl">⏳</div>
          <p className="text-gray-600">現在実施中のテストはありません</p>
          <a href="/student" className="text-blue-600 text-sm hover:underline">ホームに戻る</a>
        </div>
      </div>
    )
  }

  // 既存セッションを確認（既に開始済みかどうか）
  const { data: existingSession } = await supabase
    .from('sessions')
    .select('*')
    .eq('test_id', test.id)
    .eq('student_id', student.id)
    .maybeSingle()

  // 既に提出済みなら結果待ち画面へ
  if (existingSession?.is_submitted) {
    redirect('/student/waiting-result')
  }

  return (
    <WaitingClient
      student={student}
      test={test}
      existingSession={existingSession}
    />
  )
}
