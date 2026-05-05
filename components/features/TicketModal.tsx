'use client'
import { useState, useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import Button from '@/components/ui/Button'
import type { TrainingType } from '@/types'

const supabase = createClient()

const inputCls = 'w-full px-3 py-2 bg-[var(--bg-3)] border border-[0.5px] border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text)] text-[13px] font-[var(--font)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--text-3)] focus:border-[var(--accent)] disabled:opacity-50'
const labelCls = 'text-[11px] text-[var(--text-2)] uppercase tracking-[0.04em]'
const errorHintCls = 'text-[11px] text-[var(--danger)] mt-0.5'

interface TicketFormValues {
  name: string
  ticket_type: string
  sessions: string
  price: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function TicketModal({ onClose, onSaved }: Props) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([])
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    supabase
      .from('training_types')
      .select('id, code, label, is_active, sort_order, created_at')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setTrainingTypes((data ?? []) as TrainingType[]))
  }, [])

  const { register, handleSubmit, formState: { errors } } = useForm<TicketFormValues>({
    defaultValues: { name: '', ticket_type: '', sessions: '', price: '' },
  })

  const onSubmit = async (data: TicketFormValues) => {
    setLoading(true)
    setServerError('')
    const { error: insertError } = await supabase.from('tickets').insert({
      name: data.name.trim(),
      ticket_type: data.ticket_type,
      sessions: parseInt(data.sessions, 10),
      price: parseInt(data.price, 10),
      is_active: true,
    })
    if (insertError) { setServerError(insertError.message); setLoading(false); return }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className="flex flex-col w-[420px] max-h-[90vh] bg-[var(--bg-2)] border border-[0.5px] border-[var(--border-hover)] rounded-[var(--radius)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between px-5 py-[18px] border-b border-[0.5px] border-[var(--border)]">
          <h2 id={titleId} className="text-[14px] font-medium text-[var(--text)] m-0">Новий абонемент</h2>
          <button onClick={onClose} aria-label="Закрити" className="border-none bg-transparent text-[var(--text-3)] cursor-pointer text-[14px] leading-none p-[2px] transition-colors duration-[120ms] hover:text-[var(--text)]">✕</button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-name" className={labelCls}>Назва <span className="text-[var(--danger)]">*</span></label>
            <input id="ticket-name" type="text" className={inputCls} {...register('name', { required: "Назва обов'язкова" })} placeholder="Групове Yoga 8 занять" disabled={loading} />
            {errors.name && <p className={errorHintCls} role="alert">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-type" className={labelCls}>Тип <span className="text-[var(--danger)]">*</span></label>
            <select
              id="ticket-type"
              className={`${inputCls} cursor-pointer`}
              {...register('ticket_type', { validate: v => trainingTypes.some(t => t.code === v) || 'Оберіть тип абонементу' })}
              disabled={loading}
            >
              <option value="">— Оберіть тип —</option>
              {trainingTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            {errors.ticket_type && <p className={errorHintCls} role="alert">{errors.ticket_type.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ticket-sessions" className={labelCls}>Кількість занять <span className="text-[var(--danger)]">*</span></label>
              <input
                id="ticket-sessions" type="number" min={1} step={1} className={inputCls}
                {...register('sessions', {
                  required: "Кількість занять обов'язкова",
                  validate: v => { const n = parseInt(v, 10); if (isNaN(n) || n <= 0) return 'Кількість занять > 0'; if (!Number.isInteger(n)) return 'Тільки ціле число'; return true },
                })}
                placeholder="8" disabled={loading}
              />
              {errors.sessions && <p className={errorHintCls} role="alert">{errors.sessions.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="ticket-price" className={labelCls}>Ціна (₴) <span className="text-[var(--danger)]">*</span></label>
              <input
                id="ticket-price" type="number" min={1} step={1} className={inputCls}
                {...register('price', {
                  required: "Ціна обов'язкова",
                  validate: v => { const n = parseInt(v, 10); if (isNaN(n) || n <= 0) return 'Ціна > 0'; if (!Number.isInteger(n)) return 'Тільки ціле число'; return true },
                })}
                placeholder="2400" disabled={loading}
              />
              {errors.price && <p className={errorHintCls} role="alert">{errors.price.message}</p>}
            </div>
          </div>

          {serverError && <p className="text-[12px] text-[var(--danger)] bg-[var(--danger-dim)] px-3 py-2 rounded-[var(--radius-sm)]" role="alert">{serverError}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[0.5px] border-[var(--border)]">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Скасувати</Button>
          <Button variant="primary" onClick={handleSubmit(onSubmit)} loading={loading}>Зберегти</Button>
        </div>
      </div>
    </div>
  )
}
