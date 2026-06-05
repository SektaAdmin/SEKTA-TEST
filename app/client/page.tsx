import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyClient, getMyContacts } from '@/lib/queries/client-cabinet-data'
import CabinetHeader from '@/components/CabinetHeader'
import ClientHome from './ClientHome'
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

  const { data: contacts } = await getMyContacts(supabase, client.id)
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ')

  return (
    <>
      <CabinetHeader title={name || 'Особистий кабінет'} subtitle="Особистий кабінет" />
      <div className={styles.scroll}>
        <ClientHome name={name} email={user.email ?? null} contacts={contacts} />
      </div>
    </>
  )
}
