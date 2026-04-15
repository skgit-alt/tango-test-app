import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from './LogoutButton'

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/teacher" className="font-bold text-blue-600 text-lg">
            単語テスト管理
          </a>
          <nav className="hidden sm:flex items-center gap-4 text-sm text-gray-600">
            <a href="/teacher" className="hover:text-blue-600 transition">テスト一覧</a>
            {isAdmin && (
              <>
                <a href="/teacher/students" className="hover:text-blue-600 transition">生徒管理</a>
                <a href="/teacher/points" className="hover:text-blue-600 transition">ポイント管理</a>
                <a href="/teacher/admins" className="hover:text-blue-600 transition font-medium text-purple-600">スタッフ管理</a>
              </>
            )}
          </nav>
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
