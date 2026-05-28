'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listPastClasses, type ClassWithJoins } from '@/lib/queries/classes'
import { useRefs } from '@/contexts/RefsContext'
import ClassDetailModal from '@/components/ClassDetailModal'
import { formatDate, formatTime } from '@/lib/formatters'
import { ticketTypeShortLabel } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import { getActiveCount } from '@/lib/scheduleMetrics'
import styles from '../settings/settings.module.css'
import jStyles from './journal.module.css'

const PAGE_SIZE = 20

export default function JournalPage() {
  const { trainers, halls, trainingTypes } = useRefs()

  const [page, setPage] = useState(0)
  const [data, setData] = useState<ClassWithJoins[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [filterTrainer, setFilterTrainer] = useState('')
  const [filterHall, setFilterHall] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCancelled, setFilterCancelled] = useState<'all' | 'cancelled'>('all')

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)

  const fetchData = useCallback(async (p: number) => {
    setLoading(true)
    const res = await listPastClasses(supabase, p, PAGE_SIZE, {
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
      hallId: filterHall || undefined,
      trainerId: filterTrainer || undefined,
      ticketType: filterType || undefined,
      isCancelled: filterCancelled === 'cancelled' ? true : undefined,
    })
    if (res.error) {
      toast.error('Помилка завантаження журналу')
    } else {
      setData(res.data)
      setTotal(res.count)
    }
    setLoading(false)
  }, [dateFrom, dateTo, filterTrainer, filterHall, filterType, filterCancelled])

  useEffect(() => {
    fetchData(page)
  }, [fetchData, page])

  function resetPage(fn: () => void) {
    fn()
    setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      {/* Topbar */}
      <div className={styles.topbar}>
        <h1 className="page-title">Журнал занять</h1>
        {total > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{total} занять</span>
        )}
      </div>

      {/* Filter bar */}
      <div className={jStyles.filterBar}>
        <input
          type="date"
          value={dateFrom}
          onChange={e => resetPage(() => setDateFrom(e.target.value))}
          style={selectStyle}
          title="Від"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => resetPage(() => setDateTo(e.target.value))}
          style={selectStyle}
          title="До"
        />
        <select
          value={filterTrainer}
          onChange={e => resetPage(() => setFilterTrainer(e.target.value))}
          style={selectStyle}
        >
          <option value="">Всі тренери</option>
          {trainers.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={filterHall}
          onChange={e => resetPage(() => setFilterHall(e.target.value))}
          style={selectStyle}
        >
          <option value="">Всі зали</option>
          {halls.map(h => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={e => resetPage(() => setFilterType(e.target.value))}
          style={selectStyle}
        >
          <option value="">Всі типи</option>
          {trainingTypes.map(t => (
            <option key={t.id} value={t.code}>{t.label}</option>
          ))}
        </select>
        <select
          value={filterCancelled}
          onChange={e => resetPage(() => setFilterCancelled(e.target.value as 'all' | 'cancelled'))}
          style={selectStyle}
        >
          <option value="all">Всі статуси</option>
          <option value="cancelled">Тільки скасовані</option>
        </select>
      </div>

      {/* Content */}
      <div className={jStyles.content}>
        {loading ? (
          <div className="loading-dots"><span /><span /><span /></div>
        ) : data.length === 0 ? (
          <div className={jStyles.empty}>{MSG.empty.journalEmpty}</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className={`data-table-wrap ${jStyles.tableDesktop}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Час</th>
                    <th>Тип</th>
                    <th>Назва</th>
                    <th>Тренер</th>
                    <th>Зал</th>
                    <th>Записів</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(cls => (
                    <tr
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{formatDate(cls.starts_at)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(cls.starts_at)}</td>
                      <td>{ticketTypeShortLabel(cls.ticket_type)}</td>
                      <td>{trainingTypes.find(t => t.code === cls.ticket_type)?.label ?? cls.ticket_type}</td>
                      <td>{cls.trainers?.name ?? '—'}</td>
                      <td>{cls.halls?.name ?? '—'}</td>
                      <td>{getActiveCount(cls.enrollments)}</td>
                      <td>
                        {cls.is_cancelled
                          ? <span className={jStyles.badgeCancelled}>Скасовано</span>
                          : <span className={jStyles.badgeCompleted}>Проведено</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className={jStyles.cardList}>
              {data.map(cls => {
                const typeLabel = trainingTypes.find(t => t.code === cls.ticket_type)?.label ?? cls.ticket_type
                const enrolled = getActiveCount(cls.enrollments)
                return (
                  <div
                    key={cls.id}
                    className={jStyles.card}
                    onClick={() => setSelectedClassId(cls.id)}
                  >
                    <div className={jStyles.cardRow}>
                      <span className={jStyles.cardTitle}>{typeLabel}</span>
                      <span className={jStyles.cardDateTime}>
                        {formatDate(cls.starts_at)} · {formatTime(cls.starts_at)}
                      </span>
                    </div>
                    <div className={jStyles.cardMeta}>
                      {cls.trainers?.name && (
                        <span>{cls.trainers.name}</span>
                      )}
                      {cls.trainers?.name && cls.halls?.name && (
                        <span className={jStyles.cardMetaDot}>·</span>
                      )}
                      {cls.halls?.name && (
                        <span>{cls.halls.name}</span>
                      )}
                      {(cls.trainers?.name || cls.halls?.name) && (
                        <span className={jStyles.cardMetaDot}>·</span>
                      )}
                      <span>{enrolled} записів</span>
                      <span className={jStyles.cardMetaDot}>·</span>
                      {cls.is_cancelled
                        ? <span className={jStyles.badgeCancelled}>Скасовано</span>
                        : <span className={jStyles.badgeCompleted}>Проведено</span>
                      }
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            <div className={jStyles.pagination}>
              <div className={jStyles.paginationLeft}>
                <span className={jStyles.paginationInfo}>
                  Сторінка {page + 1} з {totalPages} · {total} занять
                </span>
              </div>
              <div className={jStyles.paginationBtns}>
                <button
                  disabled={page === 0 || loading}
                  onClick={() => setPage(0)}
                  className={jStyles.pageBtn}
                >«</button>
                <button
                  disabled={page === 0 || loading}
                  onClick={() => setPage(p => p - 1)}
                  className={jStyles.pageBtn}
                >‹</button>
                <button
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}
                  className={jStyles.pageBtn}
                >›</button>
                <button
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => setPage(totalPages - 1)}
                  className={jStyles.pageBtn}
                >»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedClassId && (
        <ClassDetailModal
          classId={selectedClassId}
          onClose={() => setSelectedClassId(null)}
          onClassUpdated={() => {
            setSelectedClassId(null)
            fetchData(page)
          }}
        />
      )}
    </>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '0.5px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'var(--font)',
  cursor: 'pointer',
  height: 'var(--control-h)',
  flexShrink: 0,
}
