import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser, homePathForRole } from '@/lib/auth/role'

export default async function Home() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  redirect(homePathForRole(roleFromUser(user)))
}
