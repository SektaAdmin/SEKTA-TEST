'use client'
import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { MSG } from '@/lib/messages'
import { supabase } from '@/lib/supabase'
import { listSessionDebtorsForDate } from '@/lib/queries/dashboard'
import { buildDebtReportText, type DebtGroup } from '@/lib/dashboardReport'
import { CopyIcon } from '@/components/icons/navigation'
import { useListQuery } from '@/hooks/useListQuery'
import { BlockError } from './BlockError'
import styles from '../dashboard.module.css'

/* Блок боржників: хто піде в мінус по сесіях сьогодні.
   Дані — агрегатно через listSessionDebtorsForDate (3 запити, без N+1).
   Список завжди розгорнутий, скролиться; висота збігається з блоком вільних місць. */
export function SessionDebtBlock({ date }: { date: string }) {
  const { data: groups, loading, error, refetch } = useListQuery<DebtGroup>(
    () => listSessionDebtorsForDate(supabase, date),
    [date],
    { realtime: ['classes', 'enrollments', 'client_session_balances'] }
  )

  useEffect(() => {
    if (error) console.error('[SessionDebtBlock]', error)
  }, [error])

  const handleCopy = useCallback(() => {
    const text = buildDebtReportText(new Date(`${date}T00:00:00`), groups)
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Звіт скопійовано'))
      .catch(() => toast.error(MSG.toast.copyFailed))
  }, [date, groups])

  return (
    <section className={`${styles.block} ${styles.equalBlock}`}>
      <div className={styles.blockHead}>
        <h2 className={styles.blockTitle}>Боржники по сесіях сьогодні</h2>
        {!loading && groups.length > 0 && (
          <button type="button" className={styles.copyBtn} onClick={handleCopy}>
            <CopyIcon /> Скопіювати звіт
          </button>
        )}
      </div>

      <div className={styles.scrollBody}>
        {loading && <div className="loading-dots" role="status" aria-label="Завантаження..."><span /><span /><span /></div>}
        {error && <BlockError onRetry={refetch} />}
        {!loading && !error && groups.length === 0 && (
          <div className={styles.empty}>Боржників немає 🎉</div>
        )}

        {!loading && !error && groups.map(g => (
          <div key={`${g.time}-${g.trainer}`} className={styles.debtGroup}>
            <div className={styles.debtGroupHead}>
              {g.time} · {g.trainer} <span className={styles.debtHall}>({g.hall})</span>
              {g.indivLabel && <span className={styles.debtType}>{g.indivLabel}</span>}
            </div>
            {g.clients.map(c => (
              <div key={c.name} className={styles.debtClient}>
                <span>{c.name}</span>
                <span className="balance-warn">{c.balance}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
