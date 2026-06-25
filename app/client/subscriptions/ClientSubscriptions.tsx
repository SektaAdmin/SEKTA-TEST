'use client'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getMyClient,
  listMySessionBalances,
  listMyPurchases,
} from '@/lib/queries/client-cabinet-data'
import type { MyPurchaseRow } from '@/lib/queries/client-cabinet-data'
import CabinetHeader from '@/components/CabinetHeader'
import { useAsync } from '@/hooks/useAsync'
import { useListQuery } from '@/hooks/useListQuery'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { formatMoney, formatDate } from '@/lib/formatters'
import { ticketTypeShortLabel, ticketTypeNominativeLabel, clientPaymentClass, clientPaymentLabel } from '@/lib/badges'
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
    // price_paid>0 — реальне списання зі знаком «−». Вироджений рядок (0/0) не
    // повинен показувати «−0 ₴»: знак прибираємо, лишаємо нейтральний нуль.
    return {
      title: 'Списання з депозиту',
      amount: p.price_paid,
      sign: p.price_paid > 0 ? '−' : '',
      deposit: null,
      total: null,
    }
  }

  // ticket_name (адмінський free-text) може бути порожнім; typeLabel за
  // невідомим/null кодом повертає сирий код або ''. Гарантуємо непорожній
  // заголовок, щоб рядок історії ніколи не лишився без назви.
  const title =
    p.ticket_name?.trim() ||
    (p.ticket_type ? typeLabel(p.ticket_type) : '') ||
    'Абонемент'
  const diff = p.amount_given - p.price_paid

  // Безкоштовний/компенсований абонемент (ціна 0) — нічого не списано й не дано.
  // Без фантомного «З депозиту −0 ₴»: показуємо нейтральний нульовий рядок.
  if (p.price_paid === 0 && p.amount_given === 0) {
    return { title, amount: 0, sign: '', deposit: null, total: null }
  }

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

/* Іконки у словнику проекту: 16×16, fill=none, stroke=currentColor, 1.4. */
function ReceiptIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3.5 2v12l1.5-1 1.5 1 1.5-1 1.5 1 1.5-1 1.5 1V2L11 3 9.5 2 8 3 6.5 2 5 3 3.5 2Z" strokeLinejoin="round" />
      <line x1="5.75" y1="6" x2="10.25" y2="6" />
      <line x1="5.75" y1="9" x2="10.25" y2="9" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="8" cy="8" r="6" />
      <line x1="8" y1="5" x2="8" y2="8.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.35" fill="currentColor" stroke="none" />
    </svg>
  )
}

/* Спокійна плашка помилки завантаження секції — єдиний словник для обох
   секцій (баланс / історія), щоб не дублювати інлайн-стиль. */
