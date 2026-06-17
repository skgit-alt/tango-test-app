import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminsClient from './AdminsClient'

export default async function AdminsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('admins')
    .select('role')
    .eq('email', user.email)
    .single()

  // スタッフ以外はアクセス不可
  if (!me) redirect('/teacher')

  const isAdmin = me.role === 'admin'

  const { data: admins } = await supabase
    .from('admins')
    .select('id, email, role, created_at')
    .order('created_at')

  return <AdminsClient admins={admins ?? []} myEmail={user.email!} isAdmin={isAdmin} />
}
