import { createClient } from '@/lib/supabase/server'
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
    .select('id, order_num, question_text, correct_answer, points')
    .eq('test_id', id)
    .order('order_num')

  return (
    <TestManagerClient
      test={test}
      totalQuestions={questions?.length ?? 0}
    />
  )
}
