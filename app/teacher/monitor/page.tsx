import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MonitorClient from './MonitorClient'

export default async function MonitorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: admin } = await supabase
    .from('admins')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!admin) redirect('/student')

  const { data: tests } = await supabase
    .from('tests')
    .select('id, title, mode, status, opened_at, created_at')
    .in('status', ['waiting', 'open', 'finished'])
    .order('created_at', { ascending: false })

  return <MonitorClient tests={tests || []} />
}
