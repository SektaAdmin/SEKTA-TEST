import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import {
  getMyClient,
  listMyRunningBalances,
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

  const fromISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

  const [
    { data: typeLabels },
    { data: balanceAfter },
    { data: upcoming },
    { data: past, totalCount: pastTotal },
  ] = await Promise.all([
    listTrainingTypeLabels(supabase),
    listMyRunningBalances(supabase, client.id, fromISO),
    listMyUpcomingEnrollments(supabase, client.id, fromISO),
    listMyPastEnrollments(supabase, client.id),
  ])

  return (
    <>
      <CabinetHeader title="Мої візити" backHref="/client" hideLogout />
      <div className={styles.scroll}>
        <ClientVisits
          clientId={client.id}
          typeLabels={typeLabels}
          initialBalanceAfter={balanceAfter}
          initialUpcoming={upcoming}
          initialPast={past}
          initialPastTotal={pastTotal}
        />
      </div>
    </>
  )
}
