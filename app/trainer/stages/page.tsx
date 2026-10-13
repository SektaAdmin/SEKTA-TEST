import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer } from '@/lib/queries/trainer-cabinet'
import TrainerStages from './TrainerStages'

export const dynamic = 'force-dynamic'

// Дані тягне клієнт: вікно «сьогодні ±14 днів» і групування по дню тижня/часу
// рахуються в TZ пристрою тренера (сервер Vercel — UTC), як на /trainer/salary.
export default async function TrainerStagesPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  const { data: trainer } = await getMyTrainer(supabase, user.id)
  if (!trainer) redirect('/trainer')

  return <TrainerStages trainerId={trainer.id} />
}
