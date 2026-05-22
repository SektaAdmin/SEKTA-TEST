'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { ModalShell } from '@/components/ui/ModalShell'
import { VM } from '@/lib/validation-messages'
import type { TrainingType } from '@/types'
import styles from './TicketModal.module.css'


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
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([])
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    supabase
      .from('training_types')
      .select('id, code, label, is_active, sort_order, created_at')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }: { data: TrainingType[] | null }) => setTrainingTypes(data ?? []))
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
    <ModalShell
      title="Новий абонемент"
      onClose={onClose}
      footer={
        <>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>
        </>
      }
    >
      <div className={styles.field}>
        <label htmlFor="ticket-name">
          Назва <span className={styles.required}>*</span>
        </label>
        <input
          id="ticket-name"
          type="text"
          {...register('name', { required: VM.required.title })}
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
            validate: v => trainingTypes.some(t => t.code === v) || VM.required.selectType,
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
              required: VM.required.sessions,
              validate: v => {
                const n = parseInt(v, 10)
                if (isNaN(n) || n <= 0) return VM.invalid.sessionsPositive
                if (!Number.isInteger(n)) return VM.invalid.integerOnly
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
              required: VM.required.price,
              validate: v => {
                const n = parseInt(v, 10)
                if (isNaN(n) || n <= 0) return VM.invalid.pricePositive
                if (!Number.isInteger(n)) return VM.invalid.integerOnly
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
    </ModalShell>
  )
}
