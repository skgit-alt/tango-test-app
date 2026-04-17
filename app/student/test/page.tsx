import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import TestClient from './TestClient'

export default async function TestPage() {
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

  // 譛ｪ謠仙・縺ｮ繧ｻ繝・す繝ｧ繝ｳ繧呈爾縺呻ｼ医そ繝・す繝ｧ繝ｳ縺悟ｭ伜惠 = 髢句ｧ玖ｨｱ蜿ｯ貂医∩・・  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('student_id', student.id)
    .eq('is_submitted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) redirect('/student/waiting')

  // 繧ｻ繝・す繝ｧ繝ｳ縺ｮtest_id縺九ｉ繝・せ繝医ｒ蜿門ｾ暦ｼ・LS繝舌う繝代せ・・  const admin = createAdminClient()
  const { data: test } = await admin
    .from('tests')
    .select('*')
    .eq('id', session.test_id)
    .single()

  if (!test) redirect('/student/waiting')

  // 蝠城｡後ｒ蜈ｨ蜿門ｾ暦ｼ・LS繝舌う繝代せ・・  const { data: questions } = await admin
    .from('questions')
    .select('*')
    .eq('test_id', test.id)
    .order('order_num')

  if (!questions || questions.length === 0) redirect('/student/waiting')

  // 譌｢蟄倥・蝗樒ｭ斐ｒ蜿門ｾ暦ｼ井ｸｭ譁ｭ蜀埼幕逕ｨ・・  const { data: existingAnswers } = await supabase
    .from('answers')
    .select('question_id, selected_answer')
    .eq('session_id', session.id)

  const answerMap: Record<string, number | null> = {}
  existingAnswers?.forEach((a) => {
    answerMap[a.question_id] = a.selected_answer
  })

  return (
    <TestClient
      test={test}
      session={session}
      questions={questions}
      initialAnswers={answerMap}
    />
  )
}
