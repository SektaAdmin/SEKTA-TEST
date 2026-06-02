'use client'
import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listSessionDebtorsForDate } from '@/lib/queries/dashboard'
import { buildDebtReportText, type DebtGroup } from '@/lib/dashboardReport'
import { CopyIcon } from '@/components/icons/navigation'
import { useRealtime } from '@/lib/useRealtime'
import styles from '../dashboard.module.css'

/* Блок боржників: хто піде в мінус по сесіях сьогодні.
   Дані — агрегатно через listSessionDebtorsForDate (3 запити, без N+1).
   Список завжди розгорнутий, скролиться; висота збігається з блоком вільних місць. */
export function SessionDebtBlock({ date }: { date: string }) {
  const [groups, setGroups] = useState<DebtGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    listSessionDebtorsForDate(supabase, date).then(({ data, error }) => {
      if (cancelled) return
      setError(error)
      setGroups(data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [date])

  useEffect(() => { return load() }, [load])
  useRealtime(['classes', 'enrollments', 'client_session_balances'], load)

  const handleCopy = useCallback(() => {
    const text = buildDebtReportText(new Date(`${date}T00:00:00`), groups)
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Звіт скопійовано'))
      .catch(() => toast.error('Не вдалося скопіювати'))
  }, [date, groups])

  return (
    <section className={`${styles.block} ${styles.equalBlock}`}>
      <div className={styles.blockHead}>
        <h2 className={styles.blockTitle}>Боржники по сесіях сьогодні</h2>
        {!loading && groups.length > 0 && (
          <button className={styles.copyBtn} onClick={handleCopy}>
            <CopyIcon /> Скопіювати звіт
          </button>
        )}
      </div>

      <div className={styles.scrollBody}>
        {loading && <div className="loading-dots"><span /><span /><span /></div>}
        {error && <div className={styles.empty}>Помилка завантаження: {error}</div>}
        {!loading && !error && groups.length === 0 && (
          <div className={styles.empty}>Боржників немає 🎉</div>
        )}

        {!loading && !error && groups.map((g, i) => (
          <div key={i} className={styles.debtGroup}>
            <div className={styles.debtGroupHead}>
              {g.time} · {g.trainer} <span className={styles.debtHall}>({g.hall})</span>
              {g.indivLabel && <span className={styles.debtType}>{g.indivLabel}</span>}
            </div>
            {g.clients.map((c, j) => (
              <div key={j} className={styles.debtClient}>
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
