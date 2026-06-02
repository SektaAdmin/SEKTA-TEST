'use client'
import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  listClassesForDate,
  listEnrollmentsForClass,
  listSessionBalancesForClients,
} from '@/lib/queries/enrollments'
import { effectiveSessionBalance } from '@/lib/scheduleMetrics'
import { formatClientName, formatTime } from '@/lib/formatters'
import {
  groupDebtRows,
  buildDebtReportText,
  type DebtRow,
  type DebtGroup,
} from '@/lib/dashboardReport'
import { CopyIcon } from '@/components/icons/navigation'
import { useRealtime } from '@/lib/useRealtime'
import styles from '../dashboard.module.css'

/* Блок 2 (ядро): хто піде в мінус по сесіях сьогодні.
   Збирається з існуючих queries. Мінус = effectiveSessionBalance(...) < 0. */
export function SessionDebtBlock({ date }: { date: string }) {
  const [groups, setGroups] = useState<DebtGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)

    async function run() {
      const { data: classes, error: clsErr } = await listClassesForDate(supabase, date)
      if (cancelled) return
      if (clsErr) { setError(clsErr); setLoading(false); return }

      const rows: DebtRow[] = []

      // Послідовно по заняттях; усередині — батч-баланси (без N+1).
      for (const cls of classes) {
        const trainerName = cls.trainers?.name ?? '—'
        const hallName = cls.halls?.name ?? '—'
        const time = formatTime(cls.starts_at)
        const d = new Date(cls.starts_at)
        const startMin = d.getHours() * 60 + d.getMinutes()

        const { data: enrollments } = await listEnrollmentsForClass(supabase, cls.id)
        if (cancelled) return
        const active = enrollments.filter(e => e.status === 'enrolled' || e.status === 'attended' || e.status === 'noshow')
        if (active.length === 0) continue

        const clientIds = active.map(e => e.client_id)
        const { data: balances } = await listSessionBalancesForClients(supabase, clientIds, cls.ticket_type)
        if (cancelled) return

        for (const e of active) {
          const raw = balances[e.client_id] ?? 0
          const eff = effectiveSessionBalance(raw, e.status, e.sessions_used, e.hours_attended)
          if (eff < 0) {
            rows.push({
              time,
              startMin,
              hall: hallName,
              trainer: trainerName,
              ticketType: cls.ticket_type,
              clientName: e.clients ? formatClientName(e.clients) : '—',
              balance: eff,
            })
          }
        }
      }

      if (cancelled) return
      setGroups(groupDebtRows(rows))
      setLoading(false)
    }

    run()
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
    <section className={styles.debtBlock}>
      <div className={styles.blockHead}>
        {!loading && groups.length > 0 && (
          <button className={styles.copyBtn} onClick={handleCopy}>
            <CopyIcon /> Скопіювати звіт
          </button>
        )}
        <button className={styles.blockToggle} onClick={() => setOpen(o => !o)}>
          <h2 className={styles.blockTitle}>Боржники по сесіях сьогодні</h2>
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
            width="16" height="16" viewBox="0 0 16 16" fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div
        className={styles.debtBody}
        style={{ display: open ? undefined : 'none' }}
      >
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
