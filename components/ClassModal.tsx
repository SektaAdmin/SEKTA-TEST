'use client'
import { useState, useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import { isoToDatetimeLocal } from '@/lib/formatters'
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
  const titleId = useId()
  const modalRef = useModalFocus(onClose)

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
      supabase.from('trainers').select('id, name, is_active, instagram_username, telegram_username').eq('is_active', true).order('name'),
      supabase.from('halls').select('id, name, capacity, description, is_active').eq('is_active', true).order('name'),
      supabase.from('training_types').select('id, code, label, is_active, sort_order, created_at').eq('is_active', true).order('sort_order'),
    ]).then(([t, h, tt]) => {
      setTrainers((t.data ?? []) as Trainer[])
      setHalls((h.data ?? []) as Hall[])
      setTrainingTypes((tt.data ?? []) as TrainingType[])
    })
  }, [])

  const startsAt = existing ? new Date(existing.starts_at) : new Date()
  const defaultDayOfWeek = startsAt.getDay()
  const defaultTimeOfDay = existing ? isoToTimeLocal(existing.starts_at) : '10:00'

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
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

  async function checkConflicts(
    starts_at: string,
    duration_min: number,
    hall_id: string | null,
    trainer_id: string | null,
    exclude_id?: string,
  ): Promise<string | null> {
    if (!hall_id && !trainer_id) return null
    const { data } = await supabase.rpc('check_class_conflicts', {
      p_starts_at: starts_at,
      p_duration_min: duration_min,
      p_hall_id: hall_id ?? null,
      p_trainer_id: trainer_id ?? null,
      p_exclude_id: exclude_id ?? null,
    })
    if (!data || data.length === 0) return null
    const c = data[0]
    const when = new Date(c.starts_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
    const who = c.conflict_type === 'hall' ? 'Зал' : 'Тренер'
    const label = c.title || c.ticket_type
    return `${who} зайнятий — конфлікт із заняттям «${label}» о ${when}`
  }

  const onSubmit = async (values: FormValues) => {
    if (!scopeChosen) return
    setLoading(true)
    setServerError('')

    const payload = {
      ticket_type: values.ticket_type,
      trainer_id: values.trainer_id || null,
      hall_id: values.hall_id || null,
      starts_at: new Date(values.starts_at).toISOString(),
      duration_min: Number(values.duration_min),
      capacity: values.capacity ? Number(values.capacity) : null,
      title: values.title.trim() || null,
      notes: values.notes.trim() || null,
    }

    // ── Edit existing single class ────────────────────────────
    if (isEdit && (!hasSeries || editScope === 'this')) {
      const conflict = await checkConflicts(payload.starts_at, payload.duration_min, payload.hall_id, payload.trainer_id, existing!.id)
      if (conflict) { setServerError(conflict); setLoading(false); return }
      const { error } = await supabase.from('classes').update(payload).eq('id', existing!.id)
      if (error) { setServerError(error.message); setLoading(false); return }
      onSaved()
      return
    }

    // ── Edit all future in series ─────────────────────────────
    if (isEdit && hasSeries && editScope === 'future') {
      const now = new Date().toISOString()
      // Fetch all future non-cancelled classes in this series to check each for conflicts
      const { data: futureCls } = await supabase
        .from('classes')
        .select('id, starts_at')
        .eq('series_id', existing!.series_id)
        .gte('starts_at', now)
        .eq('is_cancelled', false)
      for (const fc of futureCls ?? []) {
        const startsAtForClass = new Date(fc.starts_at)
        // Use the new time from payload but keep original date shifted by series offset
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
      const { error } = await supabase
        .from('classes')
        .update(payload)
        .eq('series_id', existing!.series_id)
        .gte('starts_at', now)
        .eq('is_cancelled', false)
      if (error) { setServerError(error.message); setLoading(false); return }

      // update series template too
      const seriesPayload = {
        ticket_type: values.ticket_type,
        trainer_id: values.trainer_id || null,
        hall_id: values.hall_id || null,
        duration_min: Number(values.duration_min),
        capacity: values.capacity ? Number(values.capacity) : null,
        title: values.title.trim() || null,
        notes: values.notes.trim() || null,
      }
      await supabase.from('class_series').update(seriesPayload).eq('id', existing!.series_id)
      onSaved()
      return
    }

    // ── Create single class ───────────────────────────────────
    if (!isSeries) {
      const conflict = await checkConflicts(payload.starts_at, payload.duration_min, payload.hall_id, payload.trainer_id)
      if (conflict) { setServerError(conflict); setLoading(false); return }
      const { error } = await supabase.from('classes').insert(payload)
      if (error) { setServerError(error.message); setLoading(false); return }
      onSaved()
      return
    }

    // ── Create series ─────────────────────────────────────────
    const weeks = Number(values.weeks)
    const dayOfWeek = Number(values.day_of_week)
    const [hh, mm] = values.time_of_day.split(':').map(Number)
    const durationMin = Number(values.duration_min)
    const capacity = values.capacity ? Number(values.capacity) : null

    // insert class_series row
    const { data: seriesData, error: seriesError } = await supabase
      .from('class_series')
      .insert({
        ticket_type: values.ticket_type,
        trainer_id: values.trainer_id || null,
        hall_id: values.hall_id || null,
        title: values.title.trim() || null,
        notes: values.notes.trim() || null,
        capacity,
        duration_min: durationMin,
        day_of_week: dayOfWeek,
        time_of_day: values.time_of_day,
      })
      .select('id')
      .single()

    if (seriesError || !seriesData) {
      setServerError(seriesError?.message ?? 'Помилка створення серії')
      setLoading(false)
      return
    }

    const seriesId = seriesData.id

    // generate N classes
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

    // Check conflicts for each class in the series before inserting
    for (const cls of classes) {
      const conflict = await checkConflicts(cls.starts_at, cls.duration_min, cls.hall_id, cls.trainer_id)
      if (conflict) {
        await supabase.from('class_series').delete().eq('id', seriesId)
        const dateStr = new Date(cls.starts_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
        setServerError(`${dateStr}: ${conflict}`)
        setLoading(false)
        return
      }
    }

    const { error: insertError } = await supabase.from('classes').insert(classes)
    if (insertError) {
      // rollback series row
      await supabase.from('class_series').delete().eq('id', seriesId)
      setServerError(insertError.message)
      setLoading(false)
      return
    }

    onSaved()
  }

  // ── If editing a series class — show scope picker first ──────
  if (hasSeries && editScope === null) {
    return (
      <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className={styles.header}>
            <h2 id={titleId}>Редагування заняття</h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
          </div>
          <div className={styles.body}>
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
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId}>
            {isEdit
              ? editScope === 'future' ? 'Редагування серії' : 'Редагування заняття'
              : isSeries ? 'Нова серія занять' : 'Нове заняття'}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={styles.body}>

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

            <div className={styles.field}>
              <label htmlFor="cm-type">Тип заняття <span className={styles.required}>*</span></label>
              <select id="cm-type" {...register('ticket_type', { required: true })} disabled={loading}>
                {trainingTypes.map(t => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="cm-trainer">Тренер</label>
                <select id="cm-trainer" {...register('trainer_id')} disabled={loading}>
                  <option value="">— без тренера —</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="cm-hall">Зал</label>
                <select id="cm-hall" {...register('hall_id')} disabled={loading}>
                  <option value="">— без залу —</option>
                  {halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            </div>

            {/* Date/time — single class or first occurrence */}
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="cm-starts">
                  {isSeries ? 'Перше заняття' : 'Дата і час'}
                  {' '}<span className={styles.required}>*</span>
                </label>
                <input
                  id="cm-starts"
                  type="datetime-local"
                  {...register('starts_at', { required: "Обов'язкове поле" })}
                  disabled={loading}
                />
                {errors.starts_at && <p className={styles.errorHint}>{errors.starts_at.message}</p>}
              </div>
              <div className={styles.field}>
                <label htmlFor="cm-dur">Тривалість, хв</label>
                <input
                  id="cm-dur"
                  type="number"
                  min={15}
                  step={15}
                  {...register('duration_min', { min: 15, valueAsNumber: true })}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Series-specific fields */}
            {isSeries && !isEdit && (
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="cm-dow">День тижня</label>
                  <select id="cm-dow" {...register('day_of_week')} disabled={loading}>
                    {DAY_OPTIONS.map(({ label, value }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="cm-weeks">Кількість тижнів <span className={styles.required}>*</span></label>
                  <input
                    id="cm-weeks"
                    type="number"
                    min={1}
                    max={52}
                    {...register('weeks', { min: 1, max: 52, valueAsNumber: true })}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="cm-cap">Ліміт місць</label>
                <input
                  id="cm-cap"
                  type="number"
                  min={1}
                  placeholder="Без ліміту"
                  {...register('capacity')}
                  disabled={loading}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="cm-title">Назва (опц.)</label>
                <input
                  id="cm-title"
                  type="text"
                  placeholder="Кастомна назва"
                  {...register('title')}
                  disabled={loading}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="cm-notes">Нотатки</label>
              <textarea
                id="cm-notes"
                rows={2}
                placeholder="Додаткова інформація..."
                {...register('notes')}
                disabled={loading}
              />
            </div>

            {serverError && <p className={styles.error} role="alert">{serverError}</p>}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={loading}>
              Скасувати
            </button>
            <button type="submit" className={styles.btnSave} disabled={loading}>
              {loading
                ? 'Збереження...'
                : isSeries && !isEdit
                  ? `Створити серію`
                  : 'Зберегти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
