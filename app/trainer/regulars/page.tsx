import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer, listTrainerRegulars } from '@/lib/queries/trainer-cabinet'
import TrainerRegulars from './TrainerRegulars'

export const dynamic = 'force-dynamic'

export default async function TrainerRegularsPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  const { data: trainer } = await getMyTrainer(supabase, user.id)
  if (!trainer) redirect('/trainer')

  const { data: series } = await listTrainerRegulars(supabase, trainer.id)

  return <TrainerRegulars series={series} />
}
