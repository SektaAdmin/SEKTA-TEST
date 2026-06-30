'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  listSessionDebtorsAll,
  listNegativeBalanceClients,
  type SessionDebtorsTable,
} from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { useAsync } from '@/hooks/useAsync'
import { BlockError } from './BlockError'
import styles from '../dashboard.module.css'

type NegClient = { id: string; name: string; balance: number }
const EMPTY_TABLE: SessionDebtorsTable = { columns: [], rows: [] }

/* Блок боржників: дві колонки.
   1) По сесіях — таблиця: рядок = клієнт, колонки = типи занять (лише ті,
      де є боржники), у клітинках від'ємний залишок занять.
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
          sessionTable: sessRes.data,
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

  const sessionTable = data?.sessionTable ?? EMPTY_TABLE
  const negClients: NegClient[] = data?.negClients ?? []

  return (
    <section className={`${styles.block} ${styles.equalBlock} ${styles.debtorLists}`}>
      <div className={styles.debtorSub}>
        <h2 className={styles.blockTitle}>Боржники по сесіях</h2>
        <div className={styles.scrollBody}>
          {loading && <Loader />}
          {error && <BlockError onRetry={refetch} />}
          {!loading && !error && sessionTable.rows.length === 0 && (
            <div className={styles.empty}>Боржників немає</div>
          )}
          {!loading && !error && sessionTable.rows.length > 0 && (
            <table className={styles.debtTable}>
              <thead>
                <tr>
                  <th className={styles.debtTableName}>Клієнт</th>
                  {sessionTable.columns.map(c => (
                    <th key={c.ticketType} className={styles.debtTableCol}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionTable.rows.map(r => (
                  <tr key={r.clientId}>
                    <td className={styles.debtTableName}>{r.name}</td>
                    {sessionTable.columns.map(c => {
                      const v = r.balances[c.ticketType]
                      return (
                        <td key={c.ticketType} className={styles.debtTableCol}>
                          {v == null ? <span className={styles.debtTableDash}>—</span> : <span className="balance-warn">{v}</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className={styles.debtorSub}>
        <h2 className={styles.blockTitle}>Боржники по депозиту</h2>
        <div className={styles.scrollBody}>
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
        </div>
      </div>
    </section>
  )
}

function Loader() {
  return (
    <div className="loading-dots" role="status" aria-label="Завантаження...">
      <span /><span /><span />
    </div>
  )
}
