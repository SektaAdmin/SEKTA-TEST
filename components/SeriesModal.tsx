'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import { MSG } from '@/lib/messages'
import type { ClassSeries, Trainer, Hall, TrainingType, Client } from '@/types'
import styles from './SeriesModal.module.css'

const DAY_OPTIONS = [
  { label: 'Понеділок', value: 1 },
  { label: 'Вівторок', value: 2 },
  { label: 'Середа', value: 3 },
  { label: 'Четвер', value: 4 },
  { label: "П'ятниця", value: 5 },
  { label: 'Субота', value: 6 },
  { label: 'Неділя', value: 0 },
]

interface FormValues {
  ticket_type: string
  trainer_id: string
  hall_id: string
  day_of_week: string
  time_of_day: string
  duration_min: number
  capacity: string
  title: string
  notes: string
}

interface Prefill {
  day_of_week?: number
  time_of_day?: string
  hall_id?: string
}

interface SeriesClientRow {
  id: string
  client_id: string
  hours_attended: number[] | null
  clients: { first_name: string | null; last_name: string | null }
}

interface Props {
  existing?: ClassSeries | null
  prefill?: Prefill
  onClose: () => void
  onSaved: () => void
  trainers: Trainer[]
  halls: Hall[]
  trainingTypes: TrainingType[]
}

