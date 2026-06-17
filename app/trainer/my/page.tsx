import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer, listMyUpcomingClasses, listMyPastClasses } from '@/lib/queries/trainer-cabinet'
import CabinetHeader from '@/components/CabinetHeader'
import TrainerMyClasses from './TrainerMyClasses'

export const dynamic = 'force-dynamic'

export default async function TrainerMyPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  const { data: trainer } = await getMyTrainer(supabase, user.id)
  if (!trainer) redirect('/trainer')

  const todayISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

  const [{ data: upcoming }, { data: past }] = await Promise.all([
    listMyUpcomingClasses(supabase, trainer.id, todayISO),
    listMyPastClasses(supabase, trainer.id, todayISO),
  ])

  return (
    <>
      <CabinetHeader title="Мої заняття" backHref="/trainer" hideLogout />
      <TrainerMyClasses upcoming={upcoming} past={past} />
    </>
  )
}
