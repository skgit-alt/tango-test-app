import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
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

  if (admin) {
    if (admin.role === 'admin') {
      redirect('/teacher')
    } else {
      redirect('/teacher/monitor')
    }
  } else {
    redirect('/student')
  }
}
