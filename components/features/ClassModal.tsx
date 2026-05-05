'use client'
import { useState, useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import { isoToDatetimeLocal } from '@/lib/formatters'
import Button from '@/components/ui/Button'
import type { Class, Trainer, Hall, TrainingType } from '@/types'

const supabase = createClient()

const inputCls = 'w-full px-3 py-[9px] bg-[var(--bg-3)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text)] text-[13px] outline-none transition-colors duration-150 placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:opacity-50'
const labelCls = 'text-[11px] text-[var(--text-2)] tracking-[0.04em] uppercase'

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
      ticket_type: '', trainer_id: '', hall_id: '', starts_at: todayAt10(),
      duration_min: 60, capacity: '', title: '', notes: '',
    },
  })

  useEffect(() => {
    if (!existing && trainingTypes.length > 0) setValue('ticket_type', trainingTypes[0].code)
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

    if (error) { setServerError(error.message); setLoading(false); return }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className="flex flex-col w-[460px] max-h-[90vh] bg-[var(--bg-2)] border border-[0.5px] border-[var(--border-hover)] rounded-[var(--radius)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[0.5px] border-[var(--border)]">
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--text)] m-0">
            {existing ? 'Редагування заняття' : 'Нове заняття'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрити" className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors text-[16px] leading-none cursor-pointer bg-transparent border-none">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cm-type" className={labelCls}>Тип заняття <span className="text-[var(--danger)]">*</span></label>
              <select id="cm-type" className={`${inputCls} cursor-pointer`} {...register('ticket_type', { required: true })} disabled={loading}>
                {trainingTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cm-trainer" className={labelCls}>Тренер</label>
                <select id="cm-trainer" className={`${inputCls} cursor-pointer`} {...register('trainer_id')} disabled={loading}>
                  <option value="">— без тренера —</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cm-hall" className={labelCls}>Зал</label>
                <select id="cm-hall" className={`${inputCls} cursor-pointer`} {...register('hall_id')} disabled={loading}>
                  <option value="">— без залу —</option>
                  {halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cm-starts" className={labelCls}>Дата і час <span className="text-[var(--danger)]">*</span></label>
                <input id="cm-starts" type="datetime-local" className={inputCls} {...register('starts_at', { required: "Обов'язкове поле" })} disabled={loading} />
                {errors.starts_at && <p className="text-[11px] text-[var(--danger)] mt-0.5">{errors.starts_at.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cm-dur" className={labelCls}>Тривалість, хв</label>
                <input id="cm-dur" type="number" min={15} step={15} className={inputCls} {...register('duration_min', { min: 15, valueAsNumber: true })} disabled={loading} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cm-cap" className={labelCls}>Ліміт місць</label>
                <input id="cm-cap" type="number" min={1} className={inputCls} placeholder="Без ліміту" {...register('capacity')} disabled={loading} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cm-title" className={labelCls}>Назва (опц.)</label>
                <input id="cm-title" type="text" className={inputCls} placeholder="Кастомна назва" {...register('title')} disabled={loading} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cm-notes" className={labelCls}>Нотатки</label>
              <textarea id="cm-notes" rows={2} className={`${inputCls} resize-y font-[var(--font)] leading-[1.4]`} placeholder="Додаткова інформація..." {...register('notes')} disabled={loading} />
            </div>

            {serverError && <p className="text-[12px] text-[var(--danger)] bg-[var(--danger-dim)] px-3 py-2 rounded-[var(--radius-sm)]" role="alert">{serverError}</p>}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-[0.5px] border-[var(--border)]">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Скасувати</Button>
            <Button type="submit" variant="primary" loading={loading}>Зберегти</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
