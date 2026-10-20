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

  const { testId } = await searchParams
  const admin = createAdminClient()

  const { data: student } = await admin
    .from('students')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')
  if (!student.test_name) redirect('/student/change-password')

  const studentClass = student.class_name ?? ''
  const isNumericClass = /^\d/.test(studentClass)
  const isAlphaClass = /^[A-Za-z]/.test(studentClass)
  const isOtherClass = !isNumericClass && !isAlphaClass

  // このクラスの生徒がこのテストを受けられるか判定（active-test APIと同じロジック）
  const isClassAllowed = (t: any): boolean => {
    const tc = t.target_classes as string[] | null
    if (tc && tc.length > 0) return tc.includes(studentClass)
    if (isOtherClass) return true
    const isIdiomatic = t.mode === 55 || t.mode === 45 || t.mode === 40
    if ((t.mode === 50 || t.mode === 600 || isIdiomatic) && !isAlphaClass) return false
    if (t.mode !== 50 && t.mode !== 300 && t.mode !== 600 && !isIdiomatic && !isNumericClass) return false
    return true
  }

  // testIdが指定されていればそのテストを、なければ最新のopenテストを取得
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
    // フォールバック: 最新のopenテストからクラスに合うものを探す
    const { data: openTests } = await admin
      .from('tests')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10)
    test = (openTests ?? []).find(isClassAllowed) ?? null
  }

  if (!test) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm w-full space-y-3">
          <div className="text-4xl">⏳</div>
          <p className="text-gray-600">現在受付中のテストはありません</p>
          <a href="/student" className="text-blue-600 text-sm hover:underline">ホームに戻る</a>
        </div>
      </div>
    )
  }

  // この生徒がこのテストにアクセスできるか確認
  // 1. target_classesチェック（配信先クラスに含まれていなければホームへ）
  if (!isClassAllowed(test)) {
    redirect('/student')
  }
  // 2. open状態またはクラス別開放チェック
  const classOpen = (test.open_classes ?? []).includes(studentClass)
  const isFullyOpen = test.status === 'open'
  if (!isFullyOpen && !classOpen) {
    redirect('/student')
  }

  // 既存セッションを確認（既に提出済みかどうか）
  const { data: existingSession } = await admin
    .from('sessions')
    .select('*')
    .eq('test_id', test.id)
    .eq('student_id', student.id)
    .maybeSingle()

  // 既に提出済みなら結果待ち画面へ
  if (existingSession?.is_submitted) {
    redirect('/student/waiting-result')
  }

  // 既にセッションがあれば（中断中）テスト画面へ直接
  if (existingSession && !existingSession.is_submitted) {
    redirect('/student/test')
  }

  return (
    <WaitingClient
      student={student}
      test={test}
      existingSession={existingSession}
    />
  )
}
