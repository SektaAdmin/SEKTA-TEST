'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listPastClasses, type ClassWithJoins } from '@/lib/queries/classes'
import { useRefs } from '@/contexts/RefsContext'
import ClassDetailModal from '@/components/ClassDetailModal'
import { formatDate } from '@/lib/formatters'
import { ticketTypeShortLabel } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import { toYMD } from '@/lib/dateUtils'
import { getActiveCount } from '@/lib/scheduleMetrics'

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 28px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Журнал занять</h1>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {total > 0 ? `${total} занять` : ''}
        </span>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        padding: 16, background: 'var(--bg-2)',
        border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
      }}>
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

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Завантаження...
        </div>
      ) : data.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          {MSG.empty.journalEmpty}
        </div>
      ) : (
        <>
          <div className="data-table-wrap">
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
                    <td style={{ color: 'var(--text-2)' }}>{cls.title ?? '—'}</td>
                    <td>{cls.trainers?.name ?? '—'}</td>
                    <td>{cls.halls?.name ?? '—'}</td>
                    <td>{getActiveCount(cls.enrollments)}</td>
                    <td>
                      {cls.is_cancelled ? (
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--danger-dim)', color: 'var(--danger)',
                          border: '0.5px solid var(--danger-border)',
                        }}>
                          Скасовано
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                          background: 'var(--success-dim)', color: 'var(--success)',
                        }}>
                          Проведено
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 16 }}>
            <button
              disabled={page === 0 || loading}
              onClick={() => setPage(p => p - 1)}
              style={paginationBtnStyle(page === 0 || loading)}
            >
              ← Назад
            </button>
            <span style={{ color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--mono)', minWidth: 200, textAlign: 'center' }}>
              Сторінка {page + 1} з {totalPages} (всього: {total})
            </span>
            <button
              disabled={page + 1 >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              style={paginationBtnStyle(page + 1 >= totalPages || loading)}
            >
              Вперед →
            </button>
          </div>
        </>
      )}

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
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '0.5px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'var(--font)',
  cursor: 'pointer',
}

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    border: '0.5px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font)',
    opacity: disabled ? 0.5 : 1,
  }
}
