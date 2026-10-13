'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import { useRefs } from '@/contexts/RefsContext'
import { calcTrainerSalaryDetail, listTrainerPayments } from '@/lib/queries/trainer-rates'
import { getMyTrainerCash } from '@/lib/queries/trainer-cabinet'
import { buildDayGroups, salaryToPay, pluralClasses } from '@/lib/salary'
import { formatMoney, formatDate, formatDateShort, formatTime } from '@/lib/formatters'
import { toYMD, parseYMD, getMondayOf, MONTHS_UK_CAP } from '@/lib/dateUtils'
import { enrollmentBadge, enrollmentBadgeClass, salaryPaymentTypeLabel, salaryPaymentTypeClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import SalesDateRangePicker from '@/components/SalesDateRangePicker'
import styles from './salary.module.css'

type Mode = 'week' | 'month' | 'range'

const MODES: { key: Mode; label: string }[] = [
  { key: 'week', label: 'Тиждень' },
  { key: 'month', label: 'Місяць' },
  { key: 'range', label: 'Період' },
]

function weekRange(anchor: Date): { from: string; to: string } {
  const mon = getMondayOf(anchor)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: toYMD(mon), to: toYMD(sun) }
}

function monthRange(anchor: Date): { from: string; to: string } {
  return {
    from: toYMD(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
    to: toYMD(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)),
  }
}

type Props = { trainerId: string }

