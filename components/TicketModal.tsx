'use client'
import { useState, useRef, useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase'
import styles from './TicketModal.module.css'

const VALID_TICKET_TYPES = [
  'group',
  'individual',
  'hallrental',
  'smallhallrental',
  'individualduo',
  'individualtrio',
  'pylonrental',
  'striprental',
]

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
  const modalRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TicketFormValues>({
    defaultValues: { name: '', ticket_type: '', sessions: '', price: '' },
  })

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    modal.querySelector<HTMLElement>(
      'input:not(:disabled), select:not(:disabled), button:not(:disabled)'
    )?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab') return

      const focusable = Array.from((modal as HTMLDivElement).querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const onSubmit = async (data: TicketFormValues) => {
    setLoading(true)
    setServerError('')

    const sessionsNum = parseInt(data.sessions, 10)
    const priceNum = parseInt(data.price, 10)

    const supabase = createClient()
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
                validate: v => VALID_TICKET_TYPES.includes(v) || 'Оберіть тип абонементу',
              })}
              disabled={loading}
            >
              <option value="">— Оберіть тип —</option>
              {VALID_TICKET_TYPES.map(value => (
                <option key={value} value={value}>{value}</option>
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
