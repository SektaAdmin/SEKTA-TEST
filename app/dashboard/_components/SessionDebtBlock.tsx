'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listSessionDebtorsForDate } from '@/lib/queries/dashboard'
import { buildDebtReportText, type DebtGroup } from '@/lib/dashboardReport'
import { CopyButton } from '@/components/ui/CopyButton'
import { useListQuery } from '@/hooks/useListQuery'
import { BlockError } from './BlockError'
import { CollapseHead } from './CollapseHead'
import styles from '../dashboard.module.css'

/* Блок боржників: хто піде в мінус по сесіях сьогодні.
   Дані — агрегатно через listSessionDebtorsForDate (3 запити, без N+1).
   За замовчуванням згорнутий, складається за прикладом DebtorListsBlock;
   кнопка звіту лишається видимою і в згорнутому стані. */
export function SessionDebtBlock({ date }: { date: string }) {
  const { data: groups, loading, error, refetch } = useListQuery<DebtGroup>(
    () => listSessionDebtorsForDate(supabase, date),
    [date],
    { realtime: ['classes', 'enrollments', 'client_session_balances'] }
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (error) console.error('[SessionDebtBlock]', error)
  }, [error])

  const clientCount = groups.reduce((sum, g) => sum + g.clients.length, 0)

  return (
    <section className={styles.fullBlock}>
      <CollapseHead
        title="Боржники по сесіях сьогодні"
        open={open}
        onToggle={() => setOpen(o => !o)}
        count={!loading && !error ? clientCount : undefined}
        right={!loading && groups.length > 0 && (
          <CopyButton
            className={styles.collapseHeadRight}
            label="Скопіювати звіт"
            copiedLabel="Звіт скопійовано"
            text={() => buildDebtReportText(new Date(`${date}T00:00:00`), groups)}
          />
        )}
      />

      {/* Loading/error видно завжди, навіть коли блок згорнутий — інакше можна
          пропустити збій завантаження. Список розкривається лише при open. */}
      {loading && (
        <div role="status" aria-label="Завантаження...">
          {[0, 1].map(i => (
            <div key={i} className={styles.debtSkelGroup} aria-hidden="true">
              <div className={`${styles.skeletonBone} ${styles.debtSkelHead}`} />
              <div className={`${styles.skeletonBone} ${styles.debtSkelClient}`} style={{ width: '68%' }} />
              <div className={`${styles.skeletonBone} ${styles.debtSkelClient}`} style={{ width: '54%' }} />
            </div>
          ))}
        </div>
      )}
      {error && <BlockError onRetry={refetch} />}

      {open && !loading && !error && (
        <div className={styles.collapseBody}>
          {groups.length === 0 && (
            <div className={styles.empty}>Боржників немає</div>
          )}

          {groups.map(g => (
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
      )}
    </section>
  )
}
