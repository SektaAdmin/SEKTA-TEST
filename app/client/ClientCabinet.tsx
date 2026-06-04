'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { clientCancel } from '@/lib/queries/client-cabinet'
import {
  getMyClient,
  listMySessionBalances,
  listMyUpcomingEnrollments,
  listMyPurchases,
  listMyPastEnrollments,
} from '@/lib/queries/client-cabinet-data'
import type { MyPurchaseRow } from '@/lib/queries/client-cabinet-data'
import { useAsync } from '@/hooks/useAsync'
import { useListQuery } from '@/hooks/useListQuery'
import { formatMoney, formatDate } from '@/lib/formatters'
import { ticketTypeShortLabel, ticketTypeNominativeLabel, paymentLabel, paymentClass, enrollmentStatusLabel, enrollmentStatusClass } from '@/lib/badges'
import { MONTHS_UK_SHORT } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import styles from './client.module.css'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Опис одного рядка sales: покупка абонемента (з тікетом) АБО депозитна операція
// (ticket_id=null: +amount_given поповнення / −price_paid списання).
function describeSale(p: MyPurchaseRow, typeLabel: (t: string) => string): { title: string; amount: number; sign: '' | '+' | '−' } {
  if (p.ticket_id) {
    return { title: p.ticket_name ?? typeLabel(p.ticket_type ?? ''), amount: p.price_paid, sign: '' }
  }
  if (p.amount_given > 0) {
    return { title: 'Поповнення депозиту', amount: p.amount_given, sign: '+' }
  }
  return { title: 'Списання з депозиту', amount: p.price_paid, sign: '−' }
}

type Contacts = {
  phone: string | null
  instagram_username: string | null
  telegram_username: string | null
} | null

type Tab = 'upcoming' | 'archive' | 'purchases'

type Props = {
  clientId: string
  userId: string
  initialBalance: number
  contacts: Contacts
  typeLabels: Record<string, string>
}

