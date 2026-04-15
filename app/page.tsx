import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // 先生かどうか判定してリダイレクト
  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('email', user.email)
    .single()

  if (admin) {
    redirect('/teacher')
  } else {
    redirect('/student')
  }
}
