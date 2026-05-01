'use client'
import { useState, useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import { isoToDatetimeLocal } from '@/lib/formatters'
import type { Class, Trainer, Hall, TrainingType } from '@/types'
import styles from './ClassModal.module.css'

const supabase = createClient()

interface FormValues {
  ticket_type: string
  trainer_id: string
  hall_id: string
  starts_at: string
  duration_min: number
  capacity: string
  title: string
  notes: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
  existing?: Class | null
}

function todayAt10(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`
}

export default function ClassModal({ onClose, onSaved, existing }: Props) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)

  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [halls, setHalls] = useState<Hall[]>([])
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([])
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

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

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: existing ? {
      ticket_type: existing.ticket_type,
      trainer_id: existing.trainer_id ?? '',
      hall_id: existing.hall_id ?? '',
      starts_at: isoToDatetimeLocal(existing.starts_at),
      duration_min: existing.duration_min,
      capacity: existing.capacity?.toString() ?? '',
      title: existing.title ?? '',
      notes: existing.notes ?? '',
    } : {
      ticket_type: '',
      trainer_id: '',
      hall_id: '',
      starts_at: todayAt10(),
      duration_min: 60,
      capacity: '',
      title: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (!existing && trainingTypes.length > 0) {
      setValue('ticket_type', trainingTypes[0].code)
    }
  }, [trainingTypes, existing, setValue])

  const onSubmit = async (values: FormValues) => {
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

    const { error } = existing
      ? await supabase.from('classes').update(payload).eq('id', existing.id)
      : await supabase.from('classes').insert(payload)

    if (error) {
      setServerError(error.message)
      setLoading(false)
      return
    }
    onSaved()
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
          <h2 id={titleId}>{existing ? 'Редагування заняття' : 'Нове заняття'}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={styles.body}>
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

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="cm-starts">Дата і час <span className={styles.required}>*</span></label>
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
              {loading ? 'Збереження...' : 'Зберегти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
