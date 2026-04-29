'use client'
import { useState, useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase'
import { useModalFocus } from '@/hooks/useModalFocus'
import { formatClientName } from '@/lib/formatters'
import type { Client } from '@/types'
import styles from './BalanceAdjustModal.module.css'

const supabase = createClient()

const schema = z.object({
  amount: z.number().refine(v => v !== 0, 'Сума не може бути 0'),
  reason: z.string().min(1, "Причина обов'язкова"),
})

type FormValues = z.infer<typeof schema>

interface Props {
  client: Client
  onClose: () => void
  onSaved: () => void
}

export default function BalanceAdjustModal({ client, onClose, onSaved }: Props) {
  const titleId = useId()
  const modalRef = useModalFocus(onClose)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const currentBalance = client.balance ?? 0

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: 0, reason: '' },
  })

  const amount = watch('amount')
  const newBalance = currentBalance + (isNaN(amount) ? 0 : amount)

  const onSubmit = async (data: FormValues) => {
    setLoading(true)
    setError('')

    const { data: result, error: rpcError } = await supabase.rpc('update_client_balance', {
      p_client_id: client.id,
      p_amount: data.amount,
      p_transaction_type: 'admin_adjustment',
      p_description: data.reason.trim(),
      p_reason: null,
      p_related_sale_id: null,
    })

    if (rpcError || !result?.[0]?.success) {
      setError(rpcError?.message ?? result?.[0]?.error_message ?? 'Помилка коригування балансу')
      setLoading(false)
      return
    }

    onSaved()
  }

  const balanceClass =
    currentBalance > 0 ? styles.balancePos :
    currentBalance < 0 ? styles.balanceNeg :
    styles.balanceZero

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
          <h2 id={titleId}>Коригування балансу — {formatClientName(client)}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.currentBalance}>
            <span>Поточний баланс</span>
            <span className={`${styles.balanceValue} ${balanceClass}`}>
              {currentBalance > 0 ? '+' : ''}{currentBalance.toLocaleString('uk-UA')} ₴
            </span>
          </div>

          <div className={styles.field}>
            <label htmlFor="adj-amount">Сума коригування (₴)</label>
            <input
              id="adj-amount"
              type="number"
              step="1"
              {...register('amount', { valueAsNumber: true })}
              placeholder="+100 або -50"
              disabled={loading}
            />
            <span className={styles.hint}>Позитивне значення — поповнення, негативне — списання</span>
            {errors.amount && (
              <p className={styles.errorHint} role="alert">{errors.amount.message}</p>
            )}
          </div>

          {amount !== 0 && !isNaN(amount) && (
            <div className={`${styles.preview} ${amount > 0 ? styles.previewPos : styles.previewNeg}`}>
              {currentBalance.toLocaleString('uk-UA')} ₴
              {' '}{amount > 0 ? '+' : ''}{amount.toLocaleString('uk-UA')} ₴
              {' '}→ {newBalance.toLocaleString('uk-UA')} ₴
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="adj-reason">Причина <span style={{ color: 'var(--accent)' }}>*</span></label>
            <textarea
              id="adj-reason"
              rows={2}
              {...register('reason')}
              placeholder="Наприклад: виправлення помилки, поверненняа..."
              disabled={loading}
            />
            {errors.reason && (
              <p className={styles.errorHint} role="alert">{errors.reason.message}</p>
            )}
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Збереження...' : 'Застосувати'}
          </button>
        </div>
      </div>
    </div>
  )
}
