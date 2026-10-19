import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer } from '@/lib/queries/trainer-cabinet'
import TrainerPlanned from './TrainerPlanned'

export const dynamic = 'force-dynamic'

// Дані тягне клієнт; RPC «Запланованого» самі обмежують тренера його серіями.
export default async function TrainerPlannedPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  const { data: trainer } = await getMyTrainer(supabase, user.id)
  if (!trainer) redirect('/trainer')

  return <TrainerPlanned trainerId={trainer.id} />
}
