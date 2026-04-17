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
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')
  if (!student.test_name) redirect('/student/register')

  const { testId } = await searchParams
  const admin = createAdminClient()

  // testId縺梧欠螳壹＆繧後※縺・ｌ縺ｰ縺昴・繝・せ繝医ｒ縲√↑縺代ｌ縺ｰ譛譁ｰ縺ｮ繧ゅ・繧貞叙蠕・  let test = null
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
    // 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 譛譁ｰ縺ｮwating/open繝・せ繝・    const { data } = await admin
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
          <div className="text-4xl">竢ｳ</div>
          <p className="text-gray-600">迴ｾ蝨ｨ螳滓命荳ｭ縺ｮ繝・せ繝医・縺ゅｊ縺ｾ縺帙ｓ</p>
          <a href="/student" className="text-blue-600 text-sm hover:underline">繝帙・繝縺ｫ謌ｻ繧・/a>
        </div>
      </div>
    )
  }

  // 譌｢蟄倥そ繝・す繝ｧ繝ｳ繧堤｢ｺ隱搾ｼ域里縺ｫ髢句ｧ区ｸ医∩縺九←縺・°・・  const { data: existingSession } = await supabase
    .from('sessions')
    .select('*')
    .eq('test_id', test.id)
    .eq('student_id', student.id)
    .maybeSingle()

  // 譌｢縺ｫ謠仙・貂医∩縺ｪ繧臥ｵ先棡蠕・■逕ｻ髱｢縺ｸ
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
