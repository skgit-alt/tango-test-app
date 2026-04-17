import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, test_name, must_change_password')
    .eq('id', user.id)
    .single()

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🚫</div>
          <h1 className="text-xl font-bold text-gray-800">登録されていません</h1>
          <p className="text-sm text-gray-500">
            担当の先生に連絡してください。
          </p>
        </div>
      </div>
    )
  }

  // 初回ログイン時はパスワード変更ページへ強制誘導
  // （change-passwordページ自体は除外）
  return <>{children}</>
}
