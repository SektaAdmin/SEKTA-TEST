'use client'
import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { listActiveTrainers } from '@/lib/queries/trainers'
import { listActiveHalls } from '@/lib/queries/halls'
import { listActiveTrainingTypes } from '@/lib/queries/training-types'
import {
  checkClassConflicts,
  insertClasses,
  updateClass,
  listFutureSeriesClasses,
  updateFutureSeriesClasses,
  insertSeries,
  updateSeries,
  deleteSeries,
  type ClassPayload,
} from '@/lib/queries/classes'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
import { isoToDatetimeLocal } from '@/lib/formatters'
import DateTimeInput from '@/components/DateTimeInput'
import { VM } from '@/lib/validation-messages'
import type { Class, Trainer, Hall, TrainingType } from '@/types'
import styles from './ClassModal.module.css'


// value = JS getDay() (0=Нд), order = Mon–Sun
const DAY_OPTIONS = [
  { label: 'Пн', value: 1 },
  { label: 'Вт', value: 2 },
  { label: 'Ср', value: 3 },
  { label: 'Чт', value: 4 },
  { label: 'Пт', value: 5 },
  { label: 'Сб', value: 6 },
  { label: 'Нд', value: 0 },
]

interface FormValues {
  ticket_type: string
  trainer_id: string
  hall_id: string
  starts_at: string
  duration_min: number
  capacity: string
  title: string
  notes: string
  // series fields
  weeks: number
  day_of_week: string
  time_of_day: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
  existing?: Class | null
  prefill?: { starts_at: string; hall_id?: string }
}

type EditScope = 'this' | 'future'