function formatHoursLabel(hours: number[] | null, timeOfDay: string): string | null {
  if (!hours || hours.length === 0) return null
  const sorted = [...hours].sort()
  if (sorted.length >= 2) return null
  const [h, m] = timeOfDay.split(':').map(Number)
  const totalMin = h * 60 + m + (sorted[0] - 1) * 60
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0')
  const mm = String(totalMin % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function SeriesModal({ existing, prefill, onClose, onSaved, trainers, halls, trainingTypes }: Props) {
  const [createdSeries, setCreatedSeries] = useState<ClassSeries | null>(null)
  const activeSeries = existing ?? createdSeries
  const isEdit = !!activeSeries

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: existing ? {
      ticket_type: existing.ticket_type,
      trainer_id: existing.trainer_id ?? '',
      hall_id: existing.hall_id ?? '',
      day_of_week: String(existing.day_of_week),
      time_of_day: existing.time_of_day.slice(0, 5),
      duration_min: existing.duration_min,
      capacity: existing.capacity?.toString() ?? '',
      title: existing.title ?? '',
      notes: existing.notes ?? '',
    } : {
      ticket_type: trainingTypes[0]?.code ?? '',
      trainer_id: '',
      hall_id: prefill?.hall_id ?? '',
      day_of_week: String(prefill?.day_of_week ?? 1),
      time_of_day: prefill?.time_of_day ?? '10:00',
      duration_min: 60,
      capacity: '',
      title: '',
      notes: '',
    },
  })

  const durationMin = watch('duration_min')
  const timeOfDay = watch('time_of_day')

  // Постійники state
  const [clients, setClients] = useState<SeriesClientRow[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [searchKey, setSearchKey] = useState(0)
  const [selectedHours, setSelectedHours] = useState<number[]>([1, 2])

  useEffect(() => {
    if (!isEdit || !activeSeries?.id) return
    setClientsLoading(true)
    supabase
      .from('series_clients')
      .select('id, client_id, hours_attended, clients(first_name, last_name)')
      .eq('series_id', activeSeries.id)
      .order('created_at')
      .then((result: { data: unknown[] | null; error: { message: string } | null }) => {
        if (result.error) toast.error(result.error.message)
        else setClients((result.data ?? []) as SeriesClientRow[])
        setClientsLoading(false)
      })
  }, [isEdit, activeSeries?.id])

  const addClient = async (client: Client) => {
    if (!activeSeries?.id) return
    const hours = Number(durationMin) >= 120 ? selectedHours.slice().sort() : undefined
    const insertData: Record<string, unknown> = { series_id: activeSeries.id, client_id: client.id }
    if (hours !== undefined) insertData.hours_attended = hours
    const { error } = await supabase.from('series_clients').insert(insertData)
    if (error) { toast.error(error.message); return }
    setClients(prev => [...prev, {
      id: crypto.randomUUID(),
      client_id: client.id,
      hours_attended: hours ?? null,
      clients: { first_name: client.first_name, last_name: client.last_name },
    }])
    setSearchKey(k => k + 1)
  }

  const removeClient = async (rowId: string) => {
    const { error } = await supabase.from('series_clients').delete().eq('id', rowId)
    if (error) { toast.error(error.message); return }
    setClients(prev => prev.filter(r => r.id !== rowId))
    setConfirmRemoveId(null)
  }

  const onSubmit = async (values: FormValues) => {
    const payload = {
      ticket_type: values.ticket_type,
      trainer_id: values.trainer_id || null,
      hall_id: values.hall_id || null,
      day_of_week: Number(values.day_of_week),
      time_of_day: values.time_of_day,
      duration_min: Number(values.duration_min),
      capacity: values.capacity ? Number(values.capacity) : null,
      title: values.title.trim() || null,
      notes: values.notes.trim() || null,
      type: 'template' as const,
    }

    if (isEdit) {
      const { error } = await supabase.from('class_series').update(payload).eq('id', activeSeries!.id)
      if (error) { alert(error.message); return }
      onSaved()
    } else {
      const { data, error } = await supabase.from('class_series').insert(payload).select().single()
      if (error) { alert(error.message); return }
      setCreatedSeries(data as ClassSeries)
      // не закриваємо модалку — даємо змогу одразу додати постійників
    }
  }

  const handleClose = () => {
    if (createdSeries) onSaved()
    else onClose()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <ModalShell
        title={isEdit ? 'Редагувати шаблон' : 'Новий шаблон'}
        onClose={handleClose}
        width={520}
        footer={
          <form>
            <ModalFooter
              onCancel={handleClose}
              onSave={createdSeries ? undefined : () => {}}
              cancelLabel={createdSeries ? 'Готово' : 'Скасувати'}
              saveLabel="Створити"
              loading={isSubmitting}
              saveType="submit"
            />
          </form>
        }
      >
        <div className={styles.field}>
          <label htmlFor="sm-type">Тип заняття <span className={styles.required}>*</span></label>
          <select id="sm-type" {...register('ticket_type', { required: true })} disabled={isSubmitting}>
            {trainingTypes.map(t => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
          {errors.ticket_type && <p className={styles.errorHint}>Оберіть тип</p>}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="sm-trainer">Тренер</label>
            <select id="sm-trainer" {...register('trainer_id')} disabled={isSubmitting}>
              <option value="">— без тренера —</option>
              {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="sm-hall">Зал</label>
            <select id="sm-hall" {...register('hall_id')} disabled={isSubmitting}>
              <option value="">— без залу —</option>
              {halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="sm-dow">День тижня <span className={styles.required}>*</span></label>
            <select id="sm-dow" {...register('day_of_week')} disabled={isSubmitting}>
              {DAY_OPTIONS.map(({ label, value }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="sm-time">Час початку <span className={styles.required}>*</span></label>
            <input
              id="sm-time"
              type="time"
              {...register('time_of_day', { required: true })}
              disabled={isSubmitting}
            />
            {errors.time_of_day && <p className={styles.errorHint}>Вкажіть час</p>}
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="sm-dur">Тривалість, хв</label>
            <input
              id="sm-dur"
              type="number"
              min={15}
              step={15}
              {...register('duration_min', { min: 15, valueAsNumber: true })}
              disabled={isSubmitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="sm-cap">Ліміт місць</label>
            <input
              id="sm-cap"
              type="number"
              min={1}
              placeholder="Без ліміту"
              {...register('capacity')}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="sm-title">Назва (опц.)</label>
          <input
            id="sm-title"
            type="text"
            placeholder="Кастомна назва"
            {...register('title')}
            disabled={isSubmitting}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="sm-notes">Нотатки</label>
          <textarea
            id="sm-notes"
            rows={2}
            placeholder="Додаткова інформація..."
            {...register('notes')}
            disabled={isSubmitting}
          />
        </div>

        {isEdit && (
          <>
            <div className={styles.divider} />
            <p className={styles.sectionLabel}>Постійники</p>

            {Number(durationMin) >= 120 && (
              <div className={styles.hoursSelect}>
                {[1, 2].map(hour => {
                  const label = formatHoursLabel([hour], timeOfDay) ?? String(hour)
                  return (
                    <label key={hour} className={styles.hoursLabel}>
                      <input
                        type="checkbox"
                        checked={selectedHours.includes(hour)}
                        onChange={e => setSelectedHours(prev =>
                          e.target.checked ? [...prev, hour].sort() : prev.filter(h => h !== hour)
                        )}
                      />
                      {label}
                    </label>
                  )
                })}
              </div>
            )}

            <div className={styles.addClientRow}>
              <ClientSearchCombobox
                key={searchKey}
                onSelect={addClient}
                onClear={() => {}}
              />
            </div>

            {clientsLoading ? (
              <span className={styles.clientsLoading}>Завантаження...</span>
            ) : clients.length === 0 ? (
              <span className={styles.noClients}>{MSG.empty.seriesClients}</span>
            ) : (
              <div className={styles.clientList}>
                {clients.map((row, i) => {
                  const hoursLabel = formatHoursLabel(row.hours_attended, timeOfDay)
                  return (
                    <div key={row.id} className={styles.clientRow}>
                      <span className={styles.clientNum}>{i + 1}</span>
                      <span className={styles.clientName}>
                        {[row.clients.first_name, row.clients.last_name].filter(Boolean).join(' ') || 'Клієнт'}
                      </span>
                      {hoursLabel && <span className={styles.hoursTag}>{hoursLabel}</span>}
                      {confirmRemoveId === row.id ? (
                        <button
                          type="button"
                          className={styles.btnRemoveConfirm}
                          onClick={() => removeClient(row.id)}
                        >Підтвердити</button>
                      ) : (
                        <button
                          type="button"
                          className={styles.btnRemove}
                          onClick={() => setConfirmRemoveId(row.id)}
                        >Видалити</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </ModalShell>
    </form>
  )
}
