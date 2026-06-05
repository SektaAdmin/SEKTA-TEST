import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyClient } from '@/lib/queries/client-cabinet-data'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import CabinetHeader from '@/components/CabinetHeader'
import ClientSubscriptions from './ClientSubscriptions'
import styles from '../client.module.css'

export const dynamic = 'force-dynamic'

export default async function ClientSubscriptionsPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'trainer') redirect('/trainer')

  const { data: client } = await getMyClient(supabase, user.id)
  if (!client) redirect('/client')

  const { data: typeLabels } = await listTrainingTypeLabels(supabase)

  return (
    <>
      <CabinetHeader title="Абонементи" backHref="/client" />
      <div className={styles.scroll}>
        <ClientSubscriptions
          clientId={client.id}
          userId={user.id}
          initialBalance={client.balance}
          typeLabels={typeLabels}
        />
      </div>
    </>
  )
}
