import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import RetakeClient from './RetakeClient'

export default async function RetakePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()

  const { data: student } = await admin
    .from('students')
    .select('id, class_name')
    .eq('id', user.id)
    .single()

  if (!student) redirect('/auth/login')

  const isAlphaClass = /^[A-Za-z]/.test(student.class_name ?? '')
  const isNumericClass = /^\d/.test(student.class_name ?? '')

  // 公開済みテストを全件取得
  const { data: publishedTests } = await admin
    .from('tests')
    .select('id, title, mode, created_at, pass_score')
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  // クラスに応じてフィルタリング（既存のフィルタと同じルール）
  const filteredTests = (publishedTests ?? []).filter((t) => {
    if ((t.mode === 50 || t.mode === 600) && !isAlphaClass) return false
    if (t.mode !== 50 && t.mode !== 300 && t.mode !== 600 && !isNumericClass) return false
    return true
  })

  // 生徒の既存練習セッション（最新スコア取得用）
  const testIds = filteredTests.map((t) => t.id)
  const { data: practiceSessions } = testIds.length > 0
    ? await admin
        .from('sessions')
        .select('test_id, score, submitted_at')
        .eq('student_id', student.id)
        .eq('is_practice', true)
        .eq('is_submitted', true)
        .in('test_id', testIds)
        .order('submitted_at', { ascending: false })
    : { data: [] }

  // テストIDごとに最新の練習スコアをマップ化
  const lastPracticeMap: Record<string, { score: number; submitted_at: string }> = {}
  for (const s of (practiceSessions ?? [])) {
    if (!lastPracticeMap[s.test_id]) {
      lastPracticeMap[s.test_id] = { score: s.score ?? 0, submitted_at: s.submitted_at ?? '' }
    }
  }

  return <RetakeClient tests={filteredTests} lastPracticeMap={lastPracticeMap} />
}
