'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { insertTicket } from '@/lib/queries/tickets'
import { listActiveTrainingTypes } from '@/lib/queries/training-types'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { FormField } from '@/components/ui/FormField'
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
  const [typesLoading, setTypesLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    listActiveTrainingTypes(supabase).then(({ data }) => {
      setTrainingTypes(data)
      setTypesLoading(false)
    })
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

    const { error: insertError } = await insertTicket(supabase, {
      name: data.name.trim(),
      ticket_type: data.ticket_type,
      sessions: sessionsNum,
      price: priceNum,
      is_active: true,
    })

    if (insertError) {
      setServerError(insertError)
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
        <ModalFooter
          onCancel={onClose}
          onSave={handleSubmit(onSubmit)}
          loading={loading}
        />
      }
    >
      <FormField id="ticket-name" label="Назва" required error={errors.name}>
        <input
          id="ticket-name"
          type="text"
          {...register('name', { required: VM.required.title })}
          placeholder="Групове Yoga 8 занять"
          disabled={loading}
        />
      </FormField>

      <FormField id="ticket-type" label="Тип" required error={errors.ticket_type}>
        {typesLoading ? (
          <div className="skeleton-bone" style={{ width: '100%', height: 'var(--control-h)' }} role="status" aria-label="Завантаження..." />
        ) : (
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
        )}
      </FormField>

      <div className={styles.row}>
        <FormField id="ticket-sessions" label="Кількість занять" required error={errors.sessions}>
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
        </FormField>

        <FormField id="ticket-price" label="Ціна (₴)" required error={errors.price}>
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
        </FormField>
      </div>

      {serverError && <p className={styles.error} role="alert">{serverError}</p>}
    </ModalShell>
  )
}