export default function TrainerSalary({ trainerId }: Props) {
  const router = useRouter()
  const { trainingTypes } = useRefs()
  const [mode, setMode] = useState<Mode>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [range, setRange] = useState(() => monthRange(new Date()))
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())

  const { from, to } = mode === 'week' ? weekRange(anchor) : mode === 'month' ? monthRange(anchor) : range

  const { data, loading, error } = useAsync(async () => {
    const [detail, cash, pays] = await Promise.all([
      // межі як в адмінці (/settings/salary/calculations) — щоб цифри збігались із власниковими
      calcTrainerSalaryDetail(supabase, trainerId, `${from}T00:00:00`, `${to}T23:59:59`),
      getMyTrainerCash(supabase, from, to),
      listTrainerPayments(supabase, trainerId, from, to),
    ])
    return {
      data: { rows: detail.data, cash: cash.data, payments: pays.data },
      error: detail.error ?? cash.error ?? pays.error,
    }
  }, [trainerId, from, to], { refetchOnVisible: true })

  const rows = data?.rows ?? []
  const payments = data?.payments ?? []
  const dayGroups = useMemo(() => buildDayGroups(rows), [rows])
  const accrued = rows.reduce((s, r) => s + r.total_trainer, 0)
  const paid = payments.reduce((s, p) => s + Number(p.paid_amount), 0)
  const cashPeriod = data?.cash.cash_period ?? 0
  const cashTotal = data?.cash.cash_total ?? 0
  const toPay = salaryToPay(accrued, cashPeriod, paid)
  const missingRateCount = rows.filter(r => r.has_missing_rate).length

  function typeLabel(code: string): string {
    return trainingTypes.find(t => t.code === code)?.label ?? code
  }

  function shift(dir: -1 | 1) {
    setAnchor(a => {
      const d = new Date(a)
      if (mode === 'week') d.setDate(d.getDate() + dir * 7)
      else d.setMonth(d.getMonth() + dir, 1)
      return d
    })
  }

  function selectMode(m: Mode) {
    if (m === mode) return
    // «Період» стартує з поточного видимого діапазону
    if (m === 'range') setRange({ from, to })
    setMode(m)
  }

  function toggleClass(id: string) {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const periodLabel = mode === 'month'
    ? `${MONTHS_UK_CAP[anchor.getMonth()]} ${anchor.getFullYear()}`
    : `${formatDateShort(parseYMD(from)!)} – ${formatDate(parseYMD(to)!)}`

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/trainer')} aria-label="Меню">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5" />
          </svg>
          <span>Меню</span>
        </button>
        <span className={styles.topbarTitle}>Моя зарплата</span>
        <span className={styles.topbarSpacer} />
      </div>

      <div className={styles.periodBar}>
        <div className={`tabs-segmented ${styles.modeTabs}`} role="tablist">
          {MODES.map(m => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={mode === m.key}
              className={`tab-seg ${styles.modeTab} ${mode === m.key ? 'tab-seg-active' : ''}`}
              onClick={() => selectMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'range' ? (
          <SalesDateRangePicker
            dateFrom={range.from}
            dateTo={range.to}
            onChangeFrom={v => setRange(r => ({ ...r, from: v }))}
            onChangeTo={v => setRange(r => ({ ...r, to: v }))}
            onClear={() => setRange(monthRange(new Date()))}
          />
        ) : (
          <div className={styles.periodNav}>
            <button className={styles.periodNavBtn} onClick={() => shift(-1)} aria-label="Попередній період">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 2L4 7l5 5" />
              </svg>
            </button>
            <span className={styles.periodNavLabel}>{periodLabel}</span>
            <button className={styles.periodNavBtn} onClick={() => shift(1)} aria-label="Наступний період">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 2l5 5-5 5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className={styles.scroll}>
        {loading && !data ? (
          <div className={styles.empty}><span className="loading-dots" /></div>
        ) : error ? (
          <div className={styles.empty}>{MSG.error.dataLoad}</div>
        ) : (
          <>
            <section className={styles.summary} aria-label="Підсумок">
              <div className={`${styles.summaryCard} ${styles.summaryCardMain}`}>
                <span className={styles.summaryLabel}>До виплати</span>
                <span className={styles.summaryValueLg}>{formatMoney(Math.max(0, toPay))}</span>
              </div>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Нараховано</span>
                  <span className={styles.summaryValue}>{formatMoney(accrued)}</span>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Виплачено</span>
                  <span className={styles.summaryValue}>{formatMoney(paid)}</span>
                </div>
                <div className={`${styles.summaryCard} ${styles.summaryCardWide}`}>
                  <span className={styles.summaryLabel}>Готівка на руках</span>
                  <span className={styles.summaryValue}>{formatMoney(cashTotal)}</span>
                  {cashPeriod !== cashTotal && (
                    <span className={styles.summaryHint}>з них за період: {formatMoney(cashPeriod)}</span>
                  )}
                </div>
              </div>
              <p className={styles.formula}>До виплати = нараховано − готівка на руках за період − виплачено</p>
            </section>

            {missingRateCount > 0 && (
              <div className={styles.rateAlert} role="alert">
                <AlertTriangle size={15} className={styles.rateAlertIcon} aria-hidden />
                <span>
                  Для {missingRateCount} {pluralClasses(missingRateCount)} не задана ставка — нараховано 0&nbsp;₴.
                  Зверніться до адміністратора.
                </span>
              </div>
            )}

            <section className={styles.section}>
              <h2 className="section-title">Заняття</h2>
              {dayGroups.length === 0 ? (
                <div className={styles.emptyInline}>{MSG.empty.salaryClasses}</div>
              ) : (
                <div className={styles.dayList}>
                  {dayGroups.map(g => (
                    <div key={g.dateKey} className={styles.dayGroup}>
                      <div className={styles.dayHead}>
                        <span className={styles.dayLabel}>{g.dateLabel}</span>
                        <span className={styles.dayTotal}>{formatMoney(g.totalTrainer)}</span>
                      </div>
                      {g.classes.map(c => {
                        const open = expandedClasses.has(c.class_id)
                        return (
                          <div key={c.class_id} className={styles.classItem}>
                            <button
                              type="button"
                              className={styles.classRow}
                              onClick={() => toggleClass(c.class_id)}
                              aria-expanded={open}
                            >
                              <span className={styles.classTime}>{formatTime(c.starts_at)}</span>
                              <span className={styles.classInfo}>
                                <span className={styles.classType}>{typeLabel(c.ticket_type)}</span>
                                <span className={styles.classMeta}>
                                  {c.hall_name ? `${c.hall_name} · ` : ''}{c.total_clients} кл.
                                </span>
                              </span>
                              <span className={`${styles.classAmt} ${c.has_missing_rate ? styles.rateMissingAmt : ''}`}>
                                {formatMoney(c.total_trainer)}
                              </span>
                              <svg
                                className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                                width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden
                              >
                                <path d="M5 2l5 5-5 5" />
                              </svg>
                            </button>
                            {open && (
                              <div className={styles.clientList}>
                                {c.enrollments.map((e, i) => {
                                  // у ЗП потрапляє лише пізня відміна (sessions_used>0) → «Скасовано (пізно)»
                                  const b = enrollmentBadge(
                                    { status: e.status, sessions_used: e.status === 'cancelled' ? 1 : 0 },
                                    'client',
                                  )
                                  return (
                                    <div key={`${e.client_id}-${i}`} className={styles.clientRow}>
                                      <span className={styles.clientName}>{e.client_name}</span>
                                      <span className={enrollmentBadgeClass(b.tone)}>{b.label}</span>
                                      <span className={styles.clientAmt}>{formatMoney(e.trainer_amount)}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <h2 className="section-title">Виплати</h2>
              {payments.length === 0 ? (
                <div className={styles.emptyInline}>{MSG.empty.salaryPayments}</div>
              ) : (
                <div className={styles.paymentList}>
                  {payments.map(p => (
                    <div key={p.id} className={styles.paymentRow}>
                      <div className={styles.paymentInfo}>
                        <span className={styles.paymentDate}>{formatDate(p.payment_date)}</span>
                        <span className={styles.paymentPeriod}>
                          за {formatDateShort(p.period_start)} – {formatDate(p.period_end)}
                        </span>
                      </div>
                      <span className={salaryPaymentTypeClass(p.payment_type)}>
                        {salaryPaymentTypeLabel(p.payment_type)}
                      </span>
                      <span className={styles.paymentAmt}>{formatMoney(Number(p.paid_amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
