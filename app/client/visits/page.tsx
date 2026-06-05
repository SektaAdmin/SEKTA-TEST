import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyClient, listMySessionBalances } from '@/lib/queries/client-cabinet-data'
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

  const [{ data: typeLabels }, { data: sessionBalances }] = await Promise.all([
    listTrainingTypeLabels(supabase),
    listMySessionBalances(supabase, client.id),
  ])

  return (
    <>
      <CabinetHeader title="Мої візити" backHref="/client" hideLogout />
      <div className={styles.scroll}>
        <ClientVisits clientId={client.id} typeLabels={typeLabels} sessionBalances={sessionBalances} />
      </div>
    </>
  )
}
