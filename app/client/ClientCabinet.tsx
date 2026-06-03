'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { clientCancel } from '@/lib/queries/client-cabinet'
import type { MyEnrollmentRow } from '@/lib/queries/client-cabinet-data'
import { formatMoney } from '@/lib/formatters'
import { ticketTypeShortLabel } from '@/lib/badges'
import { MONTHS_UK_SHORT } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import styles from './client.module.css'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Props = {
  balance: number
  sessions: { ticket_type: string; sessions_balance: number }[]
  enrollments: MyEnrollmentRow[]
}

export default function ClientCabinet({ balance, sessions, enrollments: initial }: Props) {
  const [enrollments, setEnrollments] = useState(initial)
  const [cancelling, setCancelling] = useState<string | null>(null)

  async function handleCancel(enrollmentId: string) {
    if (!confirm('Скасувати запис? Якщо до заняття лишилось мало часу, заняття буде списано.')) return
    setCancelling(enrollmentId)
    const { success, charged, error } = await clientCancel(supabase, enrollmentId)
    setCancelling(null)
    if (!success) {
      toast.error(error ?? MSG.toast.deleteFailed)
      return
    }
    setEnrollments(prev => prev.filter(e => e.id !== enrollmentId))
    toast.success(charged ? 'Запис скасовано, заняття списано' : 'Запис скасовано')
  }

  const sorted = [...enrollments].sort(
    (a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()
  )

  return (
    <>
      <section className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Депозит</div>
          <div className={styles.cardValue}>{formatMoney(balance)}</div>
        </div>
        {sessions.map(s => (
          <div key={s.ticket_type} className={styles.card}>
            <div className={styles.cardLabel}>{ticketTypeShortLabel(s.ticket_type)}</div>
            <div className={styles.cardValue}>{s.sessions_balance}</div>
          </div>
        ))}
      </section>

      <h2 className={styles.sectionTitle}>Мої записи</h2>
      {sorted.length === 0 ? (
        <p className={styles.empty}>Немає майбутніх записів.</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map(e => {
            const c = e.classes!
            const d = new Date(c.starts_at)
            return (
              <li key={e.id} className={`${styles.item} ${c.is_cancelled ? styles.cancelled : ''}`}>
                <div className={styles.date}>
                  <span className={styles.day}>{d.getDate()}</span>
                  <span className={styles.month}>{MONTHS_UK_SHORT[d.getMonth()]}</span>
                </div>
                <div className={styles.info}>
                  <div className={styles.title}>{c.title || ticketTypeShortLabel(c.ticket_type)}</div>
                  <div className={styles.meta}>
                    {timeOf(c.starts_at)} · {c.duration_min} хв
                    {c.trainers?.name ? ` · ${c.trainers.name}` : ''}
                    {c.halls?.name ? ` · ${c.halls.name}` : ''}
                  </div>
                  {e.status === 'waitlist' && <div className={styles.waitlist}>У черзі</div>}
                </div>
                {c.is_cancelled ? (
                  <span className={styles.badge}>Скасовано</span>
                ) : (
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => handleCancel(e.id)}
                    disabled={cancelling === e.id}
                  >
                    {cancelling === e.id ? '…' : 'Скасувати'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
