import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import LogoutButton from './LogoutButton'
import TeacherNav from './TeacherNav'

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('id, role')
    .eq('email', user.email)
    .single()

  if (!admin) {
    redirect('/')
  }

  const isAdmin = admin.role === 'admin'

  // テストネーム変更申請の pending 件数を取得
  const adminClient = createAdminClient()
  const { count: pendingNameChangeCount } = await adminClient
    .from('test_name_change_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/teacher" className="font-bold text-blue-600 text-lg">
            単語テスト管理
          </a>
          <TeacherNav isAdmin={isAdmin} pendingNameChangeCount={pendingNameChangeCount ?? 0} />
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
