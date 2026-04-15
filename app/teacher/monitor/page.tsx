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
    .select('id, title, mode, status, opened_at, created_at, open_classes')
    .in('status', ['waiting', 'open', 'finished'])
    .order('created_at', { ascending: false })

  const { data: students } = await supabase
    .from('students')
    .select('class_name')
    .order('class_name')

  const classes = [...new Set((students ?? []).map(s => s.class_name))].filter(Boolean).sort()

  return <MonitorClient tests={tests || []} classes={classes} />
}
