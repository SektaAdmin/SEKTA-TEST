'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listSessionDebtorsAll, type SessionDebtorsTable } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { useAsync } from '@/hooks/useAsync'
import { useRefs } from '@/contexts/RefsContext'
import { BlockError } from './BlockError'
import { CollapseHead } from './CollapseHead'
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
  const { trainingTypes } = useRefs()
  // За замовчуванням згорнутий — це довідковий блок, розкривають за потреби.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (error) console.error('[DebtorListsBlock]', error)
  }, [error])

  // Повні бренд-назви з довідника (замість скорочень) — колонки заповнюють
  // простір, що інакше йде в порожнечу поряд з іменами клієнтів.
  const typeLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of trainingTypes) map[t.code] = t.label
    return map
  }, [trainingTypes])

  const table = data ?? EMPTY_TABLE

  return (
    <section className={styles.fullBlock}>
      <CollapseHead
        title="Боржники по сесіях"
        open={open}
        onToggle={() => setOpen(o => !o)}
        count={!loading && !error ? table.rows.length : undefined}
      />

      {/* Loading/error видно завжди, навіть коли блок згорнутий — інакше можна
          пропустити збій завантаження. Таблиця розкривається лише при open. */}
      {loading && <Loader />}
      {error && <BlockError onRetry={refetch} />}

      {open && !loading && !error && (
      <div className={styles.debtTableWrap}>
        {table.rows.length === 0 && (
          <div className={styles.empty}>Боржників немає</div>
        )}
        {table.rows.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th className={styles.debtTableName}>Клієнт</th>
                {table.columns.map(c => (
                  <th key={c.key} className={c.money ? styles.debtTableMoney : styles.debtTableCol}>
                    {typeLabels[c.key] ?? c.label}
                  </th>
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
      )}
    </section>
  )
}

function Loader() {
  return (
    <div className={styles.debtTableWrap} role="status" aria-label="Завантаження...">
      <table className="data-table" aria-hidden="true">
        <tbody>
          {[0, 1, 2, 3].map(i => (
            <tr key={i}>
              <td className={styles.debtTableName}>
                <div className={`skeleton-bone ${styles.debtSkelName}`} style={{ width: `${60 - i * 6}%` }} />
              </td>
              <td className={styles.debtTableCol}>
                <div className={`skeleton-bone ${styles.debtSkelCell}`} />
              </td>
              <td className={styles.debtTableMoney}>
                <div className={`skeleton-bone ${styles.debtSkelCell}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
