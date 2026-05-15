'use client'
import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSeriesTemplates } from '@/hooks/useSeriesTemplates'
import { useTrainers } from '@/hooks/useTrainers'
import { useHalls } from '@/hooks/useHalls'
import { useTrainingTypes } from '@/hooks/useTrainingTypes'
import SeriesModal from '@/components/SeriesModal'
import HallWeekGrid from '@/components/HallWeekGrid'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import type { ClassSeries, Client } from '@/types'
import Sidebar from '@/components/Sidebar'
import { getOverCapacityCount } from '@/lib/scheduleMetrics'
import styles from './page.module.css'

// indexed by JS getDay(): 0=Нд, 1=Пн...6=Сб
const DAY_LABELS: Record<number, string> = { 0: 'Нд', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' }

// Рахує наступний понеділок у київському часі (навіть якщо сьогодні пн → +7)
function nextMondayKyiv(): string {
  const kyivDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }))
  const day = kyivDate.getDay() // 0=Нд, 1=Пн, ..., 6=Сб
  const diff = day === 0 ? 1 : (8 - day) % 7 || 7
  kyivDate.setDate(kyivDate.getDate() + diff)
  const y = kyivDate.getFullYear()
  const m = String(kyivDate.getMonth() + 1).padStart(2, '0')
  const d = String(kyivDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatMonday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
}