function todayAt10(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`
}

function pad(n: number) { return String(n).padStart(2, '0') }

function isoToTimeLocal(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ClassModal({ onClose, onSaved, existing, prefill }: Props) {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [halls, setHalls] = useState<Hall[]>([])
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([])
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const [isSeries, setIsSeries] = useState(false)
  const [editScope, setEditScope] = useState<EditScope | null>(
    existing?.series_id ? null : 'this'
  )

  const isEdit = !!existing
  const hasSeries = !!existing?.series_id
  const scopeChosen = !hasSeries || editScope !== null

  useEffect(() => {
    Promise.all([
      listActiveTrainers(supabase),
      listActiveHalls(supabase),
      listActiveTrainingTypes(supabase),
    ]).then(([t, h, tt]) => {
      setTrainers(t.data)
      setHalls(h.data)
      setTrainingTypes(tt.data)
    })
  }, [])

  const startsAt = existing ? new Date(existing.starts_at) : new Date()
  const defaultDayOfWeek = startsAt.getDay()
  const defaultTimeOfDay = existing ? isoToTimeLocal(existing.starts_at) : '10:00'

  const { register, handleSubmit, setValue, watch, control, formState: { errors } } = useForm<FormValues>({
    defaultValues: existing ? {
      ticket_type: existing.ticket_type,
      trainer_id: existing.trainer_id ?? '',
      hall_id: existing.hall_id ?? '',
      starts_at: isoToDatetimeLocal(existing.starts_at),
      duration_min: existing.duration_min,
      capacity: existing.capacity?.toString() ?? '',
      title: existing.title ?? '',
      notes: existing.notes ?? '',
      weeks: 4,
      day_of_week: String(defaultDayOfWeek),
      time_of_day: defaultTimeOfDay,
    } : {
      ticket_type: '',
      trainer_id: '',
      hall_id: prefill?.hall_id ?? '',
      starts_at: prefill?.starts_at ?? todayAt10(),
      duration_min: 60,
      capacity: '',
      title: '',
      notes: '',
      weeks: 4,
      day_of_week: String(new Date().getDay()),
      time_of_day: '10:00',
    },
  })

  useEffect(() => {
    if (!existing && trainingTypes.length > 0) {
      setValue('ticket_type', trainingTypes[0].code)
    }
  }, [trainingTypes, existing, setValue])

  // sync day_of_week when starts_at changes (new series only)
  const startsAtVal = watch('starts_at')
  useEffect(() => {
    if (!isEdit && isSeries && startsAtVal) {
      const d = new Date(startsAtVal)
      if (!isNaN(d.getTime())) {
        setValue('day_of_week', String(d.getDay()))
        setValue('time_of_day', `${pad(d.getHours())}:${pad(d.getMinutes())}`)
      }
    }
  }, [startsAtVal, isSeries, isEdit, setValue])

  const checkConflicts = (
    starts_at: string,
    duration_min: number,
    hall_id: string | null,
    trainer_id: string | null,
    exclude_id?: string,
  ): Promise<string | null> =>
    checkClassConflicts(supabase, { starts_at, duration_min, hall_id, trainer_id, exclude_id })

  const onSubmit = async (values: FormValues) => {
    if (!scopeChosen) return
    setLoading(true)
    setServerError('')

    const payload: ClassPayload = {
      ticket_type: values.ticket_type,
      trainer_id: values.trainer_id || null,
      hall_id: values.hall_id || null,
      starts_at: new Date(values.starts_at).toISOString(),
      duration_min: Number(values.duration_min),
      capacity: values.capacity ? Number(values.capacity) : null,
      title: values.title.trim() || null,
      notes: values.notes.trim() || null,
    }

    if (isEdit && (!hasSeries || editScope === 'this')) {
      const conflict = await checkConflicts(payload.starts_at, payload.duration_min, payload.hall_id, payload.trainer_id, existing!.id)
      if (conflict) { setServerError(conflict); setLoading(false); return }
      const { error } = await updateClass(supabase, existing!.id, payload)
      if (error) { setServerError(error); setLoading(false); return }
      onSaved()
      return
    }

    if (isEdit && hasSeries && editScope === 'future') {
      const { data: futureCls } = await listFutureSeriesClasses(supabase, existing!.series_id!)
      for (const fc of futureCls) {
        const startsAtForClass = new Date(fc.starts_at)
        const newStartsAt = new Date(payload.starts_at)
        startsAtForClass.setHours(newStartsAt.getHours(), newStartsAt.getMinutes(), 0, 0)
        const conflict = await checkConflicts(
          startsAtForClass.toISOString(),
          payload.duration_min,
          payload.hall_id,
          payload.trainer_id,
          fc.id,
        )
        if (conflict) {
          const dateStr = startsAtForClass.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
          setServerError(`${dateStr}: ${conflict}`)
          setLoading(false)
          return
        }
      }
      const { error } = await updateFutureSeriesClasses(supabase, existing!.series_id!, payload)
      if (error) { setServerError(error); setLoading(false); return }

      await updateSeries(supabase, existing!.series_id!, {
        ticket_type: values.ticket_type,
        trainer_id: values.trainer_id || null,
        hall_id: values.hall_id || null,
        duration_min: Number(values.duration_min),
        capacity: values.capacity ? Number(values.capacity) : null,
        title: values.title.trim() || null,
        notes: values.notes.trim() || null,
      })
      onSaved()
      return
    }

    if (!isSeries) {
      const conflict = await checkConflicts(payload.starts_at, payload.duration_min, payload.hall_id, payload.trainer_id)
      if (conflict) { setServerError(conflict); setLoading(false); return }
      const { error } = await insertClasses(supabase, [payload])
      if (error) { setServerError(error); setLoading(false); return }
      onSaved()
      return
    }

    const weeks = Number(values.weeks)
    const dayOfWeek = Number(values.day_of_week)
    const [hh, mm] = values.time_of_day.split(':').map(Number)
    const durationMin = Number(values.duration_min)
    const capacity = values.capacity ? Number(values.capacity) : null

    const { data: seriesData, error: seriesError } = await insertSeries(supabase, {
      ticket_type: values.ticket_type,
      trainer_id: values.trainer_id || null,
      hall_id: values.hall_id || null,
      title: values.title.trim() || null,
      notes: values.notes.trim() || null,
      capacity,
      duration_min: durationMin,
      day_of_week: dayOfWeek,
      time_of_day: values.time_of_day,
      type: 'series', // разова серія (DB-дефолт), не шаблон тижня
    })

    if (seriesError || !seriesData) {
      setServerError(seriesError ?? 'Помилка створення серії')
      setLoading(false)
      return
    }

    const seriesId = seriesData.id
    const firstDate = new Date(values.starts_at)
    const classes = []
    for (let i = 0; i < weeks; i++) {
      const d = new Date(firstDate)
      d.setDate(d.getDate() + i * 7)
      d.setHours(hh, mm, 0, 0)
      classes.push({
        ...payload,
        starts_at: d.toISOString(),
        series_id: seriesId,
      })
    }

    for (const cls of classes) {
      const conflict = await checkConflicts(cls.starts_at, cls.duration_min, cls.hall_id, cls.trainer_id)
      if (conflict) {
        await deleteSeries(supabase, seriesId)
        const dateStr = new Date(cls.starts_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
        setServerError(`${dateStr}: ${conflict}`)
        setLoading(false)
        return
      }
    }

    const { error: insertError } = await insertClasses(supabase, classes)
    if (insertError) {
      await deleteSeries(supabase, seriesId)
      setServerError(insertError)
      setLoading(false)
      return
    }

    onSaved()
  }

  // ── If editing a series class — show scope picker first ──────
  if (hasSeries && editScope === null) {
    return (
      <ModalShell
        title="Редагування заняття"
        onClose={onClose}
        footer={null}
      >
        <p className={styles.scopePrompt}>Це заняття входить до серії. Що змінити?</p>
        <div className={styles.scopeBtns}>
          <button type="button" className={styles.scopeBtn} onClick={() => setEditScope('this')}>
            <span className={styles.scopeTitle}>Тільки це заняття</span>
            <span className={styles.scopeDesc}>Зміни торкнуться лише цієї дати</span>
          </button>
          <button type="button" className={styles.scopeBtn} onClick={() => setEditScope('future')}>
            <span className={styles.scopeTitle}>Це і всі майбутні</span>
            <span className={styles.scopeDesc}>Зміни торкнуться цього і всіх наступних занять серії</span>
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <ModalShell
        title={isEdit
          ? editScope === 'future' ? 'Редагування серії' : 'Редагування заняття'
          : isSeries ? 'Нова серія занять' : 'Нове заняття'}
        onClose={onClose}
        footer={
          <ModalFooter
            onCancel={onClose}
            onSave={handleSubmit(onSubmit)}
            saveLabel={isSeries && !isEdit ? 'Створити серію' : 'Зберегти'}
            loading={loading}
            saveType="submit"
          />
        }
      >
        {/* Series toggle (only for new classes) */}
        {!isEdit && (
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${!isSeries ? styles.toggleActive : ''}`}
              onClick={() => setIsSeries(false)}
            >
              Одне заняття
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${isSeries ? styles.toggleActive : ''}`}
              onClick={() => setIsSeries(true)}
            >
              Серія
            </button>
          </div>
        )}

        <FormField id="cm-starts" label={isSeries ? 'Перше заняття' : 'Дата і час'} required error={errors.starts_at}>
          <Controller
            name="starts_at"
            control={control}
            rules={{ required: VM.required.field }}
            render={({ field }) => (
              <DateTimeInput
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={loading}
              />
            )}
          />
        </FormField>

        <FormField id="cm-type" label="Тип заняття" required error={errors.ticket_type}>
          <select id="cm-type" {...register('ticket_type', { required: VM.required.selectTypeShort })} disabled={loading}>
            {trainingTypes.map(t => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
        </FormField>

        <FormField id="cm-trainer" label="Тренер">
          <select id="cm-trainer" {...register('trainer_id')} disabled={loading}>
            <option value="">— без тренера —</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </FormField>

        <FormField id="cm-hall" label="Зал">
          <Controller
            name="hall_id"
            control={control}
            render={({ field }) => (
              <select id="cm-hall" value={field.value ?? ''} onChange={field.onChange} disabled={loading}>
                <option value="">— без залу —</option>
                {halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            )}
          />
        </FormField>

        <FormField id="cm-dur" label="Тривалість, хв" error={errors.duration_min}>
          <input
            id="cm-dur"
            type="number"
            inputMode="numeric"
            min={15}
            step={15}
            {...register('duration_min', { min: { value: 15, message: VM.invalid.durationMin }, valueAsNumber: true })}
            disabled={loading}
          />
        </FormField>

        {/* Series-specific fields */}
        {isSeries && !isEdit && (
          <>
            <FormField id="cm-dow" label="День тижня">
              <select id="cm-dow" {...register('day_of_week')} disabled={loading}>
                {DAY_OPTIONS.map(({ label, value }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </FormField>
            <FormField id="cm-weeks" label="Кількість тижнів" required error={errors.weeks}>
              <input
                id="cm-weeks"
                type="number"
                inputMode="numeric"
                min={1}
                max={52}
                {...register('weeks', { min: { value: 1, message: VM.invalid.weeksRange }, max: { value: 52, message: VM.invalid.weeksRange }, valueAsNumber: true })}
                disabled={loading}
              />
            </FormField>
          </>
        )}

        <FormField id="cm-cap" label="Ліміт місць">
          <input
            id="cm-cap"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Без ліміту"
            {...register('capacity')}
            disabled={loading}
          />
        </FormField>

        <FormField id="cm-title" label="Назва (опц.)">
          <input
            id="cm-title"
            type="text"
            placeholder="Кастомна назва"
            {...register('title')}
            disabled={loading}
          />
        </FormField>

        <FormField id="cm-notes" label="Нотатки">
          <textarea
            id="cm-notes"
            rows={2}
            placeholder="Додаткова інформація..."
            {...register('notes')}
            disabled={loading}
          />
        </FormField>

        {serverError && <p className={styles.error} role="alert">{serverError}</p>}
      </ModalShell>
    </form>
  )
}