function SectionError() {
  return (
    <div className={styles.sectionError} role="alert">
      <AlertIcon />
      <span>Не вдалося завантажити. Потягніть вниз, щоб оновити.</span>
    </div>
  )
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
  const { data: balanceData, error: balanceError, refetch: refetchBalance } = useAsync(
    async () => {
      const { data, error } = await getMyClient(supabase, userId)
      return { data: data ? { balance: data.balance } : null, error }
    },
    [userId],
    { refetchOnVisible: true, initialData: { balance: initialBalance } }
  )
  const balance = balanceData?.balance ?? initialBalance

  const { data: sessions, error: sessionsError, refetch: refetchSessions } = useListQuery(
    () => listMySessionBalances(supabase, clientId),
    [clientId],
    { refetchOnVisible: true, initialData: initialSessions }
  )

  const { data: purchases, total: purchasesFetchedTotal, error: purchasesError, refetch: refetchPurchases } = useListQuery(
    async () => {
      const { data, totalCount, error } = await listMyPurchases(supabase, clientId)
      return { data, count: totalCount, error }
    },
    [clientId],
    { refetchOnVisible: true, initialData: initialPurchases }
  )
  const purchasesTotal = purchasesFetchedTotal || initialPurchasesTotal

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  // Pull-to-refresh: тягне баланс+сесії+покупки разом (той самий шлях, що й
  // refetchOnVisible). Жест активний лише від верху .scroll.
  const scrollRef = useRef<HTMLDivElement>(null)
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchBalance(), refetchSessions(), refetchPurchases()])
  }, [refetchBalance, refetchSessions, refetchPurchases])
  const { pull, refreshing, releasing, progress, ready } = usePullToRefresh(scrollRef, handleRefresh)

  // Озвучення pull-to-refresh для скрін-рідерів: візуальний спінер aria-hidden,
  // тож стан оновлення доносимо текстом у polite live-region («Оновлення…» →
  // «Оновлено»). Без цього незрячий користувач не знає, що жест спрацював.
  const [refreshStatus, setRefreshStatus] = useState('')
  const wasRefreshing = useRef(false)
  useEffect(() => {
    if (refreshing) {
      setRefreshStatus('Оновлення…')
      wasRefreshing.current = true
    } else if (wasRefreshing.current) {
      wasRefreshing.current = false
      setRefreshStatus('Оновлено')
    }
  }, [refreshing])

  return (
    <>
      <CabinetHeader title="Абонементи" backHref="/client" hideLogout />
      <span className="sr-only" role="status" aria-live="polite">{refreshStatus}</span>
      <div ref={scrollRef} className={styles.scroll}>
        <div
          className={`${styles.ptrIndicator} ${releasing ? styles.ptrReleasing : ''}`}
          style={{ height: pull, opacity: pull > 0 ? 1 : 0 }}
          aria-hidden
        >
          <span
            className={`${styles.ptrSpinner} ${refreshing ? styles.ptrSpinning : ''} ${ready && !refreshing ? styles.ptrSpinnerReady : ''}`}
            style={{ '--ptr-progress': progress } as CSSProperties}
          />
        </div>
      <h2 className={styles.sectionLabel}>Залишок занять</h2>
      {(balanceError || sessionsError) ? (
        <SectionError />
      ) : (
        <section className={styles.balanceBlock}>
          {/* Головне — кількість занять (год): клієнт відкриває екран, щоб знати,
              скільки лишилось записатись. Крупна цифра, читається з відстані. */}
          {sessions.length === 0 && (
            <div className={styles.balanceEmpty}>Поки немає активних абонементів</div>
          )}
          {sessions.map(s => (
            <div key={s.ticket_type} className={styles.balanceRow}>
              <span className={styles.balanceRowLabel}>{ticketTypeNominativeLabel(s.ticket_type)}</span>
              {s.sessions_balance > 0 ? (
                <span className={styles.balanceSessions}>
                  <span className={styles.balanceSessionsNum}>{s.sessions_balance}</span>
                  <span className={styles.balanceSessionsUnit}>год</span>
                </span>
              ) : (
                <span className={styles.balanceZero}>Вичерпано</span>
              )}
            </div>
          ))}
          {/* Депозит — другорядний (гроші), рядком знизу під розділювачем. */}
          <div className={styles.depositRow}>
            <span className={styles.depositLabel}>Депозит</span>
            <span className={`${styles.depositValue} ${balance < 0 ? styles.depositValueNeg : balance === 0 ? styles.depositValueZero : ''}`}>{formatMoney(balance)}</span>
          </div>
        </section>
      )}

      <h2 className={`${styles.sectionLabel} ${styles.sectionLabelGap}`}>Історія покупок</h2>
      {purchasesError ? (
        <SectionError />
      ) : purchases.length === 0 ? (
        <div className={styles.emptyCard}>
          <ReceiptIcon />
          <div className={styles.emptyCardTitle}>{MSG.empty.purchases}</div>
          <p className={styles.emptyCardHint}>
            Тут зʼявляться ваші абонементи й поповнення депозиту після оплати в студії.
          </p>
        </div>
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
                        <span className={clientPaymentClass(p.payment_method)}>
                          {clientPaymentLabel(p.payment_method)}
                        </span>
                      )}
                    </div>
                  </div>
                  {amount !== null && (
                    <span className={`${styles.amount} ${sign === '+' ? styles.amountPos : sign === '−' ? styles.amountNeg : ''}`}>
                      {sign}{formatMoney(amount)}
                    </span>
                  )}
                </div>
                {deposit && (
                  <div className={styles.txDepositRow}>
                    <span>{deposit.label}</span>
                    <span className={`${styles.amount} ${deposit.sign === '+' ? styles.amountPos : styles.amountNeg}`}>
                      {deposit.sign}{formatMoney(deposit.amount)}
                    </span>
                  </div>
                )}
                {total !== null && (
                  <div className={`${styles.txDepositRow} ${styles.txTotalRow}`}>
                    <span>Всього</span>
                    <span className={styles.amount}>
                      {formatMoney(total)}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {purchases.length < purchasesTotal && (
          // Список обмежено останніми 100 записами (listMyPurchases). Без «завантажити
          // ще» — тож копія чесна: це найновіші N, а не «N з total, решта десь є».
          <p className={styles.listFooterNote}>Показано {purchases.length} найновіших записів</p>
        )}
        </>
      )}
      </div>
    </>
  )
}
