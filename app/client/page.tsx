import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import {
  getMyClient,
  getMyContacts,
} from '@/lib/queries/client-cabinet-data'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
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
      <>
        <CabinetHeader title="Особистий кабінет" />
        <div className={styles.scroll}>
          <p className={styles.empty}>Кабінет не привʼязано до картки клієнта. Зверніться до адміністратора.</p>
        </div>
      </>
    )
  }

  // Серверно тягнемо лише незмінне для гейту/шапки: контакти (read-only) і лейбли типів.
  // Депозит/сесії/записи/покупки кабінет вантажить сам клієнтськими хуками з realtime.
  const [
    { data: contacts },
    { data: typeLabels },
  ] = await Promise.all([
    getMyContacts(supabase, client.id),
    listTrainingTypeLabels(supabase),
  ])

  const name = [client.first_name, client.last_name].filter(Boolean).join(' ')

  return (
    <>
      <CabinetHeader title={name} subtitle="Особистий кабінет" />
      <div className={styles.scroll}>
        <ClientCabinet
          clientId={client.id}
          userId={user.id}
          initialBalance={client.balance}
          contacts={contacts}
          typeLabels={typeLabels}
        />
      </div>
    </>
  )
}
