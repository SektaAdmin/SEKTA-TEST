'use client'
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listPastClasses } from '@/lib/queries/classes'
import { useListQuery } from '@/hooks/useListQuery'
import type { ClassWithJoins } from '@/lib/queries/classes'
import { useRefs } from '@/contexts/RefsContext'
import ClassDetailModal from '@/components/ClassDetailModal'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import DatePicker from '@/components/DatePicker'
import { formatDate, formatTime } from '@/lib/formatters'
import { ticketTypeShortLabel } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import { getActiveCount } from '@/lib/scheduleMetrics'
import FilterSelect from '@/components/ui/FilterSelect'
import jStyles from './journal.module.css'

const PAGE_SIZE = 20

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]

function JournalSkeleton() {
  return (
    <div role="status" aria-label="Завантаження...">
      <div className={`data-table-wrap ${jStyles.tableDesktop}`}>
        <table className="data-table" aria-hidden="true">
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
            {SKELETON_ROWS.map(i => (
              <tr key={i}>
                <td><div className={`skeleton-bone ${jStyles.skelDate}`} /></td>
                <td><div className={`skeleton-bone ${jStyles.skelTime}`} /></td>
                <td><div className={`skeleton-bone ${jStyles.skelType}`} /></td>
                <td><div className="skeleton-bone" style={{ width: `${60 - (i % 3) * 8}%` }} /></td>
                <td><div className={`skeleton-bone ${jStyles.skelTrainer}`} /></td>
                <td><div className={`skeleton-bone ${jStyles.skelHall}`} /></td>
                <td><div className={`skeleton-bone ${jStyles.skelCount}`} /></td>
                <td><div className={`skeleton-bone ${jStyles.skelStatus}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={jStyles.cardList} aria-hidden="true">
        {SKELETON_ROWS.slice(0, 5).map(i => (
          <div key={i} className={jStyles.card}>
            <div className={jStyles.cardRow}>
              <div className="skeleton-bone" style={{ width: `${50 - (i % 3) * 8}%` }} />
              <div className={`skeleton-bone ${jStyles.skelCardDateTime}`} />
            </div>
            <div className={`skeleton-bone ${jStyles.skelCardMeta}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function JournalPage() {
  const { trainers, halls, trainingTypes } = useRefs()

  const [page, setPage] = useState(0)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterTrainer, setFilterTrainer] = useState('')
  const [filterHall, setFilterHall] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCancelled, setFilterCancelled] = useState('all')
  const [filterClient, setFilterClient] = useState('')
  const [clientBoxKey, setClientBoxKey] = useState(0)

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)

  const hasFilters = dateFrom || dateTo || filterTrainer || filterHall || filterType || filterCancelled !== 'all' || filterClient

  const { data, total, loading, error, refetch } = useListQuery<ClassWithJoins>(
    () => listPastClasses(supabase, page, PAGE_SIZE, {
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
      hallId: filterHall || undefined,
      trainerId: filterTrainer || undefined,
      ticketType: filterType || undefined,
      isCancelled: filterCancelled === 'cancelled' ? true : undefined,
      clientId: filterClient || undefined,
    }),
    [page, dateFrom, dateTo, filterTrainer, filterHall, filterType, filterCancelled, filterClient]
  )

  useEffect(() => { if (error) toast.error('Помилка завантаження журналу') }, [error])

  function resetPage(fn: () => void) { fn(); setPage(0) }

  function clearFilters() {
    setDateFrom(''); setDateTo('')
    setFilterTrainer(''); setFilterHall(''); setFilterType('')
    setFilterCancelled('all')
    setFilterClient('')
    setClientBoxKey(k => k + 1)
    setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const trainerOptions = [
    { value: '', label: 'Всі тренери' },
    ...trainers.map(t => ({ value: t.id, label: t.name })),
  ]
  const hallOptions = [
    { value: '', label: 'Всі зали' },
    ...halls.map(h => ({ value: h.id, label: h.name })),
  ]
  const typeOptions = [
    { value: '', label: 'Всі типи' },
    ...trainingTypes.map(t => ({ value: t.code, label: t.label })),
  ]
  const cancelledOptions = [
    { value: 'all', label: 'Всі статуси' },
    { value: 'cancelled', label: 'Тільки скасовані' },
  ]

  return (
    <>
      <div className={`page-head ${jStyles.stickyHead}`}>
        <div className={jStyles.topbar}>
          <h1 className="page-title">Журнал занять</h1>
          {total > 0 && <span className={jStyles.topbarCount}>{total} занять</span>}
        </div>

        <div className={jStyles.filterBar}>
          <div className={jStyles.clientFilter}>
            <ClientSearchCombobox
              key={clientBoxKey}
              onSelect={c => resetPage(() => setFilterClient(c.id))}
              onClear={() => { if (filterClient) resetPage(() => setFilterClient('')) }}
            />
          </div>
          <DatePicker value={dateFrom} onChange={v => resetPage(() => setDateFrom(v))} placeholder="Від" />
          <DatePicker value={dateTo}   onChange={v => resetPage(() => setDateTo(v))}   placeholder="До" />
          <FilterSelect
            value={filterTrainer} onChange={v => resetPage(() => setFilterTrainer(v))}
            placeholder="Тренер" options={trainerOptions}
          />
          <FilterSelect
            value={filterHall} onChange={v => resetPage(() => setFilterHall(v))}
            placeholder="Зал" options={hallOptions}
          />
          <FilterSelect
            value={filterType} onChange={v => resetPage(() => setFilterType(v))}
            placeholder="Тип" options={typeOptions}
          />
          <FilterSelect
            value={filterCancelled} onChange={v => resetPage(() => setFilterCancelled(v))}
            placeholder="Статус" options={cancelledOptions}
          />
          {hasFilters && (
            <button className={jStyles.clearBtn} onClick={clearFilters} title="Скинути фільтри">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className={`page-body ${jStyles.content}`}>
        {loading ? (
          <JournalSkeleton />
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
                    <tr key={cls.id} onClick={() => setSelectedClassId(cls.id)}>
                      <td>{formatDate(cls.starts_at)}</td>
                      <td className={jStyles.tabularCell}>{formatTime(cls.starts_at)}</td>
                      <td>{ticketTypeShortLabel(cls.ticket_type)}</td>
                      <td>{trainingTypes.find(t => t.code === cls.ticket_type)?.label ?? cls.ticket_type}</td>
                      <td>{cls.trainers?.name ?? '—'}</td>
                      <td>{cls.halls?.name ?? '—'}</td>
                      <td>{getActiveCount(cls.enrollments)}</td>
                      <td>
                        {cls.is_cancelled
                          ? <span className="badge badge-class-cancelled">Скасовано</span>
                          : <span className="badge badge-completed">Проведено</span>}
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
                  <div key={cls.id} className={jStyles.card} onClick={() => setSelectedClassId(cls.id)}>
                    <div className={jStyles.cardRow}>
                      <span className={jStyles.cardTitle}>{typeLabel}</span>
                      <span className={jStyles.cardDateTime}>
                        {formatDate(cls.starts_at)} · {formatTime(cls.starts_at)}
                      </span>
                    </div>
                    <div className={jStyles.cardMeta}>
                      {cls.trainers?.name && <span>{cls.trainers.name}</span>}
                      {cls.trainers?.name && cls.halls?.name && <span className={jStyles.cardMetaDot}>·</span>}
                      {cls.halls?.name && <span>{cls.halls.name}</span>}
                      {(cls.trainers?.name || cls.halls?.name) && <span className={jStyles.cardMetaDot}>·</span>}
                      <span>{enrolled} записів</span>
                      <span className={jStyles.cardMetaDot}>·</span>
                      {cls.is_cancelled
                        ? <span className="badge badge-class-cancelled">Скасовано</span>
                        : <span className="badge badge-completed">Проведено</span>}
                    </div>
                  </div>
                )
              })}
            </div>

          </>
        )}
      </div>

      {total > 0 && (
        <div className={`page-foot ${jStyles.pagination}`}>
          <div className={jStyles.paginationLeft}>
            <span className={jStyles.paginationInfo}>
              Сторінка {page + 1} з {totalPages} · {total} занять
            </span>
          </div>
          <div className={jStyles.paginationBtns}>
            <button disabled={page === 0 || loading} onClick={() => setPage(0)} className={jStyles.pageBtn}>«</button>
            <button disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)} className={jStyles.pageBtn}>‹</button>
            <button disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)} className={jStyles.pageBtn}>›</button>
            <button disabled={page + 1 >= totalPages || loading} onClick={() => setPage(totalPages - 1)} className={jStyles.pageBtn}>»</button>
          </div>
        </div>
      )}

      {selectedClassId && (
        <ClassDetailModal
          classId={selectedClassId}
          onClose={() => setSelectedClassId(null)}
          onClassUpdated={() => { setSelectedClassId(null); refetch() }}
        />
      )}
    </>
  )
}
