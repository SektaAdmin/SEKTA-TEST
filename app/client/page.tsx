import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import {
  getMyClient,
  getMyContacts,
  listMySessionBalances,
  listMyUpcomingEnrollments,
  listMyPurchases,
  listMyPastEnrollments,
} from '@/lib/queries/client-cabinet-data'
import CabinetHeader from '@/components/CabinetHeader'
import ClientCabinet from './ClientCabinet'
import styles from './client.module.css'

export const dynamic = 'force-dynamic'

export default async function ClientCabinetPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'trainer') redirect('/trainer')

  const { data: client } = await getMyClient(supabase, user.id)

  if (!client) {
    return (
      <div className={styles.page}>
        <CabinetHeader title="Особистий кабінет" />
        <p className={styles.empty}>Кабінет не привʼязано до картки клієнта. Зверніться до адміністратора.</p>
      </div>
    )
  }

  const fromISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const nowISO = new Date().toISOString()
  const [{ data: sessions }, { data: enrollments }, { data: contacts }, { data: purchases }, { data: pastEnrollments }] =
    await Promise.all([
      listMySessionBalances(supabase, client.id),
      listMyUpcomingEnrollments(supabase, client.id, fromISO),
      getMyContacts(supabase, client.id),
      listMyPurchases(supabase, client.id),
      listMyPastEnrollments(supabase, client.id, nowISO),
    ])

  const name = [client.first_name, client.last_name].filter(Boolean).join(' ')

  return (
    <div className={styles.page}>
      <CabinetHeader title={name} subtitle="Особистий кабінет" />
      <ClientCabinet
        name={name}
        balance={client.balance}
        sessions={sessions}
        enrollments={enrollments}
        contacts={contacts}
        purchases={purchases}
        pastEnrollments={pastEnrollments}
      />
    </div>
  )
}
