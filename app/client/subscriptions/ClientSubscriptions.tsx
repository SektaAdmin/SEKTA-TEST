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
import { ticketTypeShortLabel, ticketTypeNominativeLabel, paymentLabel, paymentClass, clientPaymentLabel, balanceClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import styles from '../client.module.css'

type SaleDesc = {
  title: string
  // null = не показувати суму у шапці (повна оплата з депозиту)
  amount: number | null
  // депозитний рядок знизу: null = не показувати
  deposit: { label: string; amount: number; sign: '+' | '−' } | null
  // для депозитних операцій без тікета
  sign: '' | '+' | '−'
  // рядок «Всього» — показується лише коли решта пішла на депозит (amount_given)
  total: number | null
}

function describeSale(p: MyPurchaseRow, typeLabel: (t: string) => string): SaleDesc {
  // Депозитна операція без абонемента (ticket_id=null)
  if (!p.ticket_id) {
    if (p.amount_given > 0) {
      return { title: 'Поповнення депозиту', amount: p.amount_given, sign: '+', deposit: null, total: null }
    }
    return { title: 'Списання з депозиту', amount: p.price_paid, sign: '−', deposit: null, total: null }
  }

  const title = p.ticket_name ?? typeLabel(p.ticket_type ?? '')
  const diff = p.amount_given - p.price_paid

  // Повна оплата з депозиту (amount_given=0)
  if (p.amount_given === 0) {
    return { title, amount: null, sign: '', deposit: { label: 'З депозиту', amount: p.price_paid, sign: '−' }, total: null }
  }
  // Решта пішла на депозит — показуємо «Всього» (amount_given = скільки клієнт дав)
  if (diff > 0) {
    return { title, amount: p.price_paid, sign: '', deposit: { label: 'Решта на депозит', amount: diff, sign: '+' }, total: p.amount_given }
  }
  // Часткова оплата з депозиту (amount_given < price_paid)
  if (diff < 0) {
    return { title, amount: p.price_paid, sign: '', deposit: { label: 'З депозиту', amount: -diff, sign: '−' }, total: null }
  }
  // Звичайна покупка
  return { title, amount: p.price_paid, sign: '', deposit: null, total: null }
}

type Props = {
  clientId: string
  userId: string
  initialBalance: number
  typeLabels: Record<string, string>
  initialSessions: { ticket_type: string; sessions_balance: number }[]
  initialPurchases: MyPurchaseRow[]
  initialPurchasesTotal: number
}

export default function ClientSubscriptions({
  clientId,
  userId,
  initialBalance,
  typeLabels,
  initialSessions,
  initialPurchases,
  initialPurchasesTotal,
}: Props) {
  // Усе прийшло зі сервера (initialData) — без realtime, без дубль-запиту.
  // Свіжість балансу/покупок — через refetchOnVisible (повернення з чату з
  // адміном, який списав заняття / провів продаж).
  const { data: balanceData, error: balanceError } = useAsync(
    async () => {
      const { data, error } = await getMyClient(supabase, userId)
      return { data: data ? { balance: data.balance } : null, error }
    },
    [userId],
    { refetchOnVisible: true, initialData: { balance: initialBalance } }
  )
  const balance = balanceData?.balance ?? initialBalance

  const { data: sessions, error: sessionsError } = useListQuery(
    () => listMySessionBalances(supabase, clientId),
    [clientId],
    { refetchOnVisible: true, initialData: initialSessions }
  )

  const { data: purchases, total: purchasesFetchedTotal, error: purchasesError } = useListQuery(
    async () => {
      const { data, totalCount, error } = await listMyPurchases(supabase, clientId)
      return { data, count: totalCount, error }
    },
    [clientId],
    { refetchOnVisible: true, initialData: initialPurchases }
  )
  const purchasesTotal = purchasesFetchedTotal || initialPurchasesTotal

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  return (
    <>
      <div className={styles.sectionLabel}>Баланс</div>
      {(balanceError || sessionsError) ? (
        <p className="badge-danger" style={{ padding: '10px 12px', borderRadius: 8 }}>
          Помилка завантаження. Спробуйте оновити сторінку.
        </p>
      ) : (
        <section className={styles.balanceBlock}>
          <div className={styles.depositRow}>
            <span className={styles.depositLabel}>Депозит</span>
            <span className={balanceClass(balance)}>{formatMoney(balance)}</span>
          </div>
          {sessions.map(s => (
            <div key={s.ticket_type} className={styles.balanceRow}>
              <span className={styles.balanceRowLabel}>{ticketTypeNominativeLabel(s.ticket_type)}</span>
              <span className={s.sessions_balance > 0 ? balanceClass(s.sessions_balance) : styles.balanceZero}>
                {s.sessions_balance > 0 ? `${s.sessions_balance} год` : 'Вичерпано'}
              </span>
            </div>
          ))}
        </section>
      )}

      <div className={styles.sectionLabel}>Історія покупок</div>
      {purchasesError ? (
        <p className="badge-danger" style={{ padding: '10px 12px', borderRadius: 8 }}>
          Помилка завантаження. Спробуйте оновити сторінку.
        </p>
      ) : purchases.length === 0 ? (
        <p className={styles.empty}>{MSG.empty.purchases}.</p>
      ) : (
        <>
        <ul className={styles.txList}>
          {purchases.map(p => {
            const { title, amount, sign, deposit, total } = describeSale(p, typeLabel)
            return (
              <li key={p.id} className={styles.txItem}>
                <div className={styles.txItemMain}>
                  <div className={styles.txMain}>
                    <div className={styles.txTitle}>{title}</div>
                    <div className={styles.txMeta}>
                      {formatDate(p.created_at)}
                      {p.payment_method && (
                        <span className={paymentClass(p.payment_method)}>
                          {clientPaymentLabel(p.payment_method)}
                        </span>
                      )}
                    </div>
                  </div>
                  {amount !== null && (
                    <span className={`${styles.amountBadge} ${sign === '+' ? styles.amountPos : sign === '−' ? styles.amountNeg : styles.amountNeutral}`}>
                      {sign}{formatMoney(amount)}
                    </span>
                  )}
                </div>
                {deposit && (
                  <div className={styles.txDepositRow}>
                    <span>{deposit.label}</span>
                    <span className={`${styles.amountBadge} ${deposit.sign === '+' ? styles.amountPos : styles.amountNeg}`}>
                      {deposit.sign}{formatMoney(deposit.amount)}
                    </span>
                  </div>
                )}
                {total !== null && (
                  <div className={`${styles.txDepositRow} ${styles.txTotalRow}`}>
                    <span>Всього</span>
                    <span className={`${styles.amountBadge} ${styles.amountNeutral}`}>
                      {formatMoney(total)}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {purchases.length < purchasesTotal && (
          <p className={styles.listFooterNote}>Показано {purchases.length} з {purchasesTotal}</p>
        )}
        </>
      )}
    </>
  )
}
