import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { roleFromUser } from '@/lib/auth/role'
import { getMyTrainer, listMyUpcomingClasses } from '@/lib/queries/trainer-cabinet'
import CabinetHeader from '@/components/CabinetHeader'
import { MONTHS_UK_SHORT } from '@/lib/dateUtils'
import styles from './trainer.module.css'

export const dynamic = 'force-dynamic'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default async function TrainerCabinet() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const role = roleFromUser(user)
  if (role === 'client') redirect('/client')

  const { data: trainer } = await getMyTrainer(supabase, user.id)

  if (!trainer) {
    return (
      <div className={styles.page}>
        <CabinetHeader title="Кабінет тренера" />
        <p className={styles.empty}>Профіль тренера не привʼязано до цього логіну. Зверніться до адміністратора.</p>
      </div>
    )
  }

  const fromISO = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const { data: classes } = await listMyUpcomingClasses(supabase, trainer.id, fromISO)

  return (
    <div className={styles.page}>
      <CabinetHeader title={trainer.name} subtitle="Мій розклад" />
      {classes.length === 0 ? (
        <p className={styles.empty}>Найближчих занять немає.</p>
      ) : (
        <ul className={styles.list}>
          {classes.map(c => {
            const d = new Date(c.starts_at)
            return (
              <li key={c.id} className={`${styles.item} ${c.is_cancelled ? styles.cancelled : ''}`}>
                <div className={styles.date}>
                  <span className={styles.day}>{d.getDate()}</span>
                  <span className={styles.month}>{MONTHS_UK_SHORT[d.getMonth()]}</span>
                </div>
                <div className={styles.info}>
                  <div className={styles.title}>{c.title || c.ticket_type}</div>
                  <div className={styles.meta}>
                    {timeOf(c.starts_at)} · {c.duration_min} хв
                    {c.halls?.name ? ` · ${c.halls.name}` : ''}
                  </div>
                  {c.choreo_stage && <div className={styles.choreo}>Етап: {c.choreo_stage}</div>}
                </div>
                {c.is_cancelled && <span className={styles.badge}>Скасовано</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
