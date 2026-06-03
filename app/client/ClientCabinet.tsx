'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { clientCancel } from '@/lib/queries/client-cabinet'
import type {
  MyEnrollmentRow,
  MyPurchaseRow,
  MyBalanceTxRow,
} from '@/lib/queries/client-cabinet-data'
import { formatMoney, formatDateShort } from '@/lib/formatters'
import { ticketTypeShortLabel, paymentLabel, transactionTypeLabel } from '@/lib/badges'
import { MONTHS_UK_SHORT } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import styles from './client.module.css'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Contacts = {
  phone: string | null
  instagram_username: string | null
  telegram_username: string | null
} | null

type Props = {
  name: string
  balance: number
  sessions: { ticket_type: string; sessions_balance: number }[]
  enrollments: MyEnrollmentRow[]
  contacts: Contacts
  purchases: MyPurchaseRow[]
  transactions: MyBalanceTxRow[]
}

export default function ClientCabinet({
  name,
  balance,
  sessions,
  enrollments: initial,
  contacts,
  purchases,
  transactions,
}: Props) {
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
        <p className={styles.empty}>{MSG.empty.futureEnrollments}.</p>
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

      <h2 className={styles.sectionTitle}>Покупки</h2>
      {purchases.length === 0 ? (
        <p className={styles.empty}>{MSG.empty.purchases}.</p>
      ) : (
        <ul className={styles.txList}>
          {purchases.map(p => (
            <li key={p.id} className={styles.txItem}>
              <div className={styles.txMain}>
                <div className={styles.txTitle}>{p.ticket_name}</div>
                <div className={styles.txMeta}>
                  {formatDateShort(p.created_at)} · {p.sessions} занять · {paymentLabel(p.payment_method)}
                </div>
              </div>
              <div className={styles.txAmount}>{formatMoney(p.price_paid)}</div>
            </li>
          ))}
        </ul>
      )}

      <h2 className={styles.sectionTitle}>Рух депозиту</h2>
      {transactions.length === 0 ? (
        <p className={styles.empty}>{MSG.empty.transactions}.</p>
      ) : (
        <ul className={styles.txList}>
          {transactions.map(t => (
            <li key={t.id} className={styles.txItem}>
              <div className={styles.txMain}>
                <div className={styles.txTitle}>{transactionTypeLabel(t.transaction_type)}</div>
                {t.description && <div className={styles.txMeta}>{t.description}</div>}
                {t.created_at && <div className={styles.txMeta}>{formatDateShort(t.created_at)}</div>}
              </div>
              <div className={`${styles.txAmount} ${t.amount < 0 ? styles.amountNeg : styles.amountPos}`}>
                {t.amount > 0 ? '+' : ''}
                {formatMoney(t.amount)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className={styles.sectionTitle}>Профіль</h2>
      <section className={styles.profile}>
        <div className={styles.profileRow}>
          <span className={styles.profileLabel}>Імʼя</span>
          <span className={styles.profileValue}>{name || '—'}</span>
        </div>
        <div className={styles.profileRow}>
          <span className={styles.profileLabel}>Телефон</span>
          <span className={styles.profileValue}>{contacts?.phone || '—'}</span>
        </div>
        {contacts?.instagram_username && (
          <div className={styles.profileRow}>
            <span className={styles.profileLabel}>Instagram</span>
            <span className={styles.profileValue}>@{contacts.instagram_username}</span>
          </div>
        )}
        {contacts?.telegram_username && (
          <div className={styles.profileRow}>
            <span className={styles.profileLabel}>Telegram</span>
            <span className={styles.profileValue}>@{contacts.telegram_username}</span>
          </div>
        )}
        <div className={styles.profileRow}>
          <span className={styles.profileLabel}>Депозит</span>
          <span className={styles.profileValue}>{formatMoney(balance)}</span>
        </div>
        <p className={styles.hint}>Щоб змінити дані, зверніться до адміністратора студії.</p>
      </section>
    </>
  )
}
