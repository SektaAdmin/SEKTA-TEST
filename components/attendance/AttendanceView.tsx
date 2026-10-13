'use client'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/hooks/useAsync'
import { useRefs } from '@/contexts/RefsContext'
import FilterSelect from '@/components/ui/FilterSelect'
import { formatDateShort } from '@/lib/formatters'
import { MSG } from '@/lib/messages'
import { getAttendanceOverview, type AttendanceRow } from '@/lib/queries/attendance'
import { absenceBadgeClass, balanceClass } from '@/lib/badges'
import {
  absenceLabel, absenceLevel, clientFullName, filterAttendance,
  missRate, type AttendanceTab,
} from '@/lib/attendance'
import styles from './attendance.module.css'

const TABS: { value: AttendanceTab; label: string }[] = [
  { value: 'leaving', label: 'Зникли' },
  { value: 'missing', label: 'Пропуски' },
  { value: 'all', label: 'Всі' },
]

const PERIODS = [30, 60, 90] as const

const EMPTY: Record<AttendanceTab, string> = {
  leaving: MSG.empty.attendanceLeaving,
  missing: MSG.empty.attendanceMissing,
  all: MSG.empty.attendanceAll,
}

type Props = {
  /** owner/admin: фільтр тренера + клік → картка клієнта. trainer: лише свої заняття. */
  showTrainerFilter: boolean
  /** Примусово картками (кабінет тренера — mobile-first). */
  compact?: boolean
  onRowClick: (row: AttendanceRow) => void
}

function LastVisitBadge({ row }: { row: AttendanceRow }) {
  const level = absenceLevel(row.days_since)
  return <span className={absenceBadgeClass(level)}>{absenceLabel(row.days_since)}</span>
}

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5]

function AttendanceSkeleton() {
  return (
    <div className={styles.cardListAlways} role="status" aria-label="Завантаження...">
      {SKELETON_ROWS.map(i => (
        <div key={i} className={styles.skelCard} aria-hidden="true">
          <div className={styles.cardRow}>
            <div className="skeleton-bone" style={{ width: `${45 - (i % 3) * 6}%` }} />
            <div className={`skeleton-bone ${styles.skelBadge}`} />
          </div>
          <div className={`skeleton-bone ${styles.skelMeta}`} />
        </div>
      ))}
    </div>
  )
}

function visitsCell(r: AttendanceRow): string {
  return `${r.visits_period} / ${r.visits_prev_period}`
}

function missCell(r: AttendanceRow): string {
  if (r.planned_regular === 0) return '—'
  return `${r.missed_regular} з ${r.planned_regular} (${Math.round(missRate(r) * 100)}%)`
}

export default function AttendanceView({ showTrainerFilter, compact = false, onRowClick }: Props) {
  const { trainers } = useRefs()
  const [tab, setTab] = useState<AttendanceTab>('leaving')
  const [period, setPeriod] = useState<number>(60)
  const [trainerId, setTrainerId] = useState('')
  const [search, setSearch] = useState('')

  const { data, loading, error } = useAsync(
    () => getAttendanceOverview(supabase, { trainerId: showTrainerFilter ? trainerId : undefined, periodDays: period }),
    [period, trainerId, showTrainerFilter],
    { refetchOnVisible: true }
  )

  const rows = useMemo(() => filterAttendance(data ?? [], tab, search), [data, tab, search])

  const trainerOptions = [
    { value: '', label: 'Всі тренери' },
    ...trainers.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name })),
  ]

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ''}`}>
      <div className={styles.controls}>
        <div className="tabs-segmented" role="tablist">
          {TABS.map(t => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              className={`tab-seg ${tab === t.value ? 'tab-seg-active' : ''}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.filters}>
          <div className="tabs-segmented" role="group" aria-label="Період">
            {PERIODS.map(p => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                className={`tab-seg ${period === p ? 'tab-seg-active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p} дн.
              </button>
            ))}
          </div>
          {showTrainerFilter && (
            <FilterSelect value={trainerId} onChange={setTrainerId} placeholder="Тренер" options={trainerOptions} />
          )}
        </div>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <input
            className={styles.searchInput}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук за іменем..."
            aria-label="Пошук клієнта"
          />
          {search && (
            <button type="button" className={styles.searchClear} onClick={() => setSearch('')} aria-label="Очистити пошук">
              ✕
            </button>
          )}
        </div>
      </div>

      <p className={styles.hint}>
        Пропуск — це відмічене «Не прийшов» або скасований запис. Якщо відсутнього не відмітили,
        заняття рахується як відвідане.
      </p>

      {loading && !data ? (
        <AttendanceSkeleton />
      ) : error ? (
        <div className={styles.empty}>Не вдалося завантажити: {error}</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>{EMPTY[tab]}</div>
      ) : (
        <>
          <div className={`data-table-wrap ${styles.tableDesktop}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Клієнт</th>
                  <th>Останній візит</th>
                  <th title={`Відвідування: останні ${period} днів / попередні ${period}`}>Візити {period}д / попер.</th>
                  <th>Пропуски постійника</th>
                  <th>Залишок занять</th>
                  <th>Постійні групи</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.client_id} className={styles.row} onClick={() => onRowClick(r)}>
                    <td className={styles.nameCell}>{clientFullName(r)}</td>
                    <td className={styles.num}>
                      <LastVisitBadge row={r} />
                      {r.last_visit_at && <span className={styles.subtle}> {formatDateShort(r.last_visit_at)}</span>}
                    </td>
                    <td className={styles.num}>{visitsCell(r)}</td>
                    <td className={styles.num}>{missCell(r)}</td>
                    <td><span className={balanceClass(r.sessions_left)}>{r.sessions_left}</span></td>
                    <td className={styles.series}>{r.regular_series.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cardList}>
            {rows.map(r => (
              <button key={r.client_id} type="button" className={styles.card} onClick={() => onRowClick(r)}>
                <div className={styles.cardRow}>
                  <span className={styles.cardTitle}>{clientFullName(r)}</span>
                  <LastVisitBadge row={r} />
                </div>
                <div className={styles.cardMeta}>
                  <span>Візити {visitsCell(r)}</span>
                  {r.planned_regular > 0 && (
                    <><span className={styles.dot}>·</span><span>Пропуски {missCell(r)}</span></>
                  )}
                  <span className={styles.dot}>·</span>
                  <span>Залишок <span className={balanceClass(r.sessions_left)}>{r.sessions_left}</span></span>
                </div>
                {r.regular_series.length > 0 && (
                  <div className={styles.cardSeries}>{r.regular_series.join(', ')}</div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