interface SeriesClientRow {
  id: string
  client_id: string
  clients: { first_name: string | null; last_name: string | null }
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
  const [editingSeries, setEditingSeries] = useState<ClassSeries | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clientsDrawerSeries, setClientsDrawerSeries] = useState<ClassSeries | null>(null)
  const [searchKey, setSearchKey] = useState(0)

  // Generate week dialog
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateWeeks, setGenerateWeeks] = useState(1)
  const [generating, setGenerating] = useState(false)
  const nextMonday = nextMondayKyiv()

  // Delete schedule dialog
  const [showDelete, setShowDelete] = useState(false)
  const [deleteWeeks, setDeleteWeeks] = useState(1)
  const [deleting, setDeleting] = useState(false)

  // Expandable series clients
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null)
  const [seriesClients, setSeriesClients] = useState<Record<string, SeriesClientRow[]>>({})
  const [clientsLoading, setClientsLoading] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const loadSeriesClients = useCallback(async (seriesId: string) => {
    if (seriesClients[seriesId]) return
    setClientsLoading(seriesId)
    const { data, error } = await supabase
      .from('series_clients')
      .select('id, client_id, clients(first_name, last_name)')
      .eq('series_id', seriesId)
      .order('created_at')
    if (error) {
      toast.error(error.message)
    } else {
      setSeriesClients(prev => ({ ...prev, [seriesId]: (data ?? []) as SeriesClientRow[] }))
    }
    setClientsLoading(null)
  }, [seriesClients])

  const toggleExpand = (seriesId: string) => {
    if (expandedSeriesId === seriesId) {
      setExpandedSeriesId(null)
    } else {
      setExpandedSeriesId(seriesId)
      loadSeriesClients(seriesId)
    }
  }

  const addSeriesClient = async (seriesId: string, client: Client) => {
    const { error } = await supabase
      .from('series_clients')
      .insert({ series_id: seriesId, client_id: client.id })
    if (error) {
      toast.error(error.message)
      return
    }
    const newRow: SeriesClientRow = {
      id: crypto.randomUUID(),
      client_id: client.id,
      clients: { first_name: client.first_name, last_name: client.last_name },
    }
    setSeriesClients(prev => ({
      ...prev,
      [seriesId]: [...(prev[seriesId] ?? []), newRow],
    }))
    refetch()
  }

  const removeSeriesClient = async (seriesId: string, rowId: string) => {
    const { error } = await supabase.from('series_clients').delete().eq('id', rowId)
    if (error) { toast.error(error.message); return }
    setSeriesClients(prev => ({
      ...prev,
      [seriesId]: (prev[seriesId] ?? []).filter(r => r.id !== rowId),
    }))
    refetch()
  }

  const deleteSeries = async (id: string) => {
    const { error } = await supabase.from('class_series').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setDeletingId(null)
    refetch()
  }

  const handleGenerate = async () => {
    setGenerating(true)
    const { data, error } = await supabase.rpc('generate_week', {
      p_start_date: nextMonday,
      p_weeks: generateWeeks,
    })
    setGenerating(false)
    setShowGenerate(false)
    if (error) {
      toast.error(error.message)
    } else {
      const row = data?.[0]
      toast.success(`Створено ${row?.classes_created ?? 0} занять, записано ${row?.enrollments_created ?? 0} клієнтів`)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { data: series } = await supabase
      .from('class_series')
      .select('id')
      .eq('type', 'template')

    const seriesIds = (series ?? []).map((s: { id: string }) => s.id)
    if (seriesIds.length === 0) {
      setDeleting(false)
      setShowDelete(false)
      toast.success('Немає шаблонів для видалення')
      return
    }

    const [y, m, d] = nextMonday.split('-').map(Number)
    const startDate = new Date(y, m - 1, d)
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + deleteWeeks * 7)

    const { error } = await supabase
      .from('classes')
      .delete()
      .in('series_id', seriesIds)
      .gte('starts_at', startDate.toISOString())
      .lt('starts_at', endDate.toISOString())

    setDeleting(false)
    setShowDelete(false)
    if (error) toast.error(error.message)
    else toast.success('Розклад видалено')
  }

  const openClientsDrawer = (s: ClassSeries) => {
    setClientsDrawerSeries(s)
    loadSeriesClients(s.id)
  }

  const closeClientsDrawer = () => { setClientsDrawerSeries(null); setConfirmRemoveId(null) }

  if (fetchError) toast.error(fetchError)

  return (
    <div className={styles.layout}>
    <Sidebar />
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
          <div className={styles.generateWrap}>
            <button
              className={styles.btnGenerate}
              onClick={() => setShowGenerate(v => !v)}
            >
              Виставити тиждень
            </button>
            {showGenerate && (
              <div className={styles.generateDialog}>
                <p className={styles.generateLabel}>
                  З понеділка <strong>{formatMonday(nextMonday)}</strong>
                </p>
                <div className={styles.generateRow}>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={generateWeeks}
                    onChange={e => setGenerateWeeks(Number(e.target.value))}
                    className={styles.generateInput}
                  />
                  <span className={styles.generateUnit}>тижн.</span>
                  <button
                    className={styles.btnCancel}
                    onClick={() => setShowGenerate(false)}
                    disabled={generating}
                  >
                    Скасувати
                  </button>
                  <button
                    className={styles.btnConfirm}
                    onClick={handleGenerate}
                    disabled={generating}
                  >
                    {generating ? 'Генерую...' : 'Виставити'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className={styles.generateWrap}>
            <button
              className={styles.btnDeleteSchedule}
              onClick={() => { setShowDelete(v => !v); setShowGenerate(false) }}
            >
              Видалити розклад
            </button>
            {showDelete && (
              <div className={styles.generateDialog}>
                <p className={styles.generateLabel}>
                  Видалити заняття з шаблонів з{' '}
                  <strong>{formatMonday(nextMonday)}</strong>
                </p>
                <p className={styles.deleteWarning}>
                  Буде видалено заняття та записи клієнтів за {deleteWeeks} тижн. Ручні заняття залишаться.
                </p>
                <div className={styles.generateRow}>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={deleteWeeks}
                    onChange={e => setDeleteWeeks(Number(e.target.value))}
                    className={styles.generateInput}
                  />
                  <span className={styles.generateUnit}>тижн.</span>
                  <button
                    className={styles.btnCancel}
                    onClick={() => setShowDelete(false)}
                    disabled={deleting}
                  >
                    Скасувати
                  </button>
                  <button
                    className={styles.btnDelete}
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Видаляю...' : 'Видалити'}
                  </button>
                </div>
              </div>
            )}
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
          <p className={styles.loading}>...</p>
        ) : templates.length === 0 ? (
          <p className={styles.empty}>Немає шаблонів. Створіть перший шаблон тижня.</p>
        ) : viewMode === 'grid' ? (
          <HallWeekGrid
            series={templates}
            halls={halls}
            trainingTypes={trainingTypes}
            onCardClick={openClientsDrawer}
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
                  const isExpanded = expandedSeriesId === series.id
                  const clients = seriesClients[series.id] ?? []
                  const trainerName = (series.trainers as { name: string } | null)?.name
                  const hallName = (series.halls as { name: string } | null)?.name

                  return (
                    <>
                      <tr key={series.id} className={styles.row}>
                        <td>{DAY_LABELS[series.day_of_week]}</td>
                        <td>{series.time_of_day.slice(0, 5)}</td>
                        <td>{series.ticket_type}</td>
                        <td>{trainerName ?? '—'}</td>
                        <td>{hallName ?? '—'}</td>
                        <td>{series.capacity ?? '—'}</td>
                        <td>
                          <button
                            className={styles.btnClients}
                            onClick={() => toggleExpand(series.id)}
                          >
                            {isExpanded ? '▾' : '▸'} Постійники ({clientCount})
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
                      {isExpanded && (
                        <tr key={`${series.id}-clients`} className={styles.expandedRow}>
                          <td colSpan={8}>
                            <div className={styles.clientsPanel}>
                              {clientsLoading === series.id ? (
                                <span className={styles.loading}>...</span>
                              ) : (
                                <>
                                  <div className={styles.clientsList}>
                                    {clients.length === 0 && (
                                      <span className={styles.noClients}>Немає постійників</span>
                                    )}
                                    {clients.map(row => (
                                      <span key={row.id} className={styles.clientChip}>
                                        {[row.clients.first_name, row.clients.last_name].filter(Boolean).join(' ') || 'Клієнт'}
                                        <button
                                          className={styles.btnRemove}
                                          onClick={() => removeSeriesClient(series.id, row.id)}
                                          aria-label="Видалити"
                                        >×</button>
                                      </span>
                                    ))}
                                  </div>
                                  <div className={styles.addClientRow}>
                                    <ClientSearchCombobox
                                      onSelect={client => addSeriesClient(series.id, client)}
                                      onClear={() => {}}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
          onClose={() => { setShowCreateModal(false); setEditingSeries(null) }}
          onSaved={() => { setShowCreateModal(false); setEditingSeries(null); refetch() }}
          trainers={trainers}
          halls={halls}
          trainingTypes={trainingTypes}
        />
      )}

      {/* Drawer: постійники обраного шаблону */}
      {clientsDrawerSeries && (() => {
        const s = clientsDrawerSeries
        const clients = seriesClients[s.id] ?? []
        const trainerName = (s.trainers as { name: string } | null)?.name
        const hallName = (s.halls as { name: string } | null)?.name
        return (
          <>
            <div className={styles.drawerOverlay} onClick={closeClientsDrawer} />
            <div className={styles.drawer}>
              <div className={styles.drawerHeader}>
                <div className={styles.drawerMeta}>
                  <span className={styles.drawerTime}>{DAY_LABELS[s.day_of_week]}, {s.time_of_day.slice(0, 5)}</span>
                  <span className={styles.drawerTitle}>
                    {trainingTypes.find(t => t.code === s.ticket_type)?.label ?? s.ticket_type}
                  </span>
                  {(trainerName || hallName) && (
                    <span className={styles.drawerSub}>
                      {[trainerName, hallName].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
                <button className={styles.drawerClose} onClick={closeClientsDrawer}>✕</button>
              </div>

              <div className={styles.drawerBody}>
                <div className={styles.addClientRow}>
                  <ClientSearchCombobox
                    key={searchKey}
                    onSelect={client => { addSeriesClient(s.id, client); setSearchKey(k => k + 1) }}
                    onClear={() => {}}
                  />
                </div>

                <p className={styles.drawerLabel}>Постійники</p>
                {clientsLoading === s.id ? (
                  <span className={styles.loading}>...</span>
                ) : clients.length === 0 ? (
                  <span className={styles.noClients}>Немає постійників</span>
                ) : (
                  <div className={styles.drawerClientList}>
                    {clients.map((row, i) => (
                      <div key={row.id} className={styles.drawerClientRow}>
                        <span className={styles.drawerClientNum}>{i + 1}</span>
                        <span className={styles.drawerClientName}>
                          {[row.clients.first_name, row.clients.last_name].filter(Boolean).join(' ') || 'Клієнт'}
                        </span>
                        {confirmRemoveId === row.id ? (
                          <button
                            className={styles.btnRemoveConfirm}
                            onClick={() => { removeSeriesClient(s.id, row.id); setConfirmRemoveId(null) }}
                          >Підтвердити</button>
                        ) : (
                          <button
                            className={styles.btnRemove}
                            onClick={() => setConfirmRemoveId(row.id)}
                          >Видалити</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )
      })()}
    </div>
    </div>
  )
}
