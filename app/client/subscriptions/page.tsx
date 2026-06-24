import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import {
  getMyClient,
  listMySessionBalances,
  listMyPurchases,
} from '@/lib/queries/client-cabinet-data'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import ClientSubscriptions from './ClientSubscriptions'

export const dynamic = 'force-dynamic'

export default async function ClientSubscriptionsPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'trainer') redirect('/trainer')

  const { data: client } = await getMyClient(supabase, user.id)
  if (!client) redirect('/client')

  const [
    { data: typeLabels },
    { data: sessions },
    { data: purchases, totalCount: purchasesTotal },
  ] = await Promise.all([
    listTrainingTypeLabels(supabase),
    listMySessionBalances(supabase, client.id),
    listMyPurchases(supabase, client.id),
  ])

  return (
    <ClientSubscriptions
      clientId={client.id}
      userId={user.id}
      initialBalance={client.balance}
      typeLabels={typeLabels}
      initialSessions={sessions}
      initialPurchases={purchases}
      initialPurchasesTotal={purchasesTotal}
    />
  )
}