export default function ClientCabinet({
  clientId,
  userId,
  initialBalance,
  contacts,
  typeLabels,
}: Props) {
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')

  // Межі дат рахуємо один раз на маунт — інакше new Date() щорендеру міняв би deps хуків.
  const { fromISO, nowISO } = useMemo(() => ({
    fromISO: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    nowISO: new Date().toISOString(),
  }), [])

  // Депозит: realtime по clients (баланс) + balance_transactions (лог змін).
  // initialBalance — миттєвий рендер до першого fetch (без скелета на головному числі).
  const { data: client } = useAsync(
    () => getMyClient(supabase, userId),
    [userId],
    { realtime: ['clients', 'balance_transactions'] }
  )
  const balance = client?.balance ?? initialBalance

  // Залишки занять по типах — realtime по client_session_balances (списання/повернення сесій).
  const { data: sessions } = useListQuery(
    () => listMySessionBalances(supabase, clientId),
    [clientId],
    { realtime: ['client_session_balances'] }
  )

  // Майбутні активні записи — realtime по enrollments (свій запис/відміна) + classes (скасування заняття).
  const { data: enrollments, refetch: refetchUpcoming } = useListQuery(
    () => listMyUpcomingEnrollments(supabase, clientId, fromISO),
    [clientId, fromISO],
    { realtime: ['enrollments', 'classes'], refetchOnVisible: true }
  )

  // Архів минулих записів.
  const { data: pastEnrollments } = useListQuery(
    () => listMyPastEnrollments(supabase, clientId, nowISO),
    [clientId, nowISO],
    { realtime: ['enrollments', 'classes'] }
  )

  // Усі sales: покупки абонементів + депозитні операції.
  const { data: purchases } = useListQuery(
    () => listMyPurchases(supabase, clientId),
    [clientId],
    { realtime: ['sales'] }
  )

  // Повна назва типу з БД (training_types.label); fallback — короткий ярлик.
  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  async function handleCancel(enrollmentId: string) {
    if (!confirm('Скасувати запис? Якщо до заняття лишилось мало часу, заняття буде списано.')) return
    setCancelling(enrollmentId)
    const { success, charged, error } = await clientCancel(supabase, enrollmentId)
    setCancelling(null)
    if (!success) {
      toast.error(error ?? MSG.toast.deleteFailed)
      return
    }
    // Realtime по enrollments підхопить зміну сам; refetch — миттєвий відгук без чекання сокета.
    refetchUpcoming()
    toast.success(charged ? 'Запис скасовано, заняття списано' : 'Запис скасовано')
  }

  const sorted = [...enrollments].sort(
    (a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()
  )

  const sortedPast = [...pastEnrollments].sort(
    (a, b) => new Date(b.classes!.starts_at).getTime() - new Date(a.classes!.starts_at).getTime()
  )

  // Клас бейджа балансу: >0 зелений, =0 жовтий, <0 червоний.
  function balanceClass(n: number) {
    if (n > 0) return 'balance-ok'
    if (n === 0) return 'balance-zero'
    return 'balance-warn'
  }

  // Порядок сесій визначається training_types.sort_order на рівні query.

  return (
    <>
      {(contacts?.phone || contacts?.instagram_username || contacts?.telegram_username) && (
        <section className={styles.profile}>
          {contacts?.phone && (
            <div className={styles.profileRow}>
              <span className={styles.profileLabel}>Телефон</span>
              <span className={styles.profileValue}>{contacts.phone}</span>
            </div>
          )}
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
          <p className={styles.hint}>Щоб змінити дані, зверніться до адміністратора студії.</p>
        </section>
      )}

      <section className={styles.balanceBlock}>
        <div className={styles.balanceHeader}>Баланс</div>
        <div className={styles.balanceRow}>
          <span className={styles.balanceRowLabel}>Депозит</span>
          <span className={balanceClass(balance)}>{formatMoney(balance)}</span>
        </div>
        {sessions.map(s => (
          <div key={s.ticket_type} className={styles.balanceRow}>
            <span className={styles.balanceRowLabel}>{ticketTypeNominativeLabel(s.ticket_type)}</span>
            <span className={balanceClass(s.sessions_balance)}>{s.sessions_balance} год</span>
          </div>
        ))}
      </section>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          className={`${styles.tab} ${tab === 'upcoming' ? styles.tabActive : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Майбутні
        </button>
        <button
          type="button"
          role="tab"
          className={`${styles.tab} ${tab === 'archive' ? styles.tabActive : ''}`}
          onClick={() => setTab('archive')}
        >
          Архів
        </button>
        <button
          type="button"
          role="tab"
          className={`${styles.tab} ${tab === 'purchases' ? styles.tabActive : ''}`}
          onClick={() => setTab('purchases')}
        >
          Покупки
        </button>
      </div>

      {tab === 'upcoming' &&
        (sorted.length === 0 ? (
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
                    <div className={styles.title}>{c.title || typeLabel(c.ticket_type)}</div>
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
        ))}

      {tab === 'archive' &&
        (pastEnrollments.length === 0 ? (
          <p className={styles.empty}>{MSG.empty.pastEnrollments}.</p>
        ) : (
          <ul className={styles.list}>
            {sortedPast.map(e => {
              const c = e.classes!
              const d = new Date(c.starts_at)
              return (
                <li key={e.id} className={styles.item}>
                  <div className={styles.date}>
                    <span className={styles.day}>{d.getDate()}</span>
                    <span className={styles.month}>{MONTHS_UK_SHORT[d.getMonth()]}</span>
                  </div>
                  <div className={styles.info}>
                    <div className={styles.title}>{c.title || typeLabel(c.ticket_type)}</div>
                    <div className={styles.meta}>
                      {timeOf(c.starts_at)} · {c.duration_min} хв
                      {c.trainers?.name ? ` · ${c.trainers.name}` : ''}
                      {c.halls?.name ? ` · ${c.halls.name}` : ''}
                    </div>
                  </div>
                  <span className={enrollmentStatusClass(e.status)}>{enrollmentStatusLabel(e.status)}</span>
                </li>
              )
            })}
          </ul>
        ))}

      {tab === 'purchases' &&
        (purchases.length === 0 ? (
          <p className={styles.empty}>{MSG.empty.purchases}.</p>
        ) : (
          <ul className={styles.txList}>
            {purchases.map(p => {
              const { title, amount, sign } = describeSale(p, typeLabel)
              return (
                <li key={p.id} className={styles.txItem}>
                  <div className={styles.txMain}>
                    <div className={styles.txTitle}>{title}</div>
                    <div className={styles.txMeta}>
                      {formatDate(p.created_at)}
                      {p.payment_method && (
                        <span className={paymentClass(p.payment_method)}>
                          {paymentLabel(p.payment_method)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`${styles.txAmount} ${sign === '+' ? styles.amountPos : sign === '−' ? styles.amountNeg : ''}`}
                  >
                    {sign}{formatMoney(amount)}
                  </div>
                </li>
              )
            })}
          </ul>
        ))}
    </>
  )
}
