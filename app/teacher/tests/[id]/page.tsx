import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import TestManagerClient from './TestManagerClient'

export default async function TestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: test } = await supabase
    .from('tests')
    .select('*')
    .eq('id', id)
    .single()

  if (!test) notFound()

  const { data: questions } = await supabase
    .from('questions')
    .select('id, order_num, question_text, choice1, choice2, choice3, choice4, choice5, correct_answer, points')
    .eq('test_id', id)
    .order('order_num')

  // ロール取得（先生はテスト開始以外の操作を制限）
  const { data: { user } } = await supabase.auth.getUser()
  const adminClient = createAdminClient()
  const { data: adminRec } = await adminClient
    .from('admins')
    .select('role')
    .eq('email', user?.email ?? '')
    .maybeSingle()
  const isAdmin = adminRec?.role === 'admin'

  return (
    <TestManagerClient
      test={test}
      questions={questions ?? []}
      isAdmin={isAdmin}
    />
  )
}
