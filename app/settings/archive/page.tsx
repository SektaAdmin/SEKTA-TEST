'use client'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listArchivedClasses } from '@/lib/queries/classes'
import { useRefs } from '@/contexts/RefsContext'
import ClassDetailModal from '@/components/ClassDetailModal'
import { formatDate } from '@/lib/formatters'
import { ticketTypeShortLabel } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import { toYMD } from '@/lib/dateUtils'
import styles from '../settings.module.css'

type ClassWithJoins = any

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ArchivePage() {
  const { trainers, halls, trainingTypes } = useRefs()

  const [page, setPage] = useState(0)
  const [pageSize] = useState(20)
  const [data, setData] = useState<ClassWithJoins[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const [filterTrainer, setFilterTrainer] = useState<string>('')
  const [filterHall, setFilterHall] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')

  const [selectedClass, setSelectedClass] = useState<ClassWithJoins | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const res = await listArchivedClasses(supabase, page, pageSize, {
        dateFrom: dateFrom?.toISOString(),
        dateTo: dateTo?.toISOString(),
        hallId: filterHall || undefined,
        trainerId: filterTrainer || undefined,
        ticketType: filterType || undefined,
      })
      if (res.error) {
        toast.error('Помилка завантаження архіву')
      } else {
        setData(res.data)
        setTotal(res.count)
      }
      setLoading(false)
    }
    fetch()
  }, [page, pageSize, dateFrom, dateTo, filterTrainer, filterHall, filterType])

  const totalPages = Math.ceil(total / pageSize)

  const handleRowClick = (cls: ClassWithJoins) => {
    setSelectedClass(cls)
    setShowDetail(true)
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Архів занять</h1>

      <div className={styles.filterBar}>
        <input
          type="date"
          value={dateFrom ? toYMD(dateFrom) : ''}
          onChange={e => setDateFrom(e.target.value ? new Date(e.target.value) : undefined)}
          className={styles.filterSelect}
          title="Від"
        />
        <input
          type="date"
          value={dateTo ? toYMD(dateTo) : ''}
          onChange={e => setDateTo(e.target.value ? new Date(e.target.value) : undefined)}
          className={styles.filterSelect}
          title="До"
        />

        <select
          value={filterTrainer}
          onChange={e => { setFilterTrainer(e.target.value); setPage(0) }}
          className={styles.filterSelect}
        >
          <option value="">Всі тренери</option>
          {trainers.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={filterHall}
          onChange={e => { setFilterHall(e.target.value); setPage(0) }}
          className={styles.filterSelect}
        >
          <option value="">Всі зали</option>
          {halls.map(h => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(0) }}
          className={styles.filterSelect}
        >
          <option value="">Всі типи</option>
          {trainingTypes.map(t => (
            <option key={t.id} value={t.code}>{t.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className={styles.loadingMessage}>Завантаження...</div>
      ) : data.length === 0 ? (
        <div className={styles.emptyMessage}>{MSG.empty.salesFiltered}</div>
      ) : (
        <>
          <div className={styles.dataTableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Час</th>
                  <th>Тип</th>
                  <th>Тренер</th>
                  <th>Зал</th>
                  <th>Записів</th>
                  <th>Скасовано</th>
                </tr>
              </thead>
              <tbody>
                {data.map(cls => (
                  <tr key={cls.id} onClick={() => handleRowClick(cls)} style={{ cursor: 'pointer' }}>
                    <td>{formatDate(new Date(cls.starts_at))}</td>
                    <td>{formatTime(cls.starts_at)}</td>
                    <td>{ticketTypeShortLabel(cls.ticket_type)}</td>
                    <td>{cls.trainers?.name ?? '—'}</td>
                    <td>{cls.halls?.name ?? '—'}</td>
                    <td>{cls.enrollments?.length ?? 0}</td>
                    <td>{cls.is_cancelled ? 'Так' : 'Ні'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.paginationControls}>
            <button
              disabled={page === 0 || loading}
              onClick={() => setPage(p => p - 1)}
              className={styles.paginationBtn}
            >
              ← Назад
            </button>
            <span className={styles.pageInfo}>
              Сторінка {page + 1} з {totalPages} (всього: {total})
            </span>
            <button
              disabled={page + 1 >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              className={styles.paginationBtn}
            >
              Вперед →
            </button>
          </div>
        </>
      )}

      {showDetail && selectedClass && (
        <ClassDetailModal
          classId={selectedClass.id}
          onClose={() => setShowDetail(false)}
          onClassUpdated={() => {
            setShowDetail(false)
            setPage(0)
          }}
        />
      )}
    </div>
  )
}
