'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { listSessionDebtorsAll, type SessionDebtorsTable } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { useAsync } from '@/hooks/useAsync'
import { BlockError } from './BlockError'
import styles from '../dashboard.module.css'

const EMPTY_TABLE: SessionDebtorsTable = { columns: [], rows: [] }

/* Блок боржників: одна таблиця. Рядок = клієнт (будь-який мінус — по сесіях
   або по депозиту). Колонки = типи занять (лише з боржниками) + окрема
   колонка «Депозит» (₴). Клітинки занять — мінус занять, депозит — мінус ₴. */
export function DebtorListsBlock({ date }: { date: string }) {
  const { data, loading, error, refetch } = useAsync(
    () => listSessionDebtorsAll(supabase),
    [date],
    { realtime: ['client_session_balances', 'balance_transactions'] }
  )

  useEffect(() => {
    if (error) console.error('[DebtorListsBlock]', error)
  }, [error])

  const table = data ?? EMPTY_TABLE

  return (
    <section className={`${styles.block} ${styles.equalBlock}`}>
      <h2 className={styles.blockTitle}>Боржники по сесіях</h2>
      <div className={styles.scrollBody}>
        {loading && <Loader />}
        {error && <BlockError onRetry={refetch} />}
        {!loading && !error && table.rows.length === 0 && (
          <div className={styles.empty}>Боржників немає</div>
        )}
        {!loading && !error && table.rows.length > 0 && (
          <table className={styles.debtTable}>
            <thead>
              <tr>
                <th className={styles.debtTableName}>Клієнт</th>
                {table.columns.map(c => (
                  <th key={c.key} className={c.money ? styles.debtTableMoney : styles.debtTableCol}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map(r => (
                <tr key={r.clientId}>
                  <td className={styles.debtTableName}>{r.name}</td>
                  {table.columns.map(c => {
                    const v = r.balances[c.key]
                    return (
                      <td key={c.key} className={c.money ? styles.debtTableMoney : styles.debtTableCol}>
                        {v == null
                          ? <span className={styles.debtTableDash}>—</span>
                          : <span className="balance-warn">{c.money ? formatMoney(v) : v}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
