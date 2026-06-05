import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import {
  getMyClient,
  listMySessionBalances,
  listMyUpcomingEnrollments,
  listMyPastEnrollments,
} from '@/lib/queries/client-cabinet-data'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import CabinetHeader from '@/components/CabinetHeader'
import ClientVisits from './ClientVisits'
import styles from '../client.module.css'

export const dynamic = 'force-dynamic'

export default async function ClientVisitsPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'trainer') redirect('/trainer')

  const { data: client } = await getMyClient(supabase, user.id)
  if (!client) redirect('/client')

  // Межі запиту мусять збігатися з тими, що порахує клієнт (useMemo у ClientVisits):
  // upcoming — від початку сьогодні, past — до «зараз». Дрейф у кілька мс між
  // server- і client-«зараз» на межі дня неважливий (фільтр по даті заняття).
  const fromISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const nowISO = new Date().toISOString()

  const [{ data: typeLabels }, { data: sessionBalances }, { data: upcoming }, { data: past }] =
    await Promise.all([
      listTrainingTypeLabels(supabase),
      listMySessionBalances(supabase, client.id),
      listMyUpcomingEnrollments(supabase, client.id, fromISO),
      listMyPastEnrollments(supabase, client.id, nowISO),
    ])

  return (
    <>
      <CabinetHeader title="Мої візити" backHref="/client" hideLogout />
      <div className={styles.scroll}>
        <ClientVisits
          clientId={client.id}
          typeLabels={typeLabels}
          sessionBalances={sessionBalances}
          initialUpcoming={upcoming}
          initialPast={past}
        />
      </div>
    </>
  )
}
