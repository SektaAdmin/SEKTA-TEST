'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  listSessionDebtorsAll,
  listNegativeBalanceClients,
  type SessionDebtorTypeGroup,
} from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { useAsync } from '@/hooks/useAsync'
import { BlockError } from './BlockError'
import styles from '../dashboard.module.css'

type NegClient = { id: string; name: string; balance: number }

/* Блок боржників: два списки.
   1) По сесіях — усі клієнти з від'ємним залишком занять (будь-який тип),
      згруповано по типу квитка.
   2) По депозиту — клієнти з від'ємним грошовим балансом (на весь час). */
export function DebtorListsBlock({ date }: { date: string }) {
  const { data, loading, error, refetch } = useAsync(
    async () => {
      const [sessRes, negRes] = await Promise.all([
        listSessionDebtorsAll(supabase),
        listNegativeBalanceClients(supabase),
      ])
      return {
        data: {
          sessionGroups: sessRes.data,
          negClients: negRes.data,
        },
        error: sessRes.error ?? negRes.error ?? null,
      }
    },
    [date],
    { realtime: ['client_session_balances', 'balance_transactions'] }
  )

  useEffect(() => {
    if (error) console.error('[DebtorListsBlock]', error)
  }, [error])

  const sessionGroups: SessionDebtorTypeGroup[] = data?.sessionGroups ?? []
  const negClients: NegClient[] = data?.negClients ?? []

  return (
    <section className={`${styles.block} ${styles.equalBlock} ${styles.debtorLists}`}>
      <SubList title="Боржники по сесіях">
        {loading && <Loader />}
        {error && <BlockError onRetry={refetch} />}
        {!loading && !error && sessionGroups.length === 0 && (
          <div className={styles.empty}>Боржників немає</div>
        )}
        {!loading && !error && sessionGroups.map(g => (
          <div key={g.ticketType} className={styles.debtGroup}>
            <div className={styles.debtGroupHead}>{g.typeLabel}</div>
            {g.clients.map((c, i) => (
              <div key={`${c.name}-${i}`} className={styles.debtClient}>
                <span>{c.name}</span>
                <span className="balance-warn">{c.balance}</span>
              </div>
            ))}
          </div>
        ))}
      </SubList>

      <SubList title="Боржники по депозиту">
        {loading && <Loader />}
        {error && <BlockError onRetry={refetch} />}
        {!loading && !error && negClients.length === 0 && (
          <div className={styles.empty}>Боржників немає</div>
        )}
        {!loading && !error && negClients.map(c => (
          <div key={c.id} className={styles.debtClient}>
            <span>{c.name}</span>
            <span className="balance-warn">{formatMoney(c.balance)}</span>
          </div>
        ))}
      </SubList>
    </section>
  )
}

function SubList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.debtorSub}>
      <h3 className={styles.debtorSubTitle}>{title}</h3>
      <div className={styles.scrollBody}>{children}</div>
    </div>
  )
}

function Loader() {
  return (
    <div className="loading-dots" role="status" aria-label="Завантаження...">
      <span /><span /><span />
    </div>
  )
}
