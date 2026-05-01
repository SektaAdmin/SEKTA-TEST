'use client'
import { useState, useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import type { TrainingType } from '@/types'
import styles from './TicketModal.module.css'

const supabase = createClient()

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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TicketFormValues>({
    defaultValues: { name: '', ticket_type: '', sessions: '', price: '' },
  })

  const onSubmit = async (data: TicketFormValues) => {
    setLoading(true)
    setServerError('')

    const sessionsNum = parseInt(data.sessions, 10)
    const priceNum = parseInt(data.price, 10)

    const { error: insertError } = await supabase.from('tickets').insert({
      name: data.name.trim(),
      ticket_type: data.ticket_type,
      sessions: sessionsNum,
      price: priceNum,
      is_active: true,
    })

    if (insertError) {
      setServerError(insertError.message)
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
          <h2 id={titleId}>Новий абонемент</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label htmlFor="ticket-name">
              Назва <span className={styles.required}>*</span>
            </label>
            <input
              id="ticket-name"
              type="text"
              {...register('name', { required: 'Назва обов\'язкова' })}
              placeholder="Групове Yoga 8 занять"
              disabled={loading}
            />
            {errors.name && (
              <p className={styles.errorHint} role="alert">{errors.name.message}</p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="ticket-type">
              Тип <span className={styles.required}>*</span>
            </label>
            <select
              id="ticket-type"
              {...register('ticket_type', {
                validate: v => trainingTypes.some(t => t.code === v) || 'Оберіть тип абонементу',
              })}
              disabled={loading}
            >
              <option value="">— Оберіть тип —</option>
              {trainingTypes.map(t => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
            {errors.ticket_type && (
              <p className={styles.errorHint} role="alert">{errors.ticket_type.message}</p>
            )}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="ticket-sessions">
                Кількість занять <span className={styles.required}>*</span>
              </label>
              <input
                id="ticket-sessions"
                type="number"
                min={1}
                step={1}
                {...register('sessions', {
                  required: 'Кількість занять обов\'язкова',
                  validate: v => {
                    const n = parseInt(v, 10)
                    if (isNaN(n) || n <= 0) return 'Кількість занять > 0'
                    if (!Number.isInteger(n)) return 'Тільки ціле число'
                    return true
                  },
                })}
                placeholder="8"
                disabled={loading}
              />
              {errors.sessions && (
                <p className={styles.errorHint} role="alert">{errors.sessions.message}</p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="ticket-price">
                Ціна (₴) <span className={styles.required}>*</span>
              </label>
              <input
                id="ticket-price"
                type="number"
                min={1}
                step={1}
                {...register('price', {
                  required: 'Ціна обов\'язкова',
                  validate: v => {
                    const n = parseInt(v, 10)
                    if (isNaN(n) || n <= 0) return 'Ціна > 0'
                    if (!Number.isInteger(n)) return 'Тільки ціле число'
                    return true
                  },
                })}
                placeholder="2400"
                disabled={loading}
              />
              {errors.price && (
                <p className={styles.errorHint} role="alert">{errors.price.message}</p>
              )}
            </div>
          </div>

          {serverError && <p className={styles.error} role="alert">{serverError}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  )
}
