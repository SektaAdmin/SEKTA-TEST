import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer } from '@/lib/queries/trainer-cabinet'
import TrainerSalary from './TrainerSalary'

export const dynamic = 'force-dynamic'

// Дані тягне клієнт: період (тиждень/місяць/діапазон) рахується в TZ пристрою тренера,
// а сервер (Vercel) — UTC; prefetch давав би інший «поточний місяць» біля опівночі.
export default async function TrainerSalaryPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  const { data: trainer } = await getMyTrainer(supabase, user.id)
  if (!trainer) redirect('/trainer')

  return <TrainerSalary trainerId={trainer.id} />
}
