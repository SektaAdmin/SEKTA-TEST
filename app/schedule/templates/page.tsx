'use client'
import { useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSeriesTemplates } from '@/hooks/useSeriesTemplates'
import { useTrainers } from '@/hooks/useTrainers'
import { useHalls } from '@/hooks/useHalls'
import { useTrainingTypes } from '@/hooks/useTrainingTypes'
import SeriesModal from '@/components/SeriesModal'
import HallWeekGrid from '@/components/HallWeekGrid'
import CalendarPopover, { calStyles } from '@/components/CalendarPopover'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import type { ClassSeries, Client } from '@/types'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import { getOverCapacityCount } from '@/lib/scheduleMetrics'
import styles from './page.module.css'

// indexed by JS getDay(): 0=Нд, 1=Пн...6=Сб
const DAY_LABELS: Record<number, string> = { 0: 'Нд', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' }

// Поточний або наступний понеділок у київському часі (якщо сьогодні пн → сьогодні)
function thisOrNextMondayKyiv(): string {
  const kyivDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }))
  const day = kyivDate.getDay()
  const diff = day === 1 ? 0 : day === 0 ? 1 : 8 - day
  kyivDate.setDate(kyivDate.getDate() + diff)
  const y = kyivDate.getFullYear()
  const m = String(kyivDate.getMonth() + 1).padStart(2, '0')
  const d = String(kyivDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMondayOf(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday
}


export default function TemplatesPage() {
  const { templates: rawTemplates, loading, fetchError, refetch } = useSeriesTemplates()
  const { trainers } = useTrainers()
  const { halls } = useHalls()
  const { trainingTypes } = useTrainingTypes()

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filterTrainer, setFilterTrainer] = useState('')
  const [filterClient, setFilterClient] = useState<Client | null>(null)
  const [clientFilterKey, setClientFilterKey] = useState(0)

  // Sort Mon(1)–Sun(0): map 0→7 so Sunday sorts last
  const templates = useMemo(() => {
    let result = [...rawTemplates]
    if (filterTrainer) result = result.filter(s => s.trainer_id === filterTrainer)
    if (filterClient) result = result.filter(s => (s.series_clients ?? []).some(sc => sc.client_id === filterClient.id))
    return result.sort((a, b) => {
      const sa = a.day_of_week === 0 ? 7 : a.day_of_week
      const sb = b.day_of_week === 0 ? 7 : b.day_of_week
      return sa !== sb ? sa - sb : a.time_of_day.localeCompare(b.time_of_day)
    })
  }, [rawTemplates, filterTrainer, filterClient])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [prefillSeries, setPrefillSeries] = useState<{ day_of_week?: number; time_of_day?: string; hall_id?: string } | null>(null)
  const [editingSeries, setEditingSeries] = useState<ClassSeries | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Shared calendar state for generate/delete dialogs
  const [showGenerate, setShowGenerate] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [selectedMondays, setSelectedMondays] = useState<string[]>(() => [thisOrNextMondayKyiv()])
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date(thisOrNextMondayKyiv())
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [generating, setGenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const generateWrapRef = useRef<HTMLDivElement>(null)
  const deleteWrapRef = useRef<HTMLDivElement>(null)

  const deleteSeries = useCallback(async (id: string) => {
    const { error } = await supabase.from('class_series').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setDeletingId(null)
    refetch()
  }, [refetch])

  const handleGenerate = async () => {
    if (selectedMondays.length === 0) return
    setGenerating(true)
    let totalClasses = 0, totalEnrollments = 0
    for (const monday of [...selectedMondays].sort()) {
      const { data, error } = await supabase.rpc('generate_week', { p_start_date: monday, p_weeks: 1 })
      if (error) { toast.error(error.message); setGenerating(false); return }
      totalClasses += data?.[0]?.classes_created ?? 0
      totalEnrollments += data?.[0]?.enrollments_created ?? 0
    }
    setGenerating(false)
    setShowGenerate(false)
    toast.success(`Створено ${totalClasses} занять, записано ${totalEnrollments} клієнтів`)
  }

  const handleDelete = async () => {
    if (selectedMondays.length === 0) return
    setDeleting(true)
    const { data: series } = await supabase.from('class_series').select('id').eq('type', 'template')
    const seriesIds = (series ?? []).map((s: { id: string }) => s.id)
    if (seriesIds.length === 0) {
      setDeleting(false)
      setShowDelete(false)
      toast.success('Немає шаблонів для видалення')
      return
    }
    for (const monday of [...selectedMondays].sort()) {
      const [y, m, d] = monday.split('-').map(Number)
      const startDate = new Date(y, m - 1, d)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 7)
      const { error } = await supabase
        .from('classes').delete()
        .in('series_id', seriesIds)
        .gte('starts_at', startDate.toISOString())
        .lt('starts_at', endDate.toISOString())
      if (error) { toast.error(error.message); setDeleting(false); return }
    }
    setDeleting(false)
    setShowDelete(false)
    toast.success('Розклад видалено')
  }

  const toggleMonday = (dateStr: string) => {
    setSelectedMondays(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    )
  }

  const openGenerateDialog = () => {
    setSelectedMondays([thisOrNextMondayKyiv()])
    const d = new Date(thisOrNextMondayKyiv())
    setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() })
    setShowGenerate(true)
    setShowDelete(false)
  }

  const openDeleteDialog = () => {
    setSelectedMondays([thisOrNextMondayKyiv()])
    const d = new Date(thisOrNextMondayKyiv())
    setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() })
    setShowDelete(true)
    setShowGenerate(false)
  }

  if (fetchError) toast.error(fetchError)

  return (
    <div className={styles.layout}>
    <Sidebar />
    <BottomNav />
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <Link href="/schedule" className={styles.backLink}>← Розклад</Link>
          <h1 className={styles.title}>Шаблони тижня</h1>
        </div>
        <div className={styles.topbarRight}>
          <div className={styles.viewToggle}>
            <button
              className={viewMode === 'grid' ? styles.toggleActive : styles.toggleBtn}
              onClick={() => setViewMode('grid')}
            >
              Сітка
            </button>
            <button
              className={viewMode === 'list' ? styles.toggleActive : styles.toggleBtn}
              onClick={() => setViewMode('list')}
            >
              Список
            </button>
          </div>
          <div className={styles.generateWrap} ref={generateWrapRef}>
            <button className={styles.btnGenerate} onClick={openGenerateDialog}>
              Виставити тиждень
            </button>
            <MiniCalendar
              anchorRef={generateWrapRef as React.RefObject<HTMLElement>}
              open={showGenerate}
              onClose={() => setShowGenerate(false)}
              calendarMonth={calendarMonth}
              setCalendarMonth={setCalendarMonth}
              selectedMondays={selectedMondays}
              toggleMonday={toggleMonday}
              footer={
                <div className={styles.generateRow}>
                  <button className={styles.btnCancel} onClick={() => setShowGenerate(false)} disabled={generating}>
                    Скасувати
                  </button>
                  <button className={styles.btnConfirm} onClick={handleGenerate} disabled={generating || selectedMondays.length === 0}>
                    {generating ? 'Генерую...' : `Виставити${selectedMondays.length > 1 ? ` (${selectedMondays.length})` : ''}`}
                  </button>
                </div>
              }
            />
          </div>
          <div className={styles.generateWrap} ref={deleteWrapRef}>
            <button className={styles.btnDeleteSchedule} onClick={openDeleteDialog}>
              Видалити розклад
            </button>
            <MiniCalendar
              anchorRef={deleteWrapRef as React.RefObject<HTMLElement>}
              open={showDelete}
              onClose={() => setShowDelete(false)}
              calendarMonth={calendarMonth}
              setCalendarMonth={setCalendarMonth}
              selectedMondays={selectedMondays}
              toggleMonday={toggleMonday}
              footer={
                <>
                  <p className={styles.deleteWarning}>
                    Буде видалено заняття з шаблонів та записи клієнтів. Ручні заняття залишаться.
                  </p>
                  <div className={styles.generateRow}>
                    <button className={styles.btnCancel} onClick={() => setShowDelete(false)} disabled={deleting}>
                      Скасувати
                    </button>
                    <button className={styles.btnDelete} onClick={handleDelete} disabled={deleting || selectedMondays.length === 0}>
                      {deleting ? 'Видаляю...' : `Видалити${selectedMondays.length > 1 ? ` (${selectedMondays.length})` : ''}`}
                    </button>
                  </div>
                </>
              }
            />
          </div>
          <button
            className={styles.btnNew}
            onClick={() => setShowCreateModal(true)}
          >
            + Новий шаблон
          </button>
        </div>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <button
            className={`${styles.filterBtn} ${filterTrainer === '' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilterTrainer('')}
          >
            Всі тренери
          </button>
          {trainers.filter(t => t.is_active).map(t => (
            <button
              key={t.id}
              className={`${styles.filterBtn} ${filterTrainer === t.id ? styles.filterBtnActive : ''}`}
              onClick={() => setFilterTrainer(f => f === t.id ? '' : t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className={styles.clientFilterWrap}>
          {filterClient ? (
            <span className={styles.clientFilterChip}>
              {[filterClient.first_name, filterClient.last_name].filter(Boolean).join(' ') || filterClient.phone || 'Клієнт'}
              <button
                className={styles.clientFilterClear}
                onClick={() => { setFilterClient(null); setClientFilterKey(k => k + 1) }}
                aria-label="Скинути фільтр по клієнту"
              >×</button>
            </span>
          ) : (
            <ClientSearchCombobox
              key={clientFilterKey}
              onSelect={client => setFilterClient(client)}
              onClear={() => {}}
              inputId="client-filter"
            />
          )}
        </div>
      </div>

      <div className={styles.content}>
        {loading ? (
          <span className={styles.loading}>...</span>
        ) : templates.length === 0 ? (
          <p className={styles.empty}>Немає шаблонів. Створіть перший шаблон тижня.</p>
        ) : viewMode === 'grid' ? (
          <HallWeekGrid
            series={templates}
            halls={halls}
            trainingTypes={trainingTypes}
            onCardClick={s => setEditingSeries(s)}
            onSlotClick={(dow, time, hallId) => {
              setPrefillSeries({ day_of_week: dow, time_of_day: time, hall_id: hallId ?? undefined })
              setShowCreateModal(true)
            }}
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>День</th>
                  <th>Час</th>
                  <th>Тип</th>
                  <th>Тренер</th>
                  <th>Зал</th>
                  <th>Місткість</th>
                  <th>Постійники</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {templates.map(series => {
                  const clientCount = series.series_clients?.length ?? 0
                  const overCapacity = getOverCapacityCount(clientCount, series.capacity)
                  const trainerName = (series.trainers as { name: string } | null)?.name
                  const hallName = (series.halls as { name: string } | null)?.name
                  const typeLabel = trainingTypes.find(t => t.code === series.ticket_type)?.label ?? series.ticket_type

                  return (
                    <tr key={series.id} className={styles.row}>
                      <td>{DAY_LABELS[series.day_of_week]}</td>
                      <td>{series.time_of_day.slice(0, 5)}</td>
                      <td>{typeLabel}</td>
                      <td>{trainerName ?? '—'}</td>
                      <td>{hallName ?? '—'}</td>
                      <td>{series.capacity ?? '—'}</td>
                      <td>
                        <button
                          className={styles.btnClients}
                          onClick={() => setEditingSeries(series)}
                        >
                          Постійники ({clientCount})
                        </button>
                        {overCapacity > 0 && (
                          <span className={styles.waitlistBadge}>+{overCapacity} резерв</span>
                        )}
                      </td>
                      <td className={styles.actions}>
                        <button
                          className={styles.btnEdit}
                          onClick={() => setEditingSeries(series)}
                        >
                          Редагувати
                        </button>
                        {deletingId === series.id ? (
                          <span className={styles.deleteConfirm}>
                            Шаблон буде видалено. Вже створені заняття залишаться.{' '}
                            <button className={styles.btnDanger} onClick={() => deleteSeries(series.id)}>Так, видалити</button>
                            {' '}
                            <button className={styles.btnCancel} onClick={() => setDeletingId(null)}>Скасувати</button>
                          </span>
                        ) : (
                          <button
                            className={styles.btnDanger}
                            onClick={() => setDeletingId(series.id)}
                          >
                            Видалити
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showCreateModal || editingSeries) && (
        <SeriesModal
          existing={editingSeries}
          prefill={prefillSeries ?? undefined}
          onClose={() => { setShowCreateModal(false); setEditingSeries(null); setPrefillSeries(null) }}
          onSaved={() => { setShowCreateModal(false); setEditingSeries(null); setPrefillSeries(null); refetch() }}
          trainers={trainers}
          halls={halls}
          trainingTypes={trainingTypes}
        />
      )}
    </div>
    </div>
  )
}

interface MiniCalendarProps {
  anchorRef: React.RefObject<HTMLElement>
  open: boolean
  onClose: () => void
  calendarMonth: { year: number; month: number }
  setCalendarMonth: (v: { year: number; month: number }) => void
  selectedMondays: string[]
  toggleMonday: (dateStr: string) => void
  footer?: React.ReactNode
}

function MiniCalendar({ anchorRef, open, onClose, calendarMonth, setCalendarMonth, selectedMondays, toggleMonday, footer }: MiniCalendarProps) {
  const { year, month } = calendarMonth

  return (
    <CalendarPopover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      viewYear={year}
      viewMonth={month}
      onPrevMonth={() => { const d = new Date(year, month - 1, 1); setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() }) }}
      onNextMonth={() => { const d = new Date(year, month + 1, 1); setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() }) }}
      footer={footer}
      renderDay={(day, inMonth, i) => {
        const monday = getMondayOf(day)
        const mondayStr = toDateStr(monday)
        const isWeekSelected = selectedMondays.includes(mondayStr)
        const isStart = day.getDay() === 1
        const isEnd = day.getDay() === 0

        return (
          <button
            key={i}
            type="button"
            className={[
              calStyles.day,
              !inMonth ? calStyles.dayOutside : '',
              isWeekSelected ? calStyles.dayInWeek : '',
              isWeekSelected && isStart ? calStyles.dayWeekStart : '',
              isWeekSelected && isEnd ? calStyles.dayWeekEnd : '',
            ].filter(Boolean).join(' ')}
            onClick={() => toggleMonday(mondayStr)}
            aria-label={day.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
          >
            <span className={calStyles.dayNum}>{day.getDate()}</span>
          </button>
        )
      }}
    />
  )
}
