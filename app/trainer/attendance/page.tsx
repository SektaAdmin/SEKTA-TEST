import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer } from '@/lib/queries/trainer-cabinet'
import TrainerAttendance from './TrainerAttendance'

export const dynamic = 'force-dynamic'

// Дані тягне клієнт (період/вкладки інтерактивні); RPC сама обмежує тренера його заняттями.
export default async function TrainerAttendancePage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  const { data: trainer } = await getMyTrainer(supabase, user.id)
  if (!trainer) redirect('/trainer')

  return <TrainerAttendance />
}
