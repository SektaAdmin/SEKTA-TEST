'use client'
import { supabase } from '@/lib/supabase'
import {
  getMyClient,
  listMySessionBalances,
  listMyPurchases,
} from '@/lib/queries/client-cabinet-data'
import type { MyPurchaseRow } from '@/lib/queries/client-cabinet-data'
import { useAsync } from '@/hooks/useAsync'
import { useListQuery } from '@/hooks/useListQuery'
import { formatMoney, formatDate } from '@/lib/formatters'
import { ticketTypeShortLabel, ticketTypeNominativeLabel, paymentLabel, paymentClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import styles from '../client.module.css'

// Опис рядка sales: покупка абонемента (з тікетом) АБО депозитна операція
// (ticket_id=null: +amount_given поповнення / −price_paid списання). Snapshot інв. #5.
function describeSale(p: MyPurchaseRow, typeLabel: (t: string) => string): { title: string; amount: number; sign: '' | '+' | '−' } {
  if (p.ticket_id) {
    return { title: p.ticket_name ?? typeLabel(p.ticket_type ?? ''), amount: p.price_paid, sign: '' }
  }
  if (p.amount_given > 0) {
    return { title: 'Поповнення депозиту', amount: p.amount_given, sign: '+' }
  }
  return { title: 'Списання з депозиту', amount: p.price_paid, sign: '−' }
}

// Клас бейджа балансу: >0 зелений, =0 жовтий, <0 червоний.
function balanceClass(n: number) {
  if (n > 0) return 'balance-ok'
  if (n === 0) return 'balance-zero'
  return 'balance-warn'
}

type Props = {
  clientId: string
  userId: string
  initialBalance: number
  typeLabels: Record<string, string>
}

export default function ClientSubscriptions({ clientId, userId, initialBalance, typeLabels }: Props) {
  const { data: client } = useAsync(
    () => getMyClient(supabase, userId),
    [userId],
    { realtime: ['clients', 'balance_transactions'] }
  )
  const balance = client?.balance ?? initialBalance

  const { data: sessions } = useListQuery(
    () => listMySessionBalances(supabase, clientId),
    [clientId],
    { realtime: ['client_session_balances'] }
  )

  const { data: purchases } = useListQuery(
    () => listMyPurchases(supabase, clientId),
    [clientId],
    { realtime: ['sales'] }
  )

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  return (
    <>
      <div className={styles.sectionLabel}>Баланс</div>
      <section className={styles.balanceBlock}>
        <div className={styles.depositRow}>
          <span className={styles.depositLabel}>Депозит</span>
          <span className={balanceClass(balance)}>{formatMoney(balance)}</span>
        </div>
        {sessions.map(s => (
          <div key={s.ticket_type} className={styles.balanceRow}>
            <span className={styles.balanceRowLabel}>{ticketTypeNominativeLabel(s.ticket_type)}</span>
            <span className={balanceClass(s.sessions_balance)}>{s.sessions_balance} год</span>
          </div>
        ))}
      </section>

      <div className={styles.sectionLabel}>Історія покупок</div>
      {purchases.length === 0 ? (
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
                <span className={`${styles.amountBadge} ${sign === '+' ? styles.amountPos : sign === '−' ? styles.amountNeg : styles.amountNeutral}`}>
                  {sign}{formatMoney(amount)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
