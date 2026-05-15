'use client'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import type { ClassSeries, Trainer, Hall, TrainingType } from '@/types'
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

interface Props {
  existing?: ClassSeries | null
  onClose: () => void
  onSaved: () => void
  trainers: Trainer[]
  halls: Hall[]
  trainingTypes: TrainingType[]
}

export default function SeriesModal({ existing, onClose, onSaved, trainers, halls, trainingTypes }: Props) {
  const isEdit = !!existing

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
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
      hall_id: '',
      day_of_week: '1',
      time_of_day: '10:00',
      duration_min: 60,
      capacity: '',
      title: '',
      notes: '',
    },
  })

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
      const { error } = await supabase.from('class_series').update(payload).eq('id', existing!.id)
      if (error) { alert(error.message); return }
    } else {
      const { error } = await supabase.from('class_series').insert(payload)
      if (error) { alert(error.message); return }
    }

    onSaved()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <ModalShell
        title={isEdit ? 'Редагувати шаблон' : 'Новий шаблон'}
        onClose={onClose}
        width={480}
        footer={
          <>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={isSubmitting}>
              Скасувати
            </button>
            <button type="submit" className={styles.btnSave} disabled={isSubmitting}>
              {isSubmitting ? 'Збереження...' : isEdit ? 'Зберегти' : 'Створити'}
            </button>
          </>
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
      </ModalShell>
    </form>
  )
}
