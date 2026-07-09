'use client'
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listEnrollmentEvents, type AuditEventRow, type DeliveredFilter } from '@/lib/queries/enrollment-events'
import { useListQuery } from '@/hooks/useListQuery'
import { useRefs } from '@/contexts/RefsContext'
import DatePicker from '@/components/DatePicker'
import FilterSelect from '@/components/ui/FilterSelect'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import { formatDate, formatTime } from '@/lib/formatters'
import styles from './audit.module.css'

const PAGE_SIZE = 20

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]

function AuditSkeleton() {
  return (
    <div role="status" aria-label="Завантаження...">
      <div className={`data-table-wrap ${styles.tableDesktop}`}>
        <table className="data-table" aria-hidden="true">
          <thead>
            <tr>
              <th>Час</th>
              <th>Дія</th>
              <th>Клієнт</th>
              <th>Заняття</th>
              <th>Тренер-власник</th>
              <th>Хто зробив</th>
              <th>Telegram</th>
            </tr>
          </thead>
          <tbody>
            {SKELETON_ROWS.map(i => (
              <tr key={i}>
                <td><div className={`skeleton-bone ${styles.skelTime}`} /></td>
                <td><div className={`skeleton-bone ${styles.skelBadge}`} /></td>
                <td><div className={`skeleton-bone ${styles.skelClient}`} /></td>
                <td><div className="skeleton-bone" style={{ width: `${70 - (i % 3) * 8}%` }} /></td>
                <td><div className={`skeleton-bone ${styles.skelTrainer}`} /></td>
                <td><div className={`skeleton-bone ${styles.skelActor}`} /></td>
                <td><div className={`skeleton-bone ${styles.skelDelivered}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.cardList} aria-hidden="true">
        {SKELETON_ROWS.slice(0, 5).map(i => (
          <div key={i} className={styles.card}>
            <div className={styles.cardRow}>
              <div className="skeleton-bone" style={{ width: `${55 - (i % 3) * 8}%` }} />
              <div className={`skeleton-bone ${styles.skelCardDateTime}`} />
            </div>
            <div className={`skeleton-bone ${styles.skelCardMeta}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

const EVENT_LABEL: Record<string, string> = {
  enrolled: 'Запис',
  cancelled: 'Скасування',
  deleted: 'Видалено',
  waitlisted: 'У чергу',
  attended: 'Відвідано',
  noshow: 'Не прийшов',
  status_changed: 'Зміна статусу',
}
const EVENT_BADGE: Record<string, string> = {
  enrolled: 'badge-attended',
  cancelled: 'badge-noshow',
  deleted: 'badge-cancelled',
  waitlisted: 'badge-waitlist',
  attended: 'badge-enrolled',
  noshow: 'badge-cancelled',
  status_changed: 'badge-type',
}
const ACTOR_LABEL: Record<string, string> = {
  owner: 'Власник',
  admin: 'Адмін',
  trainer: 'Тренер',
  client: 'Клієнт',
  system: 'Система',
}

export default function AuditPage() {
  const { trainers, halls, trainingTypes } = useRefs()

  const [page, setPage] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterTrainer, setFilterTrainer] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [clientKey, setClientKey] = useState(0)
  const [filterActor, setFilterActor] = useState('')
  const [filterEvent, setFilterEvent] = useState('')
  const [filterDelivered, setFilterDelivered] = useState<DeliveredFilter>('')

  const hasFilters = dateFrom || dateTo || filterTrainer || filterClient || filterActor || filterEvent || filterDelivered

  const { data, total, loading, error } = useListQuery<AuditEventRow>(
    () => listEnrollmentEvents(supabase, {
      page,
      pageSize: PAGE_SIZE,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
      trainerId: filterTrainer || undefined,
      clientId: filterClient || undefined,
      actorRole: filterActor || undefined,
      eventType: filterEvent || undefined,
      delivered: filterDelivered || undefined,
    }),
    [page, dateFrom, dateTo, filterTrainer, filterClient, filterActor, filterEvent, filterDelivered]
  )

  useEffect(() => { if (error) toast.error('Помилка завантаження журналу') }, [error])

  function resetPage(fn: () => void) { fn(); setPage(0) }

  function clearFilters() {
    setDateFrom(''); setDateTo('')
    setFilterTrainer(''); setFilterClient(''); setFilterActor(''); setFilterEvent('')
    setFilterDelivered('')
    setClientKey(k => k + 1) // ремонт ClientSearchCombobox, щоб очистити видимий текст
    setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const trainerOptions = [
    { value: '', label: 'Всі тренери' },
    ...trainers.map(t => ({ value: t.id, label: t.name })),
  ]
  const actorOptions = [
    { value: '', label: 'Всі автори' },
    { value: 'owner', label: 'Власник' },
    { value: 'admin', label: 'Адмін' },
    { value: 'trainer', label: 'Тренер' },
    { value: 'client', label: 'Клієнт' },
    { value: 'system', label: 'Система' },
  ]
  const eventOptions = [
    { value: '', label: 'Всі дії' },
    { value: 'enrolled', label: 'Запис' },
    { value: 'cancelled', label: 'Скасування' },
    { value: 'deleted', label: 'Видалено' },
    { value: 'waitlisted', label: 'У чергу' },
    { value: 'attended', label: 'Відвідано' },
    { value: 'noshow', label: 'Не прийшов' },
    { value: 'status_changed', label: 'Зміна статусу' },
  ]
  const deliveredOptions = [
    { value: '', label: 'Доставка: всі' },
    { value: 'delivered', label: 'Доставлено' },
    { value: 'pending', label: 'В очікуванні' },
  ]

  const trainerName = (id: string | null) => (id ? trainers.find(t => t.id === id)?.name ?? '—' : '—')
  const typeLabel = (code: string | null) => (code ? trainingTypes.find(t => t.code === code)?.label ?? code : '—')
  const hallName = (id: string | null) => (id ? halls.find(h => h.id === id)?.name ?? null : null)

  function clientLabel(ev: AuditEventRow): string {
    const c = ev.clients
    if (!c) return '—'
    return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
  }

  function actorLabel(ev: AuditEventRow): string {
    const base = ACTOR_LABEL[ev.actor_role] ?? ev.actor_role
    if (ev.actor_trainer_id) return `${base} · ${trainerName(ev.actor_trainer_id)}`
    return base
  }

  function classLabel(ev: AuditEventRow): string {
    const cls = ev.classes
    if (!cls) return '—'
    const hall = hallName(cls.hall_id)
    return `${typeLabel(cls.ticket_type)}, ${formatDate(cls.starts_at)} ${formatTime(cls.starts_at)}${hall ? `, ${hall}` : ''}`
  }

  function deliveredCell(ev: AuditEventRow): string {
    if (!ev.notify) return '—'
    return ev.delivered ? '✅' : '⏳'
  }

  return (
    <>
      <div className={`page-head ${styles.stickyHead}`}>
        <div className={styles.topbar}>
          <h1 className="page-title">Аудит записів</h1>
          {total > 0 && <span className={styles.topbarCount}>{total} подій</span>}
        </div>

        <div className={styles.filterBar}>
          <div className={styles.clientSearch}>
            <ClientSearchCombobox
              key={clientKey}
              onSelect={c => resetPage(() => setFilterClient(c.id))}
              onClear={() => resetPage(() => setFilterClient(''))}
            />
          </div>
          <DatePicker value={dateFrom} onChange={v => resetPage(() => setDateFrom(v))} placeholder="Від" />
          <DatePicker value={dateTo}   onChange={v => resetPage(() => setDateTo(v))}   placeholder="До" />
          <FilterSelect
            value={filterTrainer} onChange={v => resetPage(() => setFilterTrainer(v))}
            placeholder="Тренер" options={trainerOptions}
          />
          <FilterSelect
            value={filterEvent} onChange={v => resetPage(() => setFilterEvent(v))}
            placeholder="Дія" options={eventOptions}
          />
          <FilterSelect
            value={filterActor} onChange={v => resetPage(() => setFilterActor(v))}
            placeholder="Автор" options={actorOptions}
          />
          <FilterSelect
            value={filterDelivered} onChange={v => resetPage(() => setFilterDelivered(v as DeliveredFilter))}
            placeholder="Доставка" options={deliveredOptions}
          />
          {hasFilters && (
            <button className={styles.clearBtn} onClick={clearFilters} title="Скинути фільтри">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className={`page-body ${styles.content}`}>
        {loading ? (
          <AuditSkeleton />
        ) : data.length === 0 ? (
          <div className={styles.empty}>Подій не знайдено</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className={`data-table-wrap ${styles.tableDesktop}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Час</th>
                    <th>Дія</th>
                    <th>Клієнт</th>
                    <th>Заняття</th>
                    <th>Тренер-власник</th>
                    <th>Хто зробив</th>
                    <th>Telegram</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(ev => (
                    <tr key={ev.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {formatDate(ev.created_at)} {formatTime(ev.created_at)}
                      </td>
                      <td>
                        <span className={`badge ${EVENT_BADGE[ev.event_type] ?? 'badge-type'}`}>
                          {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                        </span>
                      </td>
                      <td>{clientLabel(ev)}</td>
                      <td>{classLabel(ev)}</td>
                      <td>{trainerName(ev.owner_trainer_id)}</td>
                      <td>{actorLabel(ev)}</td>
                      <td className={styles.deliveredCell}>{deliveredCell(ev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className={styles.cardList}>
              {data.map(ev => (
                <div key={ev.id} className={styles.card}>
                  <div className={styles.cardRow}>
                    <span className={styles.cardTitle}>
                      <span className={`badge ${EVENT_BADGE[ev.event_type] ?? 'badge-type'}`}>
                        {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                      </span>
                      {' '}{clientLabel(ev)}
                    </span>
                    <span className={styles.cardDateTime}>
                      {formatDate(ev.created_at)} · {formatTime(ev.created_at)}
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span>{classLabel(ev)}</span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span>{trainerName(ev.owner_trainer_id)}</span>
                    <span className={styles.cardMetaDot}>·</span>
                    <span>{actorLabel(ev)}</span>
                    {ev.notify && (
                      <>
                        <span className={styles.cardMetaDot}>·</span>
                        <span>{deliveredCell(ev)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {total > 0 && (
        <div className={`page-foot ${styles.pagination}`}>
          <div className={styles.paginationLeft}>
            <span className={styles.paginationInfo}>
              Сторінка {page + 1} з {totalPages} · {total} подій
            </span>
          </div>
          <div className={styles.paginationBtns}>
            <button disabled={page === 0 || loading} onClick={() => setPage(0)} className={styles.pageBtn}>«</button>
            <button disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)} className={styles.pageBtn}>‹</button>
            <button disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)} className={styles.pageBtn}>›</button>
            <button disabled={page + 1 >= totalPages || loading} onClick={() => setPage(totalPages - 1)} className={styles.pageBtn}>»</button>
          </div>
        </div>
      )}
    </>
  )
}
