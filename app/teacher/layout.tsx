import { createClient } from '@/lib/supabase/server'
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/teacher" className="font-bold text-blue-600 text-lg">
            単語テスト管理
          </a>
          <TeacherNav isAdmin={isAdmin} />
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
