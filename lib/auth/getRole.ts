import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser, type Role } from './role'

/** Роль поточного користувача на сервері (Server Components / route handlers). */
export async function getRole(): Promise<Role> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return roleFromUser(user)
}
