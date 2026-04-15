import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminsClient from './AdminsClient'

export default async function AdminsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // 管理者（admin）のみアクセス可
  const { data: me } = await supabase
    .from('admins')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!me || me.role !== 'admin') redirect('/teacher')

  const { data: admins } = await supabase
    .from('admins')
    .select('id, email, role, created_at')
    .order('created_at')

  return <AdminsClient admins={admins ?? []} myEmail={user.email!} />
}
