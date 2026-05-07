'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useSeriesTemplates } from '@/hooks/useSeriesTemplates'
import { useTrainers } from '@/hooks/useTrainers'
import { useHalls } from '@/hooks/useHalls'
import { useTrainingTypes } from '@/hooks/useTrainingTypes'
import SeriesModal from '@/components/SeriesModal'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import type { ClassSeries, Client } from '@/types'
import Sidebar from '@/components/Sidebar'
import styles from './page.module.css'

const DAY_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

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
  const { templates, loading, fetchError, refetch } = useSeriesTemplates()
  const { trainers } = useTrainers()
  const { halls } = useHalls()
  const { trainingTypes } = useTrainingTypes()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingSeries, setEditingSeries] = useState<ClassSeries | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Generate week dialog
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateWeeks, setGenerateWeeks] = useState(1)
  const [generating, setGenerating] = useState(false)
  const nextMonday = nextMondayKyiv()

  // Expandable series clients
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null)
  const [seriesClients, setSeriesClients] = useState<Record<string, SeriesClientRow[]>>({})
  const [clientsLoading, setClientsLoading] = useState<string | null>(null)

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
          <button
            className={styles.btnNew}
            onClick={() => setShowCreateModal(true)}
          >
            + Новий шаблон
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {loading ? (
          <p className={styles.loading}>...</p>
        ) : templates.length === 0 ? (
          <p className={styles.empty}>Немає шаблонів. Створіть перший шаблон тижня.</p>
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
                  const clientCount = series.series_clients?.[0]
                    ? (series.series_clients[0] as unknown as { count: number }).count
                    : 0
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
                                        {[row.clients.last_name, row.clients.first_name].filter(Boolean).join(' ') || 'Клієнт'}
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
    </div>
    </div>
  )
}
